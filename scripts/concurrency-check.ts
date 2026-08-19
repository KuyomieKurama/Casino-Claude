/**
 * Nebenläufigkeitsnachweis gegen ECHTES PostgreSQL (Auftrag Phase 3a, §2 und §8).
 *
 * Verbindlich laut Auftrag: PGlite serialisiert Transaktionen intern (ein einzelner
 * WASM-Prozess) und kann echte Wettläufe zwischen mehreren, tatsächlich gleichzeitigen
 * Datenbankverbindungen NICHT reproduzieren — `Promise.all([...])` gegen PGlite beweist also
 * nichts über die WHERE-Bedingung des bedingten UPDATEs, weil PGlite die Anfragen ohnehin
 * nacheinander abarbeitet. Dieses Skript läuft deshalb bewusst als eigenständiger Prozess gegen
 * die reale, über DATABASE_URL erreichbare PostgreSQL-Instanz (docker compose up -d), mit einem
 * echten `pg`-Verbindungs-Pool, der mehrere Anfragen tatsächlich parallel verschickt.
 *
 * Eigenständig statt Teil der Vitest-Suite, aus demselben Grund wie server/seed/run-seed.ts:
 * kein Test soll implizit Docker/eine externe Datenbank voraussetzen, damit `npm test` weiterhin
 * ohne weitere Vorbedingungen läuft. Ausführung: `npm run check:concurrency` (siehe
 * package.json), Voraussetzung: `docker compose up -d` und angewendete Migrationen
 * (`npm run db:migrate`).
 *
 * Ausnahme vom `process.env`-Verbot (siehe eslint.config.mjs) und vom `server-only`-Import
 * (server/db/client.ts, server/auth/*): dieselbe Begründung wie in server/seed/run-seed.ts —
 * ein eigenständiges, mit `node` gestartetes Skript durchläuft den Next.js-Webpack-Loader nicht,
 * der `server-only` sonst aufzulösen weiß. Deshalb eine eigene, kurzlebige Verbindung statt des
 * Singletons aus server/db/client.ts.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as authSchema from "../server/db/auth-schema";
import * as catalogSchema from "../server/db/schema";
import type { EngineKey } from "../server/db/enums";
import { PgGameModeRepository } from "../server/repositories/game-mode-repository";
import { debitForStake, findWallet, insertWalletIfMissing } from "../server/repositories/wallet-repository";
import { sumLedgerAmountForUser } from "../server/repositories/ledger-repository";
import { insertOpenRound } from "../server/repositories/game-round-repository";
import { findActionsForRound } from "../server/repositories/game-round-action-repository";
import { listLedgerEntries } from "../server/repositories/ledger-repository";
import { startNonInteractiveRound } from "../server/rounds/round-service";
import { startInteractiveRound } from "../server/rounds/interactive-round-service";
import { applyRoundAction } from "../server/rounds/round-action-service";
import { START_BALANCE_MINOR } from "../lib/constants";

const schema = { ...catalogSchema, ...authSchema };
type Db = ReturnType<typeof drizzle<typeof schema>>;

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  const hasValidProtocol = typeof value === "string" && (value.startsWith("postgres://") || value.startsWith("postgresql://"));
  if (!hasValidProtocol) {
    throw new Error(
      "DATABASE_URL fehlt oder hat ein ungültiges Protokoll. Was tun: `docker compose up -d`, dann " +
        "eine PostgreSQL-Verbindung setzen, z. B. postgresql://user:passwort@localhost:5432/velora " +
        "(siehe .env.example), und `npm run db:migrate` einmal ausführen.",
    );
  }
  return value;
}

let counter = 0;
function uniqueId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

async function seedCatalogFixture(db: Db, modeId: string, engineKey: EngineKey = "dice"): Promise<void> {
  const providerId = uniqueId("provider");
  const gameId = uniqueId("game");
  await db.insert(catalogSchema.provider).values({ id: providerId, name: "Nebenläufigkeitstest" });
  await db.insert(catalogSchema.game).values({
    id: gameId,
    slug: gameId,
    name: "Nebenläufigkeitstest",
    category: "arcade",
    providerId,
    description: "Nur für den Nebenläufigkeitsnachweis.",
    status: "active",
    releasedAt: new Date(),
    popularityScore: 0,
    sortOrder: 0,
  });
  const modeRepo = new PgGameModeRepository(db);
  await modeRepo.upsert({
    id: modeId,
    gameId,
    key: "standard",
    label: "Standard",
    kind: "variant",
    engineKey,
    paytableKey: null,
    minBetMinor: 1,
    maxBetMinor: 1_000_000,
    isLivePresentation: false,
    isDefault: true,
    sortOrder: 0,
    status: "active",
  });
}

/**
 * Test A — der eigentlich kritische Nachweis (Auftrag §8): N gleichzeitige Einsätze auf ein
 * Guthaben, das nur für N/2 reicht. Direkt auf `debitForStake` (das bedingte UPDATE), nicht über
 * den vollen Rundenservice — eine Runde bucht am Ende auch eine Rückgabe gut, was die Bilanz
 * verändern und die erwartete Zahl "genau N/2" verwässern würde. Dieser Test isoliert exakt den
 * Mechanismus, der laut Auftrag nur gegen echtes PostgreSQL beweiskräftig ist.
 */
