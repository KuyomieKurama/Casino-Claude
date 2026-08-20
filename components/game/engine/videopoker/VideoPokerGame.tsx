"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Play, RefreshCw } from "lucide-react";
import type { GameEngineViewProps } from "@/types/engine";
import { formatCredits, formatCreditsWithUnit, formatMultiplier } from "@/lib/formatters";
import { ROUND_DURATION_MS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useRound } from "../useRound";
import { GameShell } from "../GameShell";
import { useSound } from "../sound/useEngineSound";
import { useRoundSettleSound } from "../sound/useRoundSettleSound";
import { HAND_SIZE, MAX_MULTIPLIER, PAYTABLE, type HandCategory, type PokerCard } from "./videopoker-logic";

/**
 * Video Poker „Jacks or Better“ — interaktive Engine (ein Tausch je Runde), seit Phase 3b
 * vollständig serverseitig aufgelöst: `useRound({ server: true, interactive: true })` ruft
 * `POST /api/rounds/interactive-start` (Geben) und `POST /api/rounds/:id/actions`
 * (`draw` mit der Halteauswahl) auf. `r.interactiveState` zeigt vor dem Tausch NUR die eigene
 * Starthand — nie das ungezogene Restdeck (server/rounds/interactive/videopoker-adapter.ts).
 *
 * Bewusst NICHT vorhanden (Regel 7, im Code dokumentiert):
 *  - kein Near Miss: eine Hand, der eine Karte zur Straße fehlt, wird nicht hervorgehoben;
 *    angezeigt wird ausschließlich die tatsächlich erreichte Kategorie
 *  - kein Loss Disguised as Win: die Shell zeigt netto; „Paar Buben oder besser“ gibt genau den
 *    Einsatz zurück und wird deshalb als ±0,00 dargestellt, nicht als Gewinn
 *  - kein Autoplay, keine automatische Kartenauswahl, keine Halte-Empfehlung (das wäre eine
 *    Strategieaussage)
 *  - keine vorausgewählten Halte-Karten — die Runde startet mit fünf ungehaltenen Karten
 *  - kein RTP-Ausweis: der Erwartungswert hängt von der Tauschentscheidung ab (siehe Logikdatei)
 *
 * Barrierefreiheit: Farbe ist nie die alleinige Information. Jede Karte trägt Rang, Farbsymbol
 * und den ausgeschriebenen Farbnamen; „Gehalten“ steht als Text auf der Karte.
 *
 * Klang: "card" beim Geben (Starthand) und erneut beim Aufdecken der Endhand nach dem Tausch —
 * beides Momente, in denen neue Karten sichtbar werden. "click" beim Halten/Lösen einer Karte
 * (die einzige Spieleraktion vor dem Tausch). "win" nur bei echtem Netto-Gewinn, sonst "settle" —
 * "Paar Buben oder besser" gibt genau den Einsatz zurück (netMinor 0) und bekommt deshalb
 * "settle", nicht "win".
 */

const RANK_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K"] as const;
const RANK_NAME = ["", "Ass", "Zwei", "Drei", "Vier", "Fünf", "Sechs", "Sieben", "Acht", "Neun", "Zehn", "Bube", "Dame", "König"] as const;
const SUIT_SYMBOL = ["♣", "♦", "♥", "♠"] as const;
const SUIT_NAME = ["Kreuz", "Karo", "Herz", "Pik"] as const;

const NO_HOLDS: readonly boolean[] = [false, false, false, false, false];

const HAND_CATEGORIES: readonly HandCategory[] = PAYTABLE.map((e) => e.category);

/** Sichtbarer Rundenzustand, wie ihn server/rounds/interactive/videopoker-adapter.ts::videoPokerPublicView() liefert. */
type VideoPokerServerState = {
  hand: PokerCard[];
  finalHand: PokerCard[] | null;
  category: HandCategory | null;
};

