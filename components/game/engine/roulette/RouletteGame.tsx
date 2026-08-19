"use client";

import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import type { GameEngineViewProps } from "@/types/engine";
import { ROUND_DURATION_MS } from "@/lib/constants";
import { formatCreditsWithUnit, formatPercent } from "@/lib/formatters";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { GameShell } from "../GameShell";
import { useRound } from "../useRound";
import { useRoundSettleSound } from "../sound/useRoundSettleSound";
import { useReelStopSound } from "../sound/useReelStopSound";
import {
  betRtp,
  betKindsFor,
  COLOR_LABEL,
  cornerAnchors,
  coveredPockets,
  formatPocket,
  PAYOUT_TO_ONE,
  pocketColor,
  pocketCount,
  splitPartners,
  wheelFor,
  type BetKind,
  type Pocket,
  type PocketColor,
  type RouletteBet,
  type RouletteVariant,
} from "./roulette-logic";

/**
 * Roulette-Oberfläche für European, American und die Live-Demo.
 *
 * Bewusst NICHT vorhanden (Regel 7):
 *  - kein Autoplay, keine Wiederholwette-Automatik — jede Runde ist ein eigener Klick,
 *    und die Wettauswahl bleibt zwischen den Runden bestehen, ohne sich selbst auszulösen
 *  - kein Near Miss: Nachbarfächer des getroffenen Fachs werden nicht hervorgehoben,
 *    „knapp daneben“ kommt in keiner Meldung vor
 *  - kein Loss Disguised as Win: die Shell zeigt netto; eine Rückgabe unter Einsatz wird nie gefeiert
 *  - die Historie ist reine Protokollanzeige mit sichtbarem Hinweis auf die Unabhängigkeit der Runden
 *  - Pause bleibt sichtbar (Shell)
 *
 * Klang: "stop" beim Anhalten des Kessels (useReelStopSound), danach "win" bei echtem
 * Netto-Gewinn bzw. "settle" sonst (useRoundSettleSound) — beide genau einmal je Wurf. Keine
 * Betonung eines Nachbarfachs des getroffenen Fachs, auch nicht klanglich (Regel 7).
 */