async function checkFundExhaustion(db: Db): Promise<boolean> {
  console.log("\n=== Test A: N gleichzeitige Einsätze auf ein Guthaben, das nur für N/2 reicht ===");
  console.log("(server/repositories/wallet-repository.ts::debitForStake, bedingtes UPDATE)");

  const userId = uniqueId("user-a");
  await db.insert(authSchema.user).values({ id: userId, name: "Test A", email: `${userId}@example.com` });
  const stakeMinor = 1_000;
  const n = 20;
  const startBalance = (n / 2) * stakeMinor;
  await insertWalletIfMissing(db, userId, startBalance);

  const results = await Promise.all(Array.from({ length: n }, () => debitForStake(db, userId, { fromBonusMinor: 0, fromBalanceMinor: stakeMinor })));
  const successCount = results.filter((r) => r.ok).length;
  const wallet = await findWallet(db, userId);
  const ledgerSum = await sumLedgerAmountForUser(db, userId); // 0 erwartet: dieser Test bucht keine Ledger-Einträge, nur Wallet-UPDATEs.

  console.log(`Startguthaben: ${startBalance} Minor, Einsatz je Versuch: ${stakeMinor} Minor, Versuche: ${n}.`);
  console.log(`Erwartet: genau ${n / 2} erfolgreiche Buchungen, Saldo danach 0.`);
  console.log(`Tatsächlich: ${successCount} erfolgreich, ${n - successCount} abgelehnt, Saldo danach ${wallet?.balanceMinor}.`);

  const ok = successCount === n / 2 && wallet?.balanceMinor === 0 && (wallet?.balanceMinor ?? -1) >= 0;
  console.log(ok ? "ERGEBNIS: BESTANDEN" : "ERGEBNIS: FEHLGESCHLAGEN");
  console.log(`(Ledger-Summe zur Kontrolle: ${ledgerSum} — dieser Test bucht bewusst keine Ledger-Einträge.)`);
  return ok;
}

/**
 * Test B: zwei gleichzeitige Rundenstarts → genau eine offene Runde (partieller Unique-Index
 * `game_round_user_open_unique`, server/db/schema.ts). Direkt auf `insertOpenRound`, weil der
 * volle Rundenservice nicht-interaktive Runden innerhalb derselben Transaktion sofort abschließt
 * (siehe server/rounds/round-service.ts) — das Fenster für eine zweite ECHTE gleichzeitig offene
 * Runde existiert dort praktisch nicht mehr. Dieser Test prüft den Datenbank-Constraint direkt,
 * der auch künftige, länger offene interaktive Runden (Phase 3b) tragen wird.
 */
async function checkOpenRoundRace(db: Db): Promise<boolean> {
  console.log("\n=== Test B: zwei gleichzeitige Rundenstarts → genau eine offene Runde ===");
  console.log("(server/repositories/game-round-repository.ts::insertOpenRound, partieller Unique-Index)");

  const userId = uniqueId("user-b");
  const modeId = uniqueId("mode-b");
  await db.insert(authSchema.user).values({ id: userId, name: "Test B", email: `${userId}@example.com` });
  await seedCatalogFixture(db, modeId);

  const [a, b] = await Promise.all([
    insertOpenRound(db, { id: uniqueId("round"), userId, gameModeId: modeId, stakeMinor: 100, seed: 1, maxReturnMinor: 300, idempotencyKey: uniqueId("idem"), transcript: {} }),
    insertOpenRound(db, { id: uniqueId("round"), userId, gameModeId: modeId, stakeMinor: 100, seed: 2, maxReturnMinor: 300, idempotencyKey: uniqueId("idem"), transcript: {} }),
  ]);
  const successCount = [a, b].filter((r) => r !== null).length;

  console.log(`Erwartet: genau 1 offene Runde von 2 gleichzeitigen Versuchen.`);
  console.log(`Tatsächlich: ${successCount} offene Runde(n) angelegt.`);
  const ok = successCount === 1;
  console.log(ok ? "ERGEBNIS: BESTANDEN" : "ERGEBNIS: FEHLGESCHLAGEN");
  return ok;
}

