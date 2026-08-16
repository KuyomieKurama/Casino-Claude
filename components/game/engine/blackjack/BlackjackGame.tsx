"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, Layers, Play } from "lucide-react";
import type { GameEngineViewProps } from "@/types/engine";
import { formatCredits, formatCreditsWithUnit } from "@/lib/formatters";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { GameShell } from "../GameShell";
import { useRound } from "../useRound";
import {
  applyAction,
  availableActions,
  beginRound,
  handValue,
  isBlackjack,
  maxReturnFor,
  roundSettlement,
  type BlackjackAction,
  type Card,
  type PlayerHand,
  type RoundState,
  type Suit,
} from "./blackjack-logic";

/**
 * Blackjack — Classic, VIP und Live-Demo teilen dieselbe Fachlogik und dieselbe Oberfläche.
 * Interaktive Runde: das Ergebnis steht erst nach den Entscheidungen der spielenden Person fest.
 * Deshalb useRound({ interactive: true }) mit deklarierter Obergrenze und Abschluss über settle().
 *
 * Bewusst NICHT vorhanden (Regel 7):
 *  - kein Autoplay, keine Wiederhol-Automatik — jede Aktion ist ein eigener Klick
 *  - kein Loss Disguised as Win — die Shell zeigt die Nettoveränderung, nichts wird gefeiert
 *  - keine Strategieempfehlung — die Regelerklärung nennt nur Regeln, nie „richtige“ Entscheidungen
 *  - kein knapp-verfehlt-Effekt: 22 wird wie jedes andere Überkaufen behandelt
 *  - kein Ton, Pause bleibt sichtbar
 *
 * Kein RTP und keine Auszahlungstabelle: Der Erwartungswert hängt von den Entscheidungen der
 * spielenden Person ab. Ohne Tabelle wird auch kein RTP ausgewiesen (Regel 6 / ENGINE-BRIEF §3).
 */

const SUIT_SYMBOL: Record<Suit, string> = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
const SUIT_NAME: Record<Suit, string> = { hearts: "Herz", diamonds: "Karo", clubs: "Kreuz", spades: "Pik" };

const ACTION_LABEL: Record<BlackjackAction, string> = {
  hit: "Karte ziehen",
  stand: "Stehen bleiben",
  double: "Verdoppeln",
  split: "Teilen",
};

/** Wartezeit, in der der Dealer aufdeckt und zieht; solange sind alle Aktionen inaktiv. */
const DEALER_DELAY_MS = 900;

function handLabel(cards: readonly Card[]): string {
  const { total, soft } = handValue(cards);
  if (isBlackjack(cards)) return "Blackjack (21)";
  if (total > 21) return `${total} — überkauft`;
  return soft ? `weich ${total}` : `${total}`;
}

/** Karte: Rang und Farbe immer als Symbol UND als Text — Farbe ist nie die alleinige Information. */
function CardTile({ card, faceDown = false }: { card?: Card; faceDown?: boolean }) {
  if (faceDown || !card) {
    return (
      <div className="flex h-20 w-14 flex-col items-center justify-center rounded-control border border-border-control bg-elevated text-center">
        <span aria-hidden="true" className="text-lg text-muted">
          ✱
        </span>
        <span className="text-[0.625rem] leading-tight text-muted">verdeckt</span>
      </div>
    );
  }
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <div className="flex h-20 w-14 flex-col items-center justify-center rounded-control border border-border-control bg-base text-center">
      <span className="text-lg font-semibold leading-none text-primary">{card.rank}</span>
      <span aria-hidden="true" className={cn("text-lg leading-none", red ? "text-danger" : "text-primary")}>
        {SUIT_SYMBOL[card.suit]}
      </span>
      <span className="text-[0.625rem] leading-tight text-muted">{SUIT_NAME[card.suit]}</span>
      <span className="sr-only">
        {card.rank} {SUIT_NAME[card.suit]}
      </span>
    </div>
  );
}

function CardRow({ cards, hiddenIndex }: { cards: readonly Card[]; hiddenIndex?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {cards.map((card, i) => (
        <CardTile key={`${card.rank}-${card.suit}-${i}`} card={card} faceDown={i === hiddenIndex} />
      ))}
    </div>
  );
}