export function RouletteGame({ game, simulateLoadError = false, onStatusChange }: GameEngineViewProps) {
  // Nur die amerikanische Variante hat den 38er-Kessel; die Live-Demo läuft auf dem europäischen.
  const variant: RouletteVariant = game.id === "g-american-roulette" ? "american" : "european";
  const wheel = wheelFor(variant);

  const [kind, setKind] = useState<BetKind>("red");
  const [straight, setStraight] = useState<Pocket>(17);
  const [splitA, setSplitA] = useState<Pocket>(1);
  const [splitB, setSplitB] = useState<Pocket>(2);
  const [streetRow, setStreetRow] = useState(1);
  const [cornerAnchor, setCornerAnchor] = useState(1);
  const [sixRow, setSixRow] = useState(1);
  const [column, setColumn] = useState<1 | 2 | 3>(1);
  const [dozen, setDozen] = useState<1 | 2 | 3>(1);
  const [pocket, setPocket] = useState<Pocket | null>(null);
  const [history, setHistory] = useState<Pocket[]>([]);

  const bet: RouletteBet = useMemo(() => {
    switch (kind) {
      case "straight": return { kind: "straight", pocket: straight };
      case "split": return { kind: "split", a: splitA, b: splitB };
      case "street": return { kind: "street", row: streetRow };
      case "corner": return { kind: "corner", anchor: cornerAnchor };
      case "sixline": return { kind: "sixline", row: sixRow };
      case "column": return { kind: "column", column };
      case "dozen": return { kind: "dozen", dozen };
      case "red": return { kind: "red" };
      case "black": return { kind: "black" };
      case "even": return { kind: "even" };
      case "odd": return { kind: "odd" };
      case "low": return { kind: "low" };
      case "high": return { kind: "high" };
      case "five": return { kind: "five" };
    }
  }, [kind, straight, splitA, splitB, streetRow, cornerAnchor, sixRow, column, dozen]);

  const round = useRound({
    game,
    server: true,
    roundDurationMs: ROUND_DURATION_MS,
    simulateLoadError,
    onStatusChange,
  });

  const { setBetId, setBetPayload, last, status } = round;

  // Die Wett-ID ist zugleich der Schlüssel der Auszahlungstabelle (`gameId::betId`); `bet` ist die
  // vollständige, strukturierte Wette (inklusive gewählter Zahlen), die der Server zum Auflösen
  // braucht — `betId` allein reicht für Plein/Cheval/Carré/Sixain/Transversale nicht, weil deren
  // Auszahlung von den KONKRET gewählten Zahlen abhängt, nicht nur von der Wettart.
  useEffect(() => {
    setBetId(kind);
    setBetPayload(bet);
  }, [kind, bet, setBetId, setBetPayload]);

  // Ergebnis der abgeschlossenen Runde in Kesselanzeige und Protokoll übernehmen.
  useEffect(() => {
    if (!last) return;
    const shown = typeof last.detail?.pocket === "string" ? last.detail.pocket : null;
    if (shown === null) return;
    const value: Pocket = shown === "00" ? "00" : Number(shown);
    setPocket(value);
    setHistory((prev) => [value, ...prev].slice(0, 10));
  }, [last]);

  useReelStopSound(last);
  useRoundSettleSound(last, round.inlineError);

  const payout = PAYOUT_TO_ONE[kind];
  const rtp = betRtp(kind, variant);
  const covered = coveredPockets(bet);
  const color: PocketColor | null = pocket === null ? null : pocketColor(pocket);

  const controls = (
    <div className="space-y-3">
      <Select
        label="Wettart"
        value={kind}
        onChange={(e) => setKind(e.target.value as BetKind)}
        disabled={round.busy}
        options={betKindsFor(variant).map((k) => ({ value: k, label: `${BET_LABEL[k]} (${PAYOUT_TO_ONE[k]}:1)` }))}
      />

      {kind === "straight" ? (
        <Select
          label="Zahl"
          value={formatPocket(straight)}
          onChange={(e) => setStraight(parsePocket(e.target.value))}
          disabled={round.busy}
          options={wheelOptions(wheel)}
        />
      ) : null}

      {kind === "split" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Erste Zahl"
            value={formatPocket(splitA)}
            onChange={(e) => {
              const next = parsePocket(e.target.value);
              setSplitA(next);
              const first = splitPartners(next, variant)[0];
              if (first !== undefined) setSplitB(first);
            }}
            disabled={round.busy}
            options={wheelOptions(wheel)}
          />
          <Select
            label="Benachbarte Zahl"
            value={formatPocket(splitB)}
            onChange={(e) => setSplitB(parsePocket(e.target.value))}
            disabled={round.busy}
            hint="Nur Zahlen, die auf dem Tableau an die erste Zahl grenzen."
            options={splitPartners(splitA, variant).map((p) => ({ value: formatPocket(p), label: formatPocket(p) }))}
          />
        </div>
      ) : null}

      {kind === "street" ? (
        <Select
          label="Dreierreihe"
          value={String(streetRow)}
          onChange={(e) => setStreetRow(Number(e.target.value))}
          disabled={round.busy}
          options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i * 3 + 1} – ${i * 3 + 3}` }))}
        />
      ) : null}

      {kind === "corner" ? (
        <Select
          label="Viererfeld"
          value={String(cornerAnchor)}
          onChange={(e) => setCornerAnchor(Number(e.target.value))}
          disabled={round.busy}
          options={cornerAnchors().map((a) => ({ value: String(a), label: `${a}, ${a + 1}, ${a + 3}, ${a + 4}` }))}
        />
      ) : null}

      {kind === "sixline" ? (
        <Select
          label="Zwei Reihen"
          value={String(sixRow)}
          onChange={(e) => setSixRow(Number(e.target.value))}
          disabled={round.busy}
          options={Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: `${i * 3 + 1} – ${i * 3 + 6}` }))}
        />
      ) : null}

      {kind === "column" ? (
        <Select
          label="Kolonne"
          value={String(column)}
          onChange={(e) => setColumn(Number(e.target.value) as 1 | 2 | 3)}
          disabled={round.busy}
          options={[1, 2, 3].map((c) => ({ value: String(c), label: `${c}. Kolonne (${c}, ${c + 3}, ${c + 6} …)` }))}
        />
      ) : null}

      {kind === "dozen" ? (
        <Select
          label="Dutzend"
          value={String(dozen)}
          onChange={(e) => setDozen(Number(e.target.value) as 1 | 2 | 3)}
          disabled={round.busy}
          options={[1, 2, 3].map((d) => ({ value: String(d), label: `${d}. Dutzend (${(d - 1) * 12 + 1} – ${d * 12})` }))}
        />
      ) : null}

      <div className="rounded-control border border-border-control bg-base p-3 text-xs text-muted">
        <p className="text-sm font-medium text-primary">{BET_LABEL[kind]}</p>
        <p className="mt-1">
          Auszahlung {payout}:1 — bei Treffer beträgt die Rückgabe das {payout + 1}-Fache des Einsatzes
          (Gewinn {payout}× plus Einsatz zurück).
        </p>
        <p className="mt-1 tabular">
          Abgedeckte Fächer: {covered.map(formatPocket).join(", ")} ({covered.length} von {pocketCount(variant)})
        </p>
        <p className="mt-1">
          Rechnerische Rückgabequote dieser Wette: <span className="tabular text-primary">{formatPercent(rtp)}</span> —
          Erwartungswert der hinterlegten Auszahlungstabelle.
        </p>
        {kind === "five" ? (
          <p className="mt-2 flex items-start gap-1.5 text-warning">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Sachlicher Hinweis: Die Five-Number-Wette hat mit {formatPercent(rtp)} den niedrigsten Erwartungswert
              aller Wetten an diesem Kessel; alle übrigen liegen bei {formatPercent(betRtp("red", variant))}.
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <GameShell
      game={game}
      status={status}
      hydrated={round.hydrated}
      controls={controls}
      last={last}
      available={round.available}
      stake={round.stake}
      onStakeChange={round.setStake}
      onPlay={round.play}
      onRetryLoad={round.load}
      onTogglePause={round.togglePause}
      canStart={round.canStart}
      busy={round.busy}
      blocked={round.blocked}
      blockReason={round.blockReason}
      inlineErrorMessage={round.inlineError?.message}
      insufficient={round.insufficient}
      freeSpins={round.wallet.freeSpins}
      useFreeSpin={round.useFreeSpin}
      onUseFreeSpinChange={round.setUseFreeSpin}
      startLabel="Kugel werfen"
      actionHint={
        <>
          Wirft eine Runde auf {BET_LABEL[kind]} und zieht{" "}
          {round.useFreeSpin ? "eine Freirunde" : `${formatCreditsWithUnit(round.stake)} Guthaben`} ab. Kein Echtgeld.
        </>
      }
    >
      <div className="mx-auto max-w-md space-y-3">
        {game.isLiveDemo ? <DealerArea /> : null}

        <section className="rounded-card border border-border-control bg-base p-4">
          <h3 className="text-sm font-medium text-primary">Kessel</h3>
          <p className="text-xs text-muted">
            {variant === "american" ? "Amerikanischer Kessel: 38 Fächer mit Null und Doppelnull." : "Europäischer Kessel: 37 Fächer mit einer Null."}
          </p>

          <div className="mt-3 flex flex-col items-center gap-2">
            {status === "playing" ? (
              <p className="anim-fade-in flex h-24 items-center text-sm text-muted">Die Kugel läuft …</p>
            ) : pocket === null || color === null ? (
              <p className="flex h-24 items-center text-sm text-muted">Noch kein Wurf in dieser Sitzung.</p>
            ) : (
              <div className={cn("anim-fade-in flex h-24 w-24 flex-col items-center justify-center rounded-full border-2", POCKET_RING[color])}>
                <span className="tabular text-2xl font-semibold text-primary">{formatPocket(pocket)}</span>
                <span className={cn("text-xs font-medium", POCKET_TEXT[color])}>{COLOR_LABEL[color]}</span>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-card border border-border-subtle bg-base p-3">
          <h3 className="text-sm font-medium text-primary">Letzte Ergebnisse</h3>
          {history.length === 0 ? (
            <p className="mt-1 text-xs text-muted">Noch keine Runde gespielt.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {history.map((p, i) => (
                <li key={`${formatPocket(p)}-${i}`}>
                  <Badge tone={BADGE_TONE[pocketColor(p)]}>
                    <span className="tabular">{formatPocket(p)}</span>
                    {COLOR_LABEL[pocketColor(p)]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {/* Regel 7: Historie ohne jede Andeutung einer Fortsetzung oder Fälligkeit. */}
          <p className="mt-2 text-xs text-muted">
            Jede Runde ist unabhängig. Aus früheren Ergebnissen folgt nichts für die nächste Runde — der Kessel hat kein Gedächtnis.
          </p>
        </section>
      </div>
    </GameShell>
  );
}

/** Statischer Tischbereich der Live-Demo: Illustration, keine Personen, kein Video (Regel 8). */
function DealerArea() {
  return (
    <section className="rounded-card border border-border-subtle bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-primary">Tischbereich</h3>
        <Badge tone="teal">Illustration</Badge>
      </div>
      <div aria-hidden="true" className="mt-2 flex h-16 items-end gap-1.5 rounded-control border border-border-subtle bg-base px-3 pb-3 pt-2">
        <span className="h-3 flex-1 rounded-pill bg-elevated" />
        <span className="h-6 flex-1 rounded-pill bg-elevated" />
        <span className="h-10 flex-1 rounded-pill bg-elevated" />
        <span className="h-6 flex-1 rounded-pill bg-elevated" />
        <span className="h-3 flex-1 rounded-pill bg-elevated" />
      </div>
      <p className="mt-2 text-xs text-muted">
        Statische Darstellung eines Tischplatzes ohne Video und ohne reale Person. Sie zeigt nur, wo an einem
        Live-Tisch Kessel, Tableau und Ansage liegen würden.
      </p>
    </section>
  );
}

const BET_LABEL: Record<BetKind, string> = {
  straight: "Plein (eine Zahl)",
  split: "Cheval (zwei Zahlen)",
  street: "Transversale (Dreierreihe)",
  corner: "Carré (vier Zahlen)",
  sixline: "Sixain (sechs Zahlen)",
  column: "Kolonne (zwölf Zahlen)",
  dozen: "Dutzend (zwölf Zahlen)",
  red: "Rot",
  black: "Schwarz",
  even: "Gerade",
  odd: "Ungerade",
  low: "Manque (1–18)",
  high: "Passe (19–36)",
  five: "Five Number (0, 00, 1, 2, 3)",
};

/** Farbe ist nie die alleinige Information — Zahl und Textlabel stehen immer daneben (§12). */
const POCKET_RING: Record<PocketColor, string> = {
  red: "border-danger",
  black: "border-border-control",
  green: "border-success",
};

const POCKET_TEXT: Record<PocketColor, string> = {
  red: "text-danger",
  black: "text-muted",
  green: "text-success",
};

const BADGE_TONE: Record<PocketColor, "danger" | "neutral" | "success"> = {
  red: "danger",
  black: "neutral",
  green: "success",
};

function wheelOptions(wheel: readonly Pocket[]) {
  // Auswahl in Zählreihenfolge (0, 00, 1 … 36), nicht in Kesselordnung — leichter zu finden.
  const sorted = [...wheel].sort((a, b) => sortKey(a) - sortKey(b));
  return sorted.map((p) => ({ value: formatPocket(p), label: formatPocket(p) }));
}

function sortKey(p: Pocket): number {
  return p === "00" ? 0.5 : p;
}

function parsePocket(value: string): Pocket {
  return value === "00" ? "00" : Number(value);
}