/**
 * Test C: mehrere VOLLSTÄNDIGE Rundenstarts über den echten Rundenservice gleichzeitig — der
 * realistische Fall (Doppelklick, mehrere Tabs). Da jede Runde am Ende auch eine Rückgabe
 * gutschreibt, ist "genau N/2" hier keine sinnvolle Erwartung mehr; geprüft werden die
 * unverletzlichen Invarianten: Saldo nie negativ, Ledger-Summe entspricht dem Saldo, JEDER
 * Versuch bekommt eine eindeutige, konsistente Antwort (kein Absturz, kein Teilzustand).
 */
async function checkFullRoundConcurrency(db: Db): Promise<boolean> {
  console.log("\n=== Test C: mehrere vollständige Rundenstarts über den Rundenservice gleichzeitig ===");
  console.log("(server/rounds/round-service.ts::startNonInteractiveRound, realistischer Fall)");

  const userId = uniqueId("user-c");
  const modeId = uniqueId("mode-c");
  await db.insert(authSchema.user).values({ id: userId, name: "Test C", email: `${userId}@example.com` });
  await seedCatalogFixture(db, modeId);
  const stakeMinor = 100;
  const n = 10;

  const results = await Promise.all(
    Array.from({ length: n }, (_, i) => startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor, idempotencyKey: uniqueId(`k${i}`), betId: "under-50" })),
  );
  const successCount = results.filter((r) => r.ok).length;
  const wallet = await findWallet(db, userId);
  const ledgerSum = await sumLedgerAmountForUser(db, userId);

  console.log(`${successCount} von ${n} gleichzeitigen Rundenstarts erfolgreich (Startguthaben deckt alle ${n} Einsätze).`);
  console.log(`Saldo danach: ${wallet?.balanceMinor}, Ledger-Summe: ${ledgerSum}.`);
  const ok = successCount === n && (wallet?.balanceMinor ?? -1) >= 0 && ledgerSum === (wallet?.balanceMinor ?? -1);
  console.log(ok ? "ERGEBNIS: BESTANDEN" : "ERGEBNIS: FEHLGESCHLAGEN");
  return ok;
}

/**
 * Test D (Phase 3b, Auftrag §8): zwei gleichzeitige Spieleraktionen auf DERSELBEN interaktiven
 * Runde (Blackjack, "double" — beide Versuche wollen als Erste die Position seq=1 belegen, wie
 * ein Doppelklick oder zwei offene Tabs). `SELECT … FOR UPDATE` auf `game_round`
 * (game-round-repository.ts::findRoundForUpdate) serialisiert die beiden Transaktionen — der
 * Zusatzeinsatz darf höchstens EINMAL gebucht werden, der zweite Versuch muss sauber abgelehnt
 * werden (kein Absturz, kein Teilzustand, kein doppelter Ledger-Eintrag).
 *
 * Natürlicher Blackjack schließt "double" aus (die Runde ist dann schon fertig) — bei einem
 * echten, ungemockten Seed lässt sich das nicht vorab erzwingen, deshalb ein kleiner Retry über
 * mehrere frische Runden, bis ein Versuchspaar tatsächlich um dieselbe Position konkurriert.
 */
