"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { GameEngineViewProps } from "@/types/engine";
import { findPaytable } from "@/data/paytables";
import { rtpOf } from "@/lib/paytable";
import { formatMultiplier, formatPercent } from "@/lib/formatters";
import { ROUND_DURATION_MS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useRound } from "../useRound";
import { GameShell } from "../GameShell";
import {
  BACCARAT_BET_IDS,
  isBaccaratBetId,
  resolveBaccaratRound,
  type BaccaratBetId,
  type BaccaratCard,
  type BaccaratDetail,
  type CoupResult,
  cardPoints,
} from "./baccarat-logic";

/**
 * Baccarat (Punto Banco) — Oberfläche für „g-baccarat“ und „g-live-baccarat-demo“.
 *
 * Bewusst NICHT vorhanden (Regel 7, im Code dokumentiert):
 *  - kein Near Miss: ein Coup, der um einen Punkt verloren geht, wird wie jeder andere
 *    Verlust dargestellt — keine Hervorhebung, keine eigene Animation
 *  - kein Loss Disguised as Win: die Shell zeigt netto; ein Push (Unentschieden bei
 *    Spieler-/Bankwette) erscheint als ±0,00, nicht als Gewinn
 *  - kein Autoplay, keine Wiederholautomatik, kein Ton
 *  - keine vorausgewählte Wette — ohne bewusste Auswahl startet keine Runde
 *  - der Ergebnisverlauf trägt einen sichtbaren Hinweis auf die Unabhängigkeit der Runden;
 *    er ist Protokoll, keine Vorhersage
 *  - keine Strategieempfehlung: die Ziehregeln werden sachlich erklärt, mehr nicht
 */

const BET_LABEL: Record<BaccaratBetId, string> = {
  player: "Spieler",
  banker: "Bank",
  tie: "Unentschieden",
};

const BET_HINT: Record<BaccaratBetId, string> = {
  player: "Gewinnt, wenn die Spielerhand die höhere Punktzahl hat.",
  banker: "Gewinnt, wenn die Bankhand die höhere Punktzahl hat. Auf den Gewinn fallen 5 % Kommission an.",
  tie: "Gewinnt nur bei gleicher Punktzahl. Bei Spieler- und Bankwette wird dann der Einsatz zurückgegeben.",
};

const RESULT_SHORT: Record<CoupResult, string> = { player: "S", banker: "B", tie: "U" };
const RESULT_LONG: Record<CoupResult, string> = { player: "Spieler", banker: "Bank", tie: "Unentschieden" };

const RANK_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K"] as const;
const SUIT_SYMBOL = ["♣", "♦", "♥", "♠"] as const;
const SUIT_NAME = ["Kreuz", "Karo", "Herz", "Pik"] as const;

type HistoryEntry = { roundId: string; result: CoupResult; playerTotal: number; bankerTotal: number };