function isPokerCard(value: unknown): value is PokerCard {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.rank === "number" && v.rank >= 1 && v.rank <= 13 && typeof v.suit === "number" && v.suit >= 0 && v.suit <= 3;
}

/** Nie vertrauenswürdige externe Eingabe ungeprüft durchreichen (coding-style.md). */
function parseVideoPokerServerState(value: unknown): VideoPokerServerState | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.hand) || v.hand.length !== HAND_SIZE || !v.hand.every(isPokerCard)) return null;
  const finalHand = v.finalHand === null ? null : Array.isArray(v.finalHand) && v.finalHand.every(isPokerCard) ? (v.finalHand as PokerCard[]) : undefined;
  if (finalHand === undefined) return null;
  const category = v.category === null ? null : typeof v.category === "string" && (HAND_CATEGORIES as readonly string[]).includes(v.category) ? (v.category as HandCategory) : undefined;
  if (category === undefined) return null;
  return { hand: v.hand as PokerCard[], finalHand, category };
}

export function VideoPokerGame({ game, simulateLoadError, onStatusChange }: GameEngineViewProps) {
  const round = useRound({
    game,
    roundDurationMs: ROUND_DURATION_MS,
    interactive: true,
    server: true,
    simulateLoadError,
    onStatusChange,
    defaultStakeMinor: 100,
  });

  const [holds, setHolds] = useState<readonly boolean[]>(NO_HOLDS);
  const [stakeAtStart, setStakeAtStart] = useState(0);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const { play } = useSound();
  useRoundSettleSound(round.last, round.inlineError);

  const state = parseVideoPokerServerState(round.interactiveState);
  /** Tauschphase: Karten liegen, die Runde ist gebucht, der Tausch steht noch aus. */
  const inHoldPhase = state !== null && state.finalHand === null && round.status === "playing";

  // "card" genau einmal beim Geben (Starthand erscheint) und genau einmal beim Aufdecken der
  // Endhand nach dem Tausch — je ein Ref pro Phase, zurückgesetzt sobald keine Hand mehr liegt
  // (neue Runde). `state` ist bei jedem Render ein neues Objekt, deshalb entscheiden die Refs
  // über das tatsächliche Abspielen, nicht die Häufigkeit der Effekt-Aufrufe.
  const dealSoundPlayed = useRef(false);
  const finalSoundPlayed = useRef(false);
  useEffect(() => {
    if (!state) {
      dealSoundPlayed.current = false;
      finalSoundPlayed.current = false;
      return;
    }
    if (!dealSoundPlayed.current) {
      dealSoundPlayed.current = true;
      play("card");
    }
    if (state.finalHand && !finalSoundPlayed.current) {
      finalSoundPlayed.current = true;
      play("card");
    }
  }, [state, play]);

  const dealCards = () => {
    setHolds(NO_HOLDS);
    setStakeAtStart(round.stake);
    void round.startInteractive();
  };

  const exchangeCards = () => {
    if (!inHoldPhase) return;
    void round.sendAction("draw", { holds: [...holds] });
  };

  const toggleHold = useCallback(
    (index: number) => {
      if (!inHoldPhase) return;
      play("click");
      setHolds((prev) => prev.map((h, i) => (i === index ? !h : h)));
    },
    [inHoldPhase, play],
  );

  /** Ziffern 1–5 halten oder geben die entsprechende Karte frei, solange der Tausch aussteht. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = Number.parseInt(event.key, 10) - 1;
    if (Number.isNaN(index) || index < 0 || index >= HAND_SIZE) return;
    event.preventDefault();
    toggleHold(index);
    cardRefs.current[index]?.focus();
  };

  const shownHand = state?.finalHand ?? state?.hand ?? null;
  const heldCount = holds.filter(Boolean).length;
  const finalHand = state?.finalHand ?? null;
  const category = state?.category ?? null;

  const primaryAction = inHoldPhase ? (
    <Button variant="primary" size="lg" fullWidth onClick={exchangeCards} iconLeft={<RefreshCw className="size-4" aria-hidden="true" />}>
      {heldCount === HAND_SIZE ? "Hand behalten und aufdecken" : `Tauschen (${HAND_SIZE - heldCount} von ${HAND_SIZE} Karten)`}
    </Button>
  ) : (
    <Button variant="primary" size="lg" fullWidth onClick={dealCards} disabled={!round.canStart} iconLeft={<Play className="size-4" aria-hidden="true" />}>
      Karten geben
    </Button>
  );

  return (
    <GameShell
      game={game}
      status={round.status}
      hydrated={round.hydrated}
      primaryAction={primaryAction}
      last={round.last}
      available={round.available}
      stake={round.stake}
      onStakeChange={round.setStake}
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
      stakeLocked={inHoldPhase}
      actionHint={
        inHoldPhase ? (
          <>
            Der Einsatz von {formatCreditsWithUnit(stakeAtStart)} ist bereits gebucht. Der Tausch kostet nichts
            zusätzlich. Höchstmögliche Rückgabe dieser Runde: {formatCreditsWithUnit(stakeAtStart * MAX_MULTIPLIER)}.
          </>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <section aria-labelledby="vp-hand-heading" className="edge-light rounded-card border border-border-control bg-base p-3 sm:p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="vp-hand-heading" className="text-sm font-medium text-primary">
              Deine fünf Karten
            </h3>
            <p className="text-xs text-muted">
              {inHoldPhase
                ? `${heldCount} von ${HAND_SIZE} Karten gehalten`
                : finalHand
                  ? "Runde abgeschlossen"
                  : "Noch keine Karten gegeben"}
            </p>
          </div>

          <div
            role="group"
            aria-label="Karten halten oder tauschen"
            onKeyDown={onKeyDown}
            className="mt-3 grid grid-cols-5 gap-1.5 sm:gap-2"
          >
            {Array.from({ length: HAND_SIZE }, (_, i) => (
              <CardSlot
                key={i}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                index={i}
                card={shownHand?.[i]}
                held={holds[i] === true}
                interactive={inHoldPhase}
                onToggle={() => toggleHold(i)}
              />
            ))}
          </div>

          <p className="mt-2 text-xs text-muted">
            {inHoldPhase
              ? "Karten zum Behalten markieren — per Klick oder mit den Ziffern 1 bis 5. Nicht markierte Karten werden einmal getauscht."
              : "Nach dem Geben markierst du die Karten, die du behalten willst. Es gibt genau einen Tausch pro Runde."}
          </p>

          {finalHand && category ? (
            <p className="mt-2 text-sm text-primary">
              Endhand: {PAYTABLE.find((e) => e.category === category)?.label} · Rückgabe{" "}
              {formatMultiplier(PAYTABLE.find((e) => e.category === category)?.multiplier ?? 0)} des Einsatzes
            </p>
          ) : null}
        </section>

        <PaytableView stakeMinor={round.stake} achieved={finalHand ? category : null} />
      </div>
    </GameShell>
  );
}

type CardSlotProps = {
  index: number;
  card?: PokerCard;
  held: boolean;
  interactive: boolean;
  onToggle: () => void;
};

const CardSlot = function CardSlotInner({ ref, index, card, held, interactive, onToggle }: CardSlotProps & { ref?: Ref<HTMLButtonElement> }) {
  const rank = card ? (RANK_LABEL[card.rank] ?? "?") : "";
  const rankName = card ? (RANK_NAME[card.rank] ?? "") : "";
  const suit = card ? (SUIT_SYMBOL[card.suit] ?? "") : "";
  const suitName = card ? (SUIT_NAME[card.suit] ?? "") : "";
  const position = `Karte ${index + 1} von ${HAND_SIZE}`;

  return (
    <button
      ref={ref}
      type="button"
      disabled={!interactive}
      aria-pressed={interactive ? held : undefined}
      aria-label={card ? `${position}: ${rankName} ${suitName}. ${held ? "Gehalten." : "Nicht gehalten."}` : `${position}: noch keine Karte`}
      onClick={onToggle}
      className={cn(
        "edge-light flex min-h-[6.5rem] min-w-11 flex-col items-center justify-center gap-0.5 rounded-control border bg-surface px-1 py-2 transition-state",
        "disabled:cursor-default",
        // Gehalten-Zustand violett statt golden: Gold bleibt der einen CTA-Fläche
        // vorbehalten, „gehalten" ist ein Nutzerauswahlzustand, kein Primär-CTA.
        held ? "border-accent" : "border-border-control",
        interactive && !held && "hover:border-accent",
      )}
    >
      {card ? (
        <>
          <span className="text-lg font-semibold text-primary" aria-hidden="true">
            {rank}
          </span>
          <span className="text-base text-primary" aria-hidden="true">
            {suit}
          </span>
          {/* Textlabel zusätzlich zum Symbol: Farbe ist nie die alleinige Information. */}
          <span className="text-xs leading-tight text-muted" aria-hidden="true">
            {suitName}
          </span>
        </>
      ) : (
        <span className="text-sm text-muted" aria-hidden="true">
          –
        </span>
      )}
      <span
        aria-hidden="true"
        className={cn("mt-0.5 rounded-full px-1.5 text-xs leading-4", held ? "border border-accent text-accent" : "text-muted")}
      >
        {held ? "Gehalten" : `Nr. ${index + 1}`}
      </span>
    </button>
  );
};