async function checkInteractiveActionRace(db: Db): Promise<boolean> {
  console.log("\n=== Test D: zwei gleichzeitige Aktionen (Blackjack „double\") auf derselben Runde ===");
  console.log("(server/rounds/round-action-service.ts::applyRoundAction, game-round-repository.ts::findRoundForUpdate)");

  for (let attempt = 0; attempt < 8; attempt++) {
    // Eigenes Konto je Versuch (statt eines über alle Versuche geteilten): ein vorheriger,
    // verworfener Versuch (natürlicher Blackjack, der bereits Einsatz und Auszahlung gebucht
    // hätte) darf den erwarteten Saldo des NÄCHSTEN Versuchs nicht verfälschen.
    const userId = uniqueId(`user-d${attempt}`);
    await db.insert(authSchema.user).values({ id: userId, name: "Test D", email: `${userId}@example.com` });
    const modeId = uniqueId(`mode-d${attempt}`);
    await seedCatalogFixture(db, modeId, "blackjack");
    const stakeMinor = 100;
    const started = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor, idempotencyKey: uniqueId(`start-d${attempt}`) });
    if (!started.ok || started.data.status !== "open") continue; // natürlicher Blackjack — neue Runde versuchen

    const roundId = started.data.roundId;
    const [a, b] = await Promise.all([
      applyRoundAction(db, { userId, roundId, seq: 1, action: "double", payload: {} }),
      applyRoundAction(db, { userId, roundId, seq: 1, action: "double", payload: {} }),
    ]);
    if (!a.ok && !b.ok) continue; // beide abgelehnt (z. B. Guthaben) — neue Runde versuchen, kein Nachweis

    const successCount = [a, b].filter((r) => r.ok).length;
    const actions = await findActionsForRound(db, roundId);
    // Zwei bet-Buchungen mit dieser roundId sind KORREKT: die eine aus dem Rundenstart
    // (Grundeinsatz) plus höchstens eine weitere aus "double" — nicht "genau 1", wie ein naiver
    // Filter nahelegen würde. Der belastbare Nachweis ist der SALDO: er darf nur um genau
    // Grundeinsatz + EINEN Zusatzeinsatz gesunken sein, nie um zwei Zusatzeinsätze.
    const bookings = (await listLedgerEntries(db, userId, 20)).filter((e) => e.roundId === roundId && e.type === "bet");
    const wallet = await findWallet(db, userId);
    // "double" deckt beim Einzelblatt eine Karte auf und beendet die Hand sofort (unveränderte
    // Fachlogik, components/game/engine/blackjack/blackjack-logic.ts) — der Ausgang (Sieg,
    // Niederlage, Push) hängt vom ECHTEN, hier bewusst ungemockten Zufall ab und ist nicht
    // vorhersagbar. Der erwartete Saldo muss deshalb die tatsächlich gemeldete Rückgabe der EINEN
    // angenommenen Aktion einrechnen, statt pauschal einen Verlust zu unterstellen — sonst würde
    // dieser Test bei einem gewonnenen "double" fälschlich als Nebenläufigkeitsfehler durchfallen,
    // obwohl serverseitig alles korrekt gebucht wurde.
    const successful = a.ok ? a : b.ok ? b : null;
    const settledReturnMinor = successful && successful.data.status === "settled" ? successful.data.returnMinor : 0;
    const expectedBalance = START_BALANCE_MINOR - stakeMinor - stakeMinor + settledReturnMinor;

    console.log(`Versuch ${attempt + 1}: ${successCount} von 2 gleichzeitigen "double"-Aufrufen angenommen.`);
    console.log(`Aktionsprotokoll der Runde: ${actions.length} Zeile(n) (erwartet: 1 — nur EIN "double" wurde tatsächlich angewendet).`);
    console.log(`bet-Buchungen dieser Runde insgesamt: ${bookings.length} (erwartet: 2 — Grundeinsatz + ein Zusatzeinsatz).`);
    console.log(
      `Saldo danach: ${wallet?.balanceMinor} (erwartet: ${expectedBalance}, d. h. Grundeinsatz + Zusatzeinsatz minus gemeldeter Rückgabe ${settledReturnMinor} — eine doppelte Buchung würde stattdessen ${expectedBalance - stakeMinor} ergeben).`,
    );

    const ok = successCount === 1 && actions.length === 1 && bookings.length === 2 && wallet?.balanceMinor === expectedBalance;
    console.log(ok ? "ERGEBNIS: BESTANDEN" : "ERGEBNIS: FEHLGESCHLAGEN");
    return ok;
  }

  console.log("Kein Versuch mit tatsächlicher Konkurrenz um dieselbe Position zustande gekommen (zu viele natürliche Blackjacks).");
  console.log("ERGEBNIS: FEHLGESCHLAGEN (kein Nachweis erbracht)");
  return false;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  const db = drizzle(pool, { schema });
  try {
    const a = await checkFundExhaustion(db);
    const b = await checkOpenRoundRace(db);
    const c = await checkFullRoundConcurrency(db);
    const d = await checkInteractiveActionRace(db);
    const allOk = a && b && c && d;
    console.log(`\nGesamtergebnis: ${allOk ? "ALLE NEBENLÄUFIGKEITSTESTS BESTANDEN" : "MINDESTENS EIN TEST FEHLGESCHLAGEN"}`);
    process.exitCode = allOk ? 0 : 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Nebenläufigkeitsprüfung fehlgeschlagen:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
