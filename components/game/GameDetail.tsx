"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Ban, ChevronLeft, LogIn, Play, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Game } from "@/types/game";
import type { GameModeSummary } from "@/types/game-mode";
import type { RoundStatus } from "@/types/game-round";
import { useCatalog } from "@/state/CatalogContext";
import { useSession } from "@/state/SessionContext";
import { useRgStatus } from "@/state/RgContext";
import { rgReasonText } from "@/state/rg-reducer";
import { betIdOf, paytablesOf } from "@/data/paytables";
import { engineFor } from "./engine/registry";
import { categoryLabel, difficultyLabel, mechanicLabel } from "@/data/categories";
import { providerName } from "@/data/providers";
import { similarGames } from "@/lib/filters";
import { formatCredits, formatPercent } from "@/lib/formatters";
import { rtpOf } from "@/lib/paytable";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/feedback/EmptyState";
import { GameArt } from "./GameArt";
import { FavoriteButton } from "./FavoriteButton";
import { GameCard } from "./GameCard";
import { ModeSwitcher } from "./ModeSwitcher";
import { PaytableView } from "./PaytableView";
import { DemoWallet } from "@/components/wallet/DemoWallet";
import { cn } from "@/lib/cn";

const volatilityLabel = { low: "Niedrig", medium: "Mittel", high: "Hoch" } as const;

const statusLabel: Record<RoundStatus, string> = {
  idle: "Bereit zum Laden",
  loading: "Wird geladen",
  ready: "Bereit",
  playing: "Runde läuft",
  paused: "Pausiert",
  finished: "Runde abgeschlossen",
  error: "Fehler beim Laden",
};

export type GameDetailProps = {
  game: Game;
  /**
   * Alle Modi des Titels (inklusive des aktiven, inklusive inaktiver) — aus
   * server/catalog/read-model.ts über app/game/[slug]/page.tsx. Fehlt die Prop (z. B. in
   * älteren Tests) oder hat der Titel nur einen Modus, bleibt die Modusauswahl ausgeblendet.
   */
  siblingModes?: readonly GameModeSummary[];
  titleLabel?: string;
};