export function BaccaratGame({ game, simulateLoadError, onStatusChange }: GameEngineViewProps) {
  const round = useRound({
    game,
    resolve: resolveBaccaratRound,
    roundDurationMs: ROUND_DURATION_MS,
    simulateLoadError,
    onStatusChange,
    defaultStakeMinor: 100,
  });

  const [showRules, setShowRules] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const lastLogged = useRef<string | null>(null);

  const bet = isBaccaratBetId(round.betId) ? round.betId : undefined;
  const detail = round.last?.detail as BaccaratDetail | undefined;

  // Verlauf fortschreiben — reines Protokoll, ohne Einfluss auf kommende Runden.
  useEffect(() => {
    const last = round.last;
    if (!last || lastLogged.current === last.roundId) return;
    const d = last.detail as BaccaratDetail | undefined;
    if (!d) return;
    lastLogged.current = last.roundId;
    setHistory((prev) => [{ roundId: last.roundId, result: d.result, playerTotal: d.playerTotal, bankerTotal: d.bankerTotal }, ...prev].slice(0, 12));
  }, [round.last]);

  const betInfo = useMemo(
    () =>
      BACCARAT_BET_IDS.map((id) => {
        const table = findPaytable(game.id, id);
        const winEntry = table?.entries.find((e) => e.key === "win");
        return {
          id,
          label: BET_LABEL[id],
          multiplier: winEntry?.multiplier,
          rtp: table ? rtpOf(table) : undefined,
        };
      }),
    [game.id],
  );

  const controls = (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-primary">Wette wählen</legend>
      <div role="radiogroup" aria-label="Wette wählen" className="grid gap-2 sm:grid-cols-3">
        {betInfo.map((b) => {
          const selected = bet === b.id;
          return (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={round.busy}
              onClick={() => round.setBetId(b.id)}
              className={cn(
                "min-h-11 rounded-control border px-3 py-2 text-left transition-state",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected ? "border-gold text-gold" : "border-border-control text-primary hover:border-gold",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {/* Auswahl nie allein über Farbe: zusätzlich Textmarke */}
                <span aria-hidden="true">{selected ? "✓" : "○"}</span>
                {b.label}
              </span>
              <span className="tabular mt-0.5 block text-xs text-muted">
                {b.multiplier === undefined ? "Rückgabe unbekannt" : `Rückgabe ${formatMultiplier(b.multiplier)}`}
                {b.rtp === undefined ? "" : ` · RTP ${formatPercent(b.rtp, 2)}`}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        Die angegebene Rückgabe enthält den Einsatz. Der RTP ist der Erwartungswert der hinterlegten
        Auszahlungstabelle dieser Wette — ein Demo-Wert, keine Aussage über eine einzelne Runde.
      </p>
      {bet === undefined ? (
        <p className="text-xs text-muted">Ohne gewählte Wette startet keine Runde.</p>
      ) : (
        <p className="text-xs text-muted">{BET_HINT[bet]}</p>
      )}
    </fieldset>
  );

  return (
    <GameShell
      game={game}
      status={round.status}
      hydrated={round.hydrated}
      controls={controls}
      last={round.last}
      available={round.available}
      stake={round.stake}
      onStakeChange={round.setStake}
      onPlay={round.play}
      onRetryLoad={round.load}
      onTogglePause={round.togglePause}
      canStart={round.canStart && bet !== undefined}
      busy={round.busy}
      blocked={round.blocked}
      blockReason={round.blockReason}
      inlineErrorMessage={round.inlineError?.message}
      insufficient={round.insufficient}
      freeSpins={round.wallet.freeSpins}
      useFreeSpin={round.useFreeSpin}
      onUseFreeSpinChange={round.setUseFreeSpin}
      startLabel="Coup geben"
    >
      <div className="space-y-4">
        {game.isLiveDemo ? <DealerIllustration /> : null}

        <section aria-labelledby="baccarat-table-heading" className="rounded-card border border-border-control bg-base p-3 sm:p-4">
          <h3 id="baccarat-table-heading" className="text-sm font-medium text-primary">
            Tisch
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <HandPanel
              title="Spieler"
              cards={detail?.playerCards}
              total={detail?.playerTotal}
              playing={round.status === "playing"}
              winner={detail?.result === "player"}
            />
            <HandPanel
              title="Bank"
              cards={detail?.bankerCards}
              total={detail?.bankerTotal}
              playing={round.status === "playing"}
              winner={detail?.result === "banker"}
            />
          </div>
          {detail ? (
            <p className="mt-3 text-xs text-muted">
              Ergebnis: {RESULT_LONG[detail.result]} · Punkte {detail.playerTotal} zu {detail.bankerTotal}
              {detail.natural ? " · Natural (8 oder 9 aus zwei Karten), keine dritte Karte" : ""}
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted">
              Kartenwerte: 10, Bube, Dame und König zählen 0, das Ass zählt 1, alle übrigen Karten ihren Nennwert.
              Die Punktzahl einer Hand ist die Summe modulo 10.
            </p>
          )}
        </section>

        <div>
          <Button
            variant="ghost"
            onClick={() => setShowRules((v) => !v)}
            aria-expanded={showRules}
            aria-controls="baccarat-rules"
            iconLeft={<Info className="size-4" aria-hidden="true" />}
          >
            {showRules ? "Ziehregeln ausblenden" : "Ziehregeln einblenden"}
          </Button>
          {showRules ? <DrawRules /> : null}
        </div>

        <ResultHistory entries={history} />
      </div>
    </GameShell>
  );
}

function HandPanel({
  title,
  cards,
  total,
  playing,
  winner,
}: {
  title: string;
  cards?: readonly BaccaratCard[];
  total?: number;
  playing: boolean;
  winner?: boolean;
}) {
  return (
    <div className="rounded-control border border-border-subtle bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium text-primary">{title}</h4>
        <span className="tabular text-sm text-muted">
          {playing || total === undefined ? "– Punkte" : `${total} Punkte`}
        </span>
      </div>
      <div className="mt-2 flex min-h-[4.5rem] flex-wrap items-center gap-2">
        {playing ? (
          <p className="text-sm text-muted">Karten werden gegeben …</p>
        ) : cards && cards.length > 0 ? (
          cards.map((c, i) => <PlayingCard key={i} card={c} />)
        ) : (
          <p className="text-sm text-muted">Noch keine Karten.</p>
        )}
      </div>
      {/* Gewinnerhand wird sachlich benannt, nicht gefeiert; Text statt reiner Farbe. */}
      {!playing && winner ? <p className="mt-1 text-xs text-primary">Höhere Punktzahl</p> : null}
    </div>
  );
}

function PlayingCard({ card }: { card: BaccaratCard }) {
  const rank = RANK_LABEL[card.rank] ?? "?";
  const suit = SUIT_SYMBOL[card.suit] ?? "?";
  const suitName = SUIT_NAME[card.suit] ?? "";
  const points = cardPoints(card.rank);
  return (
    <span className="anim-fade-in flex h-[4.25rem] w-12 flex-col items-center justify-center rounded-control border border-border-control bg-base">
      <span className="text-base font-semibold text-primary" aria-hidden="true">
        {rank}
      </span>
      <span className="text-sm text-muted" aria-hidden="true">
        {suit}
      </span>
      <span className="tabular text-[0.6875rem] text-muted" aria-hidden="true">
        {points} P.
      </span>
      <span className="sr-only">
        {rank} {suitName}, Wert {points}
      </span>
    </span>
  );
}

/** Statische Illustration des Live-Bereichs: keine Personen, kein Video, kein Stream. */
function DealerIllustration() {
  return (
    <section aria-labelledby="baccarat-live-heading" className="rounded-card border border-border-subtle bg-base p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="baccarat-live-heading" className="text-sm font-medium text-primary">
          Dealer-Bereich
        </h3>
        <span className="rounded-full border border-border-control px-2 py-0.5 text-xs text-muted">
          Illustration — kein Video, keine Personen
        </span>
      </div>
      <svg viewBox="0 0 320 90" role="img" aria-label="Schematische Zeichnung eines halbrunden Baccarat-Tisches mit Kartenschuh und drei Wettfeldern. Es sind keine Personen abgebildet." className="mt-2 h-20 w-full">
        <path d="M20 84 A140 70 0 0 1 300 84 Z" fill="var(--bg-surface)" stroke="var(--border-control)" strokeWidth="1" />
        <rect x="146" y="20" width="28" height="18" rx="3" fill="none" stroke="var(--gold)" strokeWidth="1" />
        <g fill="none" stroke="var(--border-control)" strokeWidth="1">
          <rect x="60" y="54" width="58" height="20" rx="4" />
          <rect x="131" y="54" width="58" height="20" rx="4" />
          <rect x="202" y="54" width="58" height="20" rx="4" />
        </g>
        <g fill="var(--text-muted)" fontSize="9" textAnchor="middle">
          <text x="89" y="68">Spieler</text>
          <text x="160" y="68">Unentsch.</text>
          <text x="231" y="68">Bank</text>
          <text x="160" y="15" fontSize="8">Kartenschuh</text>
        </g>
      </svg>
      <p className="mt-1 text-xs text-muted">
        Die Runden dieses Tisches laufen in der Demo genauso ab wie im normalen Baccarat. Es ist keine
        Übertragung angebunden.
      </p>
    </section>
  );
}

/** Sachliche Regelerklärung — keine Strategieempfehlung. */
function DrawRules() {
  return (
    <div id="baccarat-rules" className="anim-fade-in mt-2 space-y-3 rounded-control border border-border-subtle bg-base p-3 text-xs text-muted">
      <div>
        <h4 className="text-sm font-medium text-primary">Ablauf</h4>
        <p className="mt-1">
          Spieler und Bank erhalten je zwei Karten. Hat eine der beiden Hände 8 oder 9 Punkte
          („Natural“), endet der Coup sofort. Sonst gelten die folgenden Ziehregeln; sie sind fest und
          werden nicht entschieden.
        </p>
      </div>
      <div>
        <h4 className="text-sm font-medium text-primary">Dritte Karte des Spielers</h4>
        <p className="mt-1">Bei 0 bis 5 Punkten zieht der Spieler eine dritte Karte, bei 6 oder 7 steht er.</p>
      </div>
      <div>
        <h4 className="text-sm font-medium text-primary">Dritte Karte der Bank</h4>
        <p className="mt-1">
          Steht der Spieler, zieht die Bank bei 0 bis 5 und steht bei 6 oder 7. Zieht der Spieler,
          entscheidet der Wert seiner dritten Karte:
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[18rem] border-collapse text-left">
            <caption className="sr-only">Ziehtabelle der Bank in Abhängigkeit von der dritten Karte des Spielers</caption>
            <thead>
              <tr className="border-b border-border-subtle text-primary">
                <th scope="col" className="py-1 pr-3 font-medium">Punkte der Bank</th>
                <th scope="col" className="py-1 font-medium">Bank zieht bei dritter Spielerkarte</th>
              </tr>
            </thead>
            <tbody className="tabular">
              <tr><th scope="row" className="py-1 pr-3 font-normal">0 – 2</th><td className="py-1">immer</td></tr>
              <tr><th scope="row" className="py-1 pr-3 font-normal">3</th><td className="py-1">0, 1, 2, 3, 4, 5, 6, 7, 9 (nicht bei 8)</td></tr>
              <tr><th scope="row" className="py-1 pr-3 font-normal">4</th><td className="py-1">2, 3, 4, 5, 6, 7</td></tr>
              <tr><th scope="row" className="py-1 pr-3 font-normal">5</th><td className="py-1">4, 5, 6, 7</td></tr>
              <tr><th scope="row" className="py-1 pr-3 font-normal">6</th><td className="py-1">6, 7</td></tr>
              <tr><th scope="row" className="py-1 pr-3 font-normal">7</th><td className="py-1">nie — die Bank steht</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <p>
        Gemischt wird ein Schuh aus acht Decks, für jede Runde neu. Kommission auf gewonnene
        Bankwetten: 5 %, auf ganze Hundertstel aufgerundet.
      </p>
    </div>
  );
}

function ResultHistory({ entries }: { entries: readonly HistoryEntry[] }) {
  return (
    <section aria-labelledby="baccarat-history-heading" className="rounded-card border border-border-subtle bg-base p-3">
      <h3 id="baccarat-history-heading" className="text-sm font-medium text-primary">
        Ergebnisverlauf
      </h3>
      <p className="mt-1 text-xs text-muted">
        Jede Runde ist unabhängig. Vergangene Ergebnisse verändern die Wahrscheinlichkeiten der
        nächsten Runde nicht — der Verlauf ist ein Protokoll, keine Vorhersage.
      </p>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Noch keine Runde gespielt.</p>
      ) : (
        <ol className="mt-2 flex flex-wrap gap-1.5">
          {entries.map((e) => (
            <li key={e.roundId}>
              <span className="tabular flex size-9 flex-col items-center justify-center rounded-control border border-border-control text-primary">
                <span aria-hidden="true" className="text-sm font-medium">{RESULT_SHORT[e.result]}</span>
                <span aria-hidden="true" className="text-[0.625rem] text-muted">{e.playerTotal}:{e.bankerTotal}</span>
                <span className="sr-only">
                  {RESULT_LONG[e.result]}, Punkte {e.playerTotal} zu {e.bankerTotal}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-xs text-muted">S = Spieler · B = Bank · U = Unentschieden</p>
    </section>
  );
}