function PaytableView({ stakeMinor, achieved }: { stakeMinor: number; achieved: HandCategory | null }) {
  return (
    <section aria-labelledby="vp-paytable-heading" className="edge-light rounded-card border border-border-subtle bg-base p-3">
      <h3 id="vp-paytable-heading" className="text-sm font-medium text-primary">
        Gewinntabelle (9/6)
      </h3>
      <p className="mt-1 text-xs text-muted">
        Rückgabe je Hand, bezogen auf den aktuellen Einsatz von {formatCredits(stakeMinor)} Credits. Die Werte
        sind fest und ändern sich nicht während des Spiels.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[16rem] border-collapse text-left text-xs">
          <caption className="sr-only">Gewinntabelle Jacks or Better, Variante 9/6</caption>
          <thead>
            <tr className="border-b border-border-subtle text-primary">
              <th scope="col" className="py-1 pr-3 font-medium">Hand</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">Multiplikator</th>
              <th scope="col" className="py-1 text-right font-medium">Rückgabe</th>
            </tr>
          </thead>
          <tbody>
            {PAYTABLE.map((entry) => {
              const isAchieved = achieved === entry.category;
              return (
                <tr key={entry.category} className={cn("border-b border-border-subtle/60", isAchieved && "text-accent")}>
                  <th scope="row" className="py-1 pr-3 font-normal">
                    {/* Erreichte Kategorie zusätzlich fett und als Text markiert, nicht nur farblich —
                        Gold bleibt dem Primär-CTA vorbehalten, hier gilt derselbe violette Akzent wie
                        bei "Gehalten" auf den Karten. */}
                    <span className={cn(isAchieved && "font-semibold")}>{entry.label}</span>
                    {isAchieved ? <span className="ml-1 text-xs">— diese Runde</span> : null}
                  </th>
                  <td className="tabular py-1 pr-3 text-right">{formatMultiplier(entry.multiplier)}</td>
                  <td className="tabular py-1 text-right">{formatCredits(stakeMinor * entry.multiplier)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Der Royal Flush zahlt 250× — das ist die Ein-Münzen-Spalte der 9/6-Tabelle. Der oft genannte
        Wert 800× gilt nur bei fünffachem Einsatz, den diese Variante nicht kennt.
      </p>
      <p className="mt-1 text-xs text-muted">
        Für dieses Spiel wird kein RTP ausgewiesen: Die Rückgabe hängt davon ab, welche Karten du
        behältst. Ein einzelner Prozentwert würde eine bestimmte Spielweise voraussetzen.
      </p>
    </section>
  );
}