/** Spieldetailseite (§8.4). Spielfläche wird auf derselben Route eingeblendet. */
export function GameDetail({ game: baseGame, siblingModes, titleLabel }: GameDetailProps) {
  const { games } = useCatalog();
  const { isLoggedIn } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rg = useRgStatus(5000);
  const game = games.find((g) => g.id === baseGame.id) ?? baseGame;
  const tables = useMemo(() => paytablesOf(game.id), [game.id]);
  const Engine = engineFor(game.id);
  const inactive = game.status === "inactive";
  // Spielbar ist, was eine Engine hat und aktiv ist. Interaktive Spiele (Blackjack, Mines)
  // haben bewusst keine feste Tabelle und zeigen deshalb auch keinen RTP.
  const playable = Boolean(Engine) && !inactive;
  const [playing, setPlaying] = useState(false);
  const [roundStatus, setRoundStatus] = useState<RoundStatus>("idle");
  const playRef = useRef<HTMLDivElement>(null);
  const similar = useMemo(() => similarGames(games, game, 4), [games, game]);
  const simulateError = searchParams.get("fail") === "1";

  useEffect(() => {
    if (playing) playRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [playing]);

  const blocked = rg.hydrated && rg.blocked;
  const blockedText = blocked && rg.reason ? rgReasonText[rg.reason] : null;
  // Rücksprung nach der Anmeldung zurück auf genau diese Spieldetailseite (Auftrag „Spielen nur
  // angemeldet"). `pathname` ist ein serverseitig bekannter, projektinterner Pfad (App-Router-
  // Route, kein Nutzereingabefeld) — trotzdem läuft er beim Verbrauch durch `safeNext()`
  // (components/auth/LoginForm.tsx), derselbe Schutz gegen offene Weiterleitung wie bei jedem
  // anderen `next`-Parameter.
  const loginHref = `/login?next=${encodeURIComponent(pathname ?? "/casino")}`;

  /**
   * RTP-Angabe (Regel 6): Ein einzelner Wert nur, wenn alle Wetten denselben Erwartungswert haben.
   * Unterscheiden sie sich, wird der Bereich genannt und auf die Tabellen je Wette verwiesen —
   * ein Durchschnitt, den keine einzelne Wette hat, wäre irreführend.
   */
  const rtpFact = (() => {
    if (game.rtpDemo !== undefined) return `Demo-Wert ${formatPercent(game.rtpDemo)}`;
    if (tables.length > 1) {
      const values = tables.map(rtpOf).sort((a, b) => a - b);
      return `Je nach Wette ${formatPercent(values[0]!)} – ${formatPercent(values.at(-1)!)} (siehe Tabellen unten)`;
    }
    return "Kein Wert — der Ausgang hängt von Entscheidungen ab, nicht von einer festen Tabelle";
  })();

  return (
    <div className="space-y-10 pt-6">
      <nav aria-label="Brotkrumen" className="text-sm">
        <Link href="/casino" className="inline-flex min-h-11 items-center gap-1 text-muted transition-state hover:text-primary">
          <ChevronLeft className="size-4" aria-hidden="true" /> Zur Lobby
        </Link>
      </nav>

      {/* Kopf: großes Bild + Fakten. "Der Tisch als Lichtquelle": Tiefe über Schatten statt
          zusätzlicher Farbe — signature-top bleibt die einzige box-shadow-Deklaration hier,
          da .edge-light dieselbe CSS-Eigenschaft setzt und sie sonst überschreiben würde
          (siehe app/globals.css: --edge-light ist für die Kombination in EINER box-shadow-Liste
          gedacht, z. B. in .hover-elevate, nicht für das Stapeln zweier Utility-Klassen). */}
      <section className="grid gap-lg lg:grid-cols-[1.2fr_1fr]" aria-labelledby="game-title">
        <div className={cn("signature-top overflow-hidden rounded-card border border-border-subtle bg-surface", inactive && "opacity-70")}>
          <div className="aspect-[16/9]">
            <GameArt game={game} useBanner priority />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{categoryLabel(game.category)}</Badge>
            {inactive ? (
              <Badge tone="neutral" icon={<Ban className="size-3" aria-hidden="true" />}>
                Zurzeit nicht verfügbar
              </Badge>
            ) : playable ? (
              <Badge tone="teal">Demo spielbar</Badge>
            ) : (
              <Badge tone="neutral">Demo folgt</Badge>
            )}
            {game.isLiveDemo ? <Badge tone="teal">Live-Demo · Simulation</Badge> : null}
            {game.isNew ? <Badge tone="teal">Neu</Badge> : null}
          </div>
          <h1 id="game-title" className="font-display text-2xl text-primary sm:text-3xl">
            {game.name}
          </h1>
          <p className="text-sm text-muted">{providerName(game.providerId)}</p>
          {siblingModes && siblingModes.length > 1 ? (
            <ModeSwitcher
              modes={siblingModes}
              activeModeId={game.id}
              titleLabel={titleLabel ?? game.name}
              roundInProgress={roundStatus === "playing"}
            />
          ) : null}
          <p className="measure text-base text-primary/90">{game.description}</p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {inactive ? (
              <>
                <Button variant="outline" disabled aria-disabled="true">
                  Zurzeit nicht verfügbar
                </Button>
                <LinkButton href="#similar" variant="ghost">
                  Ähnliche Spiele ansehen
                </LinkButton>
              </>
            ) : blocked ? (
              <Button variant="outline" disabled aria-describedby="rg-block-reason">
                Spielstart blockiert
              </Button>
            ) : playable ? (
              !isLoggedIn ? (
                // Ersetzt den Startknopf vollständig (Auftrag „Spielen nur angemeldet"): der
                // Katalog inklusive dieser Seite bleibt ohne Anmeldung einsehbar, nur das Spielen
                // selbst verlangt ein Konto. `?next=` führt nach der Anmeldung zurück hierher.
                <LinkButton href={loginHref} variant="primary" size="lg" iconLeft={<LogIn className="size-4" aria-hidden="true" />} aria-describedby="login-hint">
                  Anmelden zum Spielen
                </LinkButton>
              ) : // Gold ist knapp: sobald die Spielfläche offen ist, liegt die einzige goldene
              // Fläche des Bildschirms dort („Runde starten“). Hier bleibt nur ein Umriss-Weg.
              playing ? (
                <Button variant="outline" size="lg" onClick={() => playRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  Zur Spielfläche ({statusLabel[roundStatus]})
                </Button>
              ) : (
                <Button variant="primary" size="lg" onClick={() => setPlaying(true)} iconLeft={<Play className="size-4" aria-hidden="true" />}>
                  Demo spielen
                </Button>
              )
            ) : (
              <Button variant="outline" disabled aria-describedby="not-playable-hint">
                Demo folgt
              </Button>
            )}
            <FavoriteButton gameId={game.id} gameName={game.name} size="md" />
          </div>
          {blockedText ? (
            <p id="rg-block-reason" role="alert" className="flex items-start gap-2 text-sm text-warning">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {blockedText.title}. {blockedText.body}{" "}
                <Link href="/responsible-gaming" className="font-medium text-gold hover:text-gold-strong">
                  Zu Responsible Gaming
                </Link>
              </span>
            </p>
          ) : null}
          {playable && !isLoggedIn ? (
            <p id="login-hint" className="text-sm text-muted">
              Zum Spielen ist eine Anmeldung nötig. Der Katalog bleibt frei einsehbar, nur das Spielen selbst verlangt ein Konto.
            </p>
          ) : null}
          {!playable && !inactive ? (
            <p id="not-playable-hint" className="text-sm text-muted">
              Für dieses Spiel ist im Prototyp noch keine Engine hinterlegt.
            </p>
          ) : null}
          <p className="text-xs text-muted">Demo-Guthaben: Runden ziehen Demo-Credits ab und schreiben Rückgaben gut. Kein Echtgeld, keine Auszahlung.</p>
        </div>
      </section>

      {/* Spielfläche */}
      {playing && Engine ? (
        <section ref={playRef} aria-label="Spielfläche" className="grid gap-6 scroll-mt-32 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* minmax(0,1fr) und min-w-0: ohne beides wachsen Grid-Spalten mit ihrem Inhalt und
              schieben die Seite über den Rand — bei langen Zahlen oder breiten Tischen. */}
          <div className="min-w-0">
            <Engine game={game} simulateLoadError={simulateError} onStatusChange={setRoundStatus} />
          </div>
          <div className="min-w-0">
            <DemoWallet compact />
          </div>
        </section>
      ) : null}

      {/* Metadaten — immer gekennzeichnet */}
      <section aria-labelledby="facts-title" className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <h2 id="facts-title" className="text-md font-semibold text-primary">
            Fakten zur Demo
          </h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Fact label="RTP">{rtpFact}</Fact>
            <Fact label="Volatilität">{game.volatility ? volatilityLabel[game.volatility] : "–"}</Fact>
            <Fact label="Minimale Demo-Runde">{formatCredits(game.minDemoBetMinor)} Credits</Fact>
            <Fact label="Maximale Demo-Runde">{formatCredits(game.maxDemoBetMinor)} Credits</Fact>
            <Fact label="Demo-Schwierigkeit">{difficultyLabel[game.demoDifficulty]}</Fact>
            <Fact label="Mechanik">{game.tags.length ? game.tags.map(mechanicLabel).join(", ") : "–"}</Fact>
          </dl>
        </Card>
        <Card className="flex flex-col gap-3 border-teal/40">
          <h2 className="flex items-center gap-2 text-md font-semibold text-primary">
            <ShieldCheck className="size-5 text-teal" aria-hidden="true" />
            Responsible Gaming
          </h2>
          <p className="text-sm text-muted">Spielzeit, Pause, Demo-Limit und Selbstsperre gelten auch hier. Die aktuelle Sitzung siehst du jederzeit im Bereich Responsible Gaming.</p>
          <LinkButton href="/responsible-gaming" variant="outline" className="self-start">
            Zu Responsible Gaming
          </LinkButton>
        </Card>
      </section>

      {tables.length > 0 ? (
        <section aria-labelledby="paytable-title" className="space-y-4">
          <h2 id="paytable-title" className="font-display text-lg text-primary sm:text-xl">
            {tables.length > 1 ? "Auszahlungstabellen je Wette" : "Auszahlungstabelle"}
          </h2>
          {tables.length === 1 ? (
            <PaytableView paytable={tables[0]!} />
          ) : (
            <>
              {/* Übersicht zuerst: Bei vielen Wettarten wären zehn volle Tabellen untereinander
                  unlesbar. Die Einzeltabellen bleiben vollständig einsehbar, nur eingeklappt. */}
              <div className="overflow-x-auto rounded-card border border-border-subtle">
                <table className="w-full min-w-[360px] text-sm">
                  <caption className="px-4 py-3 text-left text-sm text-muted">
                    Demo-RTP je Wette. Der Wert ist der Erwartungswert der jeweiligen Tabelle.
                  </caption>
                  <thead className="bg-elevated text-left text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Wette</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Demo-RTP</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Ergebnisklassen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tables.map((t) => (
                      <tr key={t.gameId} className="border-t border-border-subtle">
                        <td className="px-4 py-2 text-primary">{t.label ?? betIdOf(t.gameId) ?? "Standard"}</td>
                        <td className="tabular px-4 py-2 text-right text-primary">{formatPercent(rtpOf(t))}</td>
                        <td className="tabular px-4 py-2 text-right text-muted">{t.entries.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {tables.map((t) => (
                <details key={t.gameId} className="rounded-card border border-border-subtle bg-surface">
                  <summary className="flex min-h-11 cursor-pointer items-center px-4 py-2 text-sm font-medium text-primary">
                    Tabelle: {t.label ?? betIdOf(t.gameId) ?? "Standard"} · RTP {formatPercent(rtpOf(t))}
                  </summary>
                  <div className="border-t border-border-subtle p-3">
                    <PaytableView paytable={t} />
                  </div>
                </details>
              ))}
            </>
          )}
        </section>
      ) : (
        <section aria-labelledby="paytable-title">
          <h2 id="paytable-title" className="sr-only">
            Auszahlungstabelle
          </h2>
          <EmptyState
            compact
            title="Keine feste Auszahlungstabelle"
            text={
              Engine
                ? "Der Ausgang hängt hier von deinen Entscheidungen ab, nicht von einer festen Tabelle. Deshalb weist der Prototyp für dieses Spiel keinen RTP-Wert aus — behauptet würde nur, was auch geprüft werden kann."
                : "Ohne geprüfte Tabelle zeigt der Prototyp keinen RTP-Wert an (Regel: ausgewiesener RTP muss der Tabelle entsprechen)."
            }
          />
        </section>
      )}

      <section id="similar" aria-labelledby="similar-title" className="space-y-3 scroll-mt-32">
        <h2 id="similar-title" className="font-display text-lg text-primary sm:text-xl">
          Ähnliche Spiele
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {similar.map((g) => (
            <li key={g.id}>
              <GameCard game={g} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border-subtle py-1.5 sm:block sm:border-0 sm:py-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-primary sm:text-left">{children}</dd>
    </div>
  );
}