export function BlackjackGame({ game, simulateLoadError, onStatusChange }: GameEngineViewProps) {
  const [round, setRound] = useState<RoundState | null>(null);
  const [dealerBusy, setDealerBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  /** Zwischenspeicher: beginRound() läuft in resolve(), verwendet wird es erst nach der Wallet-Buchung. */
  const prepared = useRef<RoundState | null>(null);
  const dealerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolve = useCallback(({ stakeMinor, seed }: { stakeMinor: number; seed: number }) => {
    const state = beginRound(seed, stakeMinor);
    prepared.current = state;
    return {
      outcomeKey: "in-progress",
      outcomeLabel: "Runde läuft",
      // Beim Start ist noch nichts gewonnen; verbindlich ist allein die Obergrenze.
      returnMinor: 0,
      maxReturnMinor: maxReturnFor(stakeMinor),
    };
  }, []);

  const r = useRound({
    game,
    resolve,
    roundDurationMs: DEALER_DELAY_MS,
    interactive: true,
    ...(simulateLoadError === undefined ? {} : { simulateLoadError }),
    ...(onStatusChange === undefined ? {} : { onStatusChange }),
    defaultStakeMinor: 100,
  });

  const { settle } = r;

  useEffect(() => {
    return () => {
      if (dealerTimer.current) clearTimeout(dealerTimer.current);
    };
  }, []);

  const finish = useCallback(
    (state: RoundState) => {
      const s = roundSettlement(state);
      settle({
        returnMinor: s.returnMinor,
        outcomeKey: s.outcomeKey,
        outcomeLabel: s.outcomeLabel,
        detail: {
          totalBetMinor: s.totalBetMinor,
          extraBetMinor: s.extraBetMinor,
          grossReturnMinor: s.grossReturnMinor,
          hands: s.results.map((h) => h.kind),
          dealerTotal: handValue(state.dealer).total,
        },
      });
    },
    [settle],
  );

  /** Dealer deckt auf und zieht; solange bleiben alle Aktionen inaktiv. */
  const runDealer = useCallback(
    (state: RoundState) => {
      setDealerBusy(true);
      dealerTimer.current = setTimeout(() => {
        setDealerBusy(false);
        finish(state);
      }, DEALER_DELAY_MS);
    },
    [finish],
  );

  const deal = useCallback(() => {
    const started = r.start();
    const state = prepared.current;
    if (!started || !state) return;
    prepared.current = null;
    setRound(state);
    if (state.phase === "done") runDealer(state);
  }, [r, runDealer]);

  /**
   * Führt eine Aktion aus. Verdoppeln und Teilen erhöhen den Einsatz der Runde: Der Zusatzbetrag
   * wird ZUERST über den Wallet-Reducer gebucht (eigene demo_bet-Buchung mit derselben Runden-ID).
   * Nur wenn das gelingt, ändert sich der Spielzustand — bei fehlender Deckung bleibt der Tisch
   * unverändert und die Shell zeigt die Ablehnung am Einsatzfeld an.
   */
  const act = useCallback(
    (action: BlackjackAction) => {
      if (!round || round.phase !== "player" || dealerBusy) return;
      const hand = round.hands[round.activeHand];
      if (!hand) return;
      // Verdoppeln kostet den Einsatz dieser Hand noch einmal, Teilen den Grundeinsatz für die zweite Hand.
      const additionalMinor = action === "double" ? hand.betMinor : action === "split" ? round.baseBetMinor : 0;
      if (additionalMinor > 0 && !r.raiseStake(additionalMinor)) return;
      const next = applyAction(round, action);
      setRound(next);
      if (next.phase === "done") runDealer(next);
    },
    [round, dealerBusy, runDealer, r],
  );

  const actions = round && !dealerBusy ? availableActions(round) : [];
  const roundOpen = r.status === "playing";
  const settlement = useMemo(
    () => (round && round.phase === "done" && !dealerBusy && r.status === "finished" ? roundSettlement(round) : null),
    [round, dealerBusy, r.status],
  );
  const currentTotalBet = round ? round.hands.reduce((sum, h) => sum + h.betMinor, 0) : r.stake;
  const dealerHidden = round !== null && round.phase === "player";

  const controls = round ? (
    <div role="group" aria-label="Spielaktionen" className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {(["hit", "stand", "double", "split"] as const).map((action) => (
          <Button
            key={action}
            variant="outline"
            onClick={() => act(action)}
            disabled={!actions.includes(action)}
            className="min-h-11"
          >
            {ACTION_LABEL[action]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted" aria-live="polite">
        {dealerBusy
          ? "Der Dealer deckt auf und zieht. Aktionen sind währenddessen inaktiv."
          : round.phase === "player"
            ? `Hand ${round.activeHand + 1} von ${round.hands.length} ist am Zug.`
            : "Die Runde ist abgeschlossen."}
      </p>
    </div>
  ) : null;

  return (
    <GameShell
      game={game}
      status={r.status}
      hydrated={r.hydrated}
      last={r.last}
      available={r.available}
      stake={r.stake}
      onStakeChange={r.setStake}
      onRetryLoad={r.load}
      onTogglePause={r.togglePause}
      canStart={r.canStart}
      busy={r.busy}
      blocked={r.blocked}
      {...(r.blockReason === undefined ? {} : { blockReason: r.blockReason })}
      {...(r.inlineError ? { inlineErrorMessage: r.inlineError.message } : {})}
      insufficient={r.insufficient}
      freeSpins={r.wallet.freeSpins}
      useFreeSpin={r.useFreeSpin}
      onUseFreeSpinChange={r.setUseFreeSpin}
      stakeLocked={roundOpen}
      controls={controls}
      actionHint={
        <>
          Startet eine Demo-Runde und zieht {formatCreditsWithUnit(r.stake)} Demo-Guthaben ab. Verdoppeln und Teilen
          buchen währenddessen jeweils einen weiteren Einsatz in gleicher Höhe ab. Kein Echtgeld.
        </>
      }
      primaryAction={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={deal}
          disabled={!r.canStart || roundOpen}
          iconLeft={<Play className="size-4" aria-hidden="true" />}
        >
          {roundOpen ? "Runde läuft" : "Karten geben"}
        </Button>
      }
    >
      <div className="space-y-4">
        {game.isLiveDemo ? <LiveTableIllustration /> : null}

        <h3 className="sr-only">Spieltisch</h3>

        {round ? (
          <div className="space-y-4 rounded-card border border-border-subtle bg-base p-3 sm:p-4">
            {/* Dealer */}
            <section aria-label="Hand des Dealers" className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-medium text-primary">Dealer</h4>
                <p className="tabular text-sm text-muted">
                  {dealerHidden
                    ? `Sichtbar: ${handValue(round.dealer.slice(0, 1)).total}`
                    : `Wert: ${handLabel(round.dealer)}`}
                </p>
              </div>
              <CardRow cards={round.dealer} {...(dealerHidden ? { hiddenIndex: 1 } : {})} />
            </section>

            {/* Spielerhände */}
            <section aria-label="Deine Hände" className="space-y-3">
              {round.hands.map((hand, i) => (
                <PlayerHandView
                  key={i}
                  hand={hand}
                  index={i}
                  count={round.hands.length}
                  active={round.phase === "player" && round.activeHand === i && !dealerBusy}
                  result={settlement?.results[i]?.kind}
                />
              ))}
            </section>

            <p className="tabular text-sm text-muted">
              Effektiver Gesamteinsatz dieser Runde: {formatCredits(currentTotalBet)} Credits
              {currentTotalBet > round.baseBetMinor
                ? ` (Grundeinsatz ${formatCredits(round.baseBetMinor)} + Zusatz ${formatCredits(currentTotalBet - round.baseBetMinor)})`
                : ""}
            </p>

            {settlement && settlement.extraBetMinor > 0 ? (
              <p className="tabular text-sm text-muted">
                Davon {formatCredits(settlement.extraBetMinor)} Credits Zusatzeinsatz — als eigene Buchung mit
                derselben Runden-ID in der Historie.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-card border border-border-subtle bg-base p-6 text-center">
            <Layers className="mx-auto size-6 text-muted" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted">
              Noch keine Karten. Einsatz wählen und „Karten geben“ auswählen — du erhältst zwei Karten, der Dealer eine
              offene und eine verdeckte.
            </p>
          </div>
        )}

        {/* Einsatzführung transparent ausweisen — Kennzeichnung Ebene 3 vor geldbewegenden Aktionen */}
        <p className="rounded-control border border-border-control bg-base p-3 text-xs text-muted">
          <strong className="font-medium text-primary">Zum Einsatz:</strong> Verdoppeln und Teilen erhöhen den Einsatz
          dieser Runde. Der Zusatzeinsatz wird sofort vom Demo-Guthaben abgebucht und erscheint als eigene Buchung mit
          derselben Runden-ID in deiner Historie. Reicht das Guthaben dafür nicht, bleibt die Aktion aus und der Tisch
          unverändert.
        </p>

        <div>
          <Button
            variant="ghost"
            onClick={() => setRulesOpen((v) => !v)}
            aria-expanded={rulesOpen}
            aria-controls="blackjack-rules"
            iconLeft={<Info className="size-4" aria-hidden="true" />}
          >
            {rulesOpen ? "Regeln ausblenden" : "Regeln einblenden"}
          </Button>
          {rulesOpen ? (
            <div id="blackjack-rules" className="mt-2 space-y-2 rounded-control border border-border-subtle bg-base p-3 text-sm text-muted anim-fade-in">
              <h4 className="text-sm font-medium text-primary">Regeln dieser Demo</h4>
              <ul className="list-disc space-y-1 pl-5">
                <li>Ziel ist eine Hand, die näher an 21 liegt als die des Dealers, ohne 21 zu überschreiten.</li>
                <li>Zahlenkarten zählen ihren Wert, Bube, Dame und König zählen 10, ein Ass zählt 11 oder 1.</li>
                <li>Eine Hand heißt „weich“, solange ein Ass als 11 gezählt wird — etwa „weich 17“ bei Ass und Sechs.</li>
                <li>Gespielt wird mit sechs Decks, die vor jeder Runde neu gemischt werden.</li>
                <li>Der Dealer zieht bis 17 und steht bei Soft 17.</li>
                <li>Verdoppeln ist nur mit den ersten beiden Karten möglich: doppelter Handeinsatz, genau eine weitere Karte.</li>
                <li>Teilen ist bei zwei Karten gleichen Rangs möglich, einmal pro Runde. Geteilte Asse erhalten je eine Karte.</li>
                <li>Blackjack (Ass plus Zehnerkarte aus den ersten beiden Karten) zahlt 3:2, ein gewöhnlicher Gewinn 1:1.</li>
                <li>Bei Gleichstand gibt es den Einsatz zurück (Push). Über 21 verliert die Hand sofort.</li>
                <li>Versicherung und Aufgeben sind in dieser Demo nicht enthalten.</li>
              </ul>
              <p>
                Diese Übersicht beschreibt die Regeln. Sie enthält bewusst keine Empfehlung, wie zu entscheiden ist.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </GameShell>
  );
}

function PlayerHandView({
  hand,
  index,
  count,
  active,
  result,
}: {
  hand: PlayerHand;
  index: number;
  count: number;
  active: boolean;
  result?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-control border p-2",
        // Der aktive Zustand steht als Text daneben, nicht nur als Rahmenfarbe.
        active ? "border-border-control" : "border-border-subtle",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium text-primary">
          {count > 1 ? `Deine Hand ${index + 1}` : "Deine Hand"}
          {active ? <span className="ml-2 text-xs font-normal text-teal">— am Zug</span> : null}
        </h4>
        <p className="tabular text-sm text-muted">
          Wert: {handLabel(hand.cards)}
          {hand.doubled ? " · verdoppelt" : ""}
          {hand.fromSplit ? " · geteilt" : ""}
        </p>
      </div>
      <div className="mt-2">
        <CardRow cards={hand.cards} />
      </div>
      {result ? <p className="mt-2 text-sm text-muted">Ergebnis: {RESULT_TEXT[result] ?? result}</p> : null}
    </div>
  );
}

const RESULT_TEXT: Record<string, string> = {
  blackjack: "Blackjack, Auszahlung 3:2",
  win: "gewonnen",
  push: "Push, Einsatz zurück",
  lose: "verloren",
  bust: "überkauft",
  "dealer-blackjack": "verloren, Dealer hat Blackjack",
};

/**
 * Statische Illustration eines Tischausschnitts für die Live-Demo (Regel 8):
 * keine Personen, kein Video, kein Stream — nur abstrakte Formen mit erklärendem Text.
 */
function LiveTableIllustration() {
  return (
    <section aria-label="Illustration des Live-Tisches" className="rounded-card border border-border-subtle bg-base p-3">
      <div aria-hidden="true" className="flex items-end justify-center gap-1">
        <span className="h-6 w-10 rounded-t-full border border-border-control bg-elevated" />
        <span className="h-10 w-24 rounded-t-full border border-border-control bg-elevated" />
        <span className="h-6 w-10 rounded-t-full border border-border-control bg-elevated" />
      </div>
      <div aria-hidden="true" className="mt-1 h-px w-full bg-gold/60" />
      <p className="mt-2 text-xs text-muted">
        Statische Illustration eines Tischausschnitts. Dieser Live-Bereich zeigt weder Video noch Personen; gespielt wird
        dieselbe simulierte Demo-Runde wie an den übrigen Blackjack-Tischen.
      </p>
    </section>
  );
}
