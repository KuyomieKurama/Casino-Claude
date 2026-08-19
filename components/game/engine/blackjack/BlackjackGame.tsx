"use client";

import { useEffect, useRef, useState } from "react";
import { Info, Layers, Play } from "lucide-react";
import type { GameEngineViewProps } from "@/types/engine";
import { formatCredits, formatCreditsWithUnit } from "@/lib/formatters";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { GameShell } from "../GameShell";
import { useRound } from "../useRound";
import { useSound } from "../sound/useEngineSound";
import { useRoundSettleSound } from "../sound/useRoundSettleSound";
import { RANKS, SUITS, availableActions, handValue, isBlackjack, type BlackjackAction, type Card, type PlayerHand, type RoundState, type Suit } from "./blackjack-logic";

/**
 * Blackjack — Classic, VIP und Live-Demo teilen dieselbe Fachlogik und dieselbe Oberfläche.
 * Seit Phase 3b vollständig serverseitig aufgelöst: `useRound({ server: true, interactive: true })`
 * ruft `POST /api/rounds/interactive-start` (Austeilen) und `POST /api/rounds/:id/actions`
 * (hit/stand/double/split) auf. `r.interactiveState` ist GENAU das, was der Server preisgibt —
 * solange die Runde läuft, enthält die verdeckte Dealerkarte NIE mehr als die eine offene Karte
 * (server/rounds/interactive/blackjack-adapter.ts::blackjackPublicView).
 *
 * `availableActions()`/`handValue()`/`isBlackjack()` aus blackjack-logic.ts sind reine Funktionen,
 * die nur `phase`, `hands`, `activeHand` bzw. einzelne Kartenlisten lesen — nie den Kartenschlitten
 * oder den Seed. Der Cast auf `RoundState` unten ist deshalb sicher (siehe Kommentar dort): die
 * Oberfläche bekommt trotzdem nie mehr Informationen, als der Server tatsächlich sendet.
 *
 * Bewusst NICHT vorhanden (Regel 7):
 *  - kein Autoplay, keine Wiederhol-Automatik — jede Aktion ist ein eigener Serveraufruf
 *  - kein Loss Disguised as Win — die Shell zeigt die Nettoveränderung, nichts wird gefeiert
 *  - keine Strategieempfehlung — die Regelerklärung nennt nur Regeln, nie „richtige“ Entscheidungen
 *  - kein knapp-verfehlt-Effekt: 22 wird wie jedes andere Überkaufen behandelt
 *  - Pause bleibt sichtbar
 *
 * Kein RTP und keine Auszahlungstabelle: Der Erwartungswert hängt von den Entscheidungen der
 * spielenden Person ab. Ohne Tabelle wird auch kein RTP ausgewiesen (Regel 6 / ENGINE-BRIEF §3).
 *
 * Klang: "card" jedes Mal, wenn sich die Gesamtzahl sichtbarer Karten erhöht — deckt Austeilen,
 * jeden Hit, Double und den Aufdeck-/Zieh-Vorgang des Dealers in einem Aufruf ab, auch wenn dabei
 * mehrere Karten auf einmal erscheinen (kein Ton pro Einzelkarte). "click" bei jeder gewählten
 * Aktion (hit/stand/double/split). "win" nur bei echtem Netto-Gewinn, sonst "settle" — ein Push
 * (Gleichstand, Einsatz zurück, netMinor 0) bekommt deshalb "settle", nicht "win", genauso wie
 * ein Bust auf 22 (kein Unterschied zu einem Bust auf 30).
 */

const SUIT_SYMBOL: Record<Suit, string> = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
const SUIT_NAME: Record<Suit, string> = { hearts: "Herz", diamonds: "Karo", clubs: "Kreuz", spades: "Pik" };

const ACTION_LABEL: Record<BlackjackAction, string> = {
  hit: "Karte ziehen",
  stand: "Stehen bleiben",
  double: "Verdoppeln",
  split: "Teilen",
};

const RESULT_TEXT: Record<string, string> = {
  blackjack: "Blackjack, Auszahlung 3:2",
  win: "gewonnen",
  push: "Push, Einsatz zurück",
  lose: "verloren",
  bust: "überkauft",
  "dealer-blackjack": "verloren, Dealer hat Blackjack",
};

/** Sichtbarer Rundenzustand, wie ihn server/rounds/interactive/blackjack-adapter.ts::blackjackPublicView() liefert. */
type BlackjackServerState = {
  dealer: Card[];
  hands: PlayerHand[];
  activeHand: number;
  phase: "player" | "done";
  baseBetMinor: number;
};

function isCard(value: unknown): value is Card {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.rank === "string" && (RANKS as readonly string[]).includes(v.rank) && typeof v.suit === "string" && (SUITS as readonly string[]).includes(v.suit);
}

function isPlayerHand(value: unknown): value is PlayerHand {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.cards) &&
    v.cards.every(isCard) &&
    typeof v.betMinor === "number" &&
    typeof v.doubled === "boolean" &&
    typeof v.fromSplit === "boolean" &&
    typeof v.splitAces === "boolean" &&
    typeof v.done === "boolean"
  );
}

/** Nie vertrauenswürdige externe Eingabe ungeprüft durchreichen (coding-style.md). */
function parseBlackjackServerState(value: unknown): BlackjackServerState | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.dealer) || !v.dealer.every(isCard)) return null;
  if (!Array.isArray(v.hands) || !v.hands.every(isPlayerHand)) return null;
  if (typeof v.activeHand !== "number") return null;
  if (v.phase !== "player" && v.phase !== "done") return null;
  if (typeof v.baseBetMinor !== "number") return null;
  return { dealer: v.dealer as Card[], hands: v.hands as PlayerHand[], activeHand: v.activeHand, phase: v.phase, baseBetMinor: v.baseBetMinor };
}

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
  const [rulesOpen, setRulesOpen] = useState(false);

  const r = useRound({
    game,
    roundDurationMs: 900,
    interactive: true,
    server: true,
    ...(simulateLoadError === undefined ? {} : { simulateLoadError }),
    ...(onStatusChange === undefined ? {} : { onStatusChange }),
    defaultStakeMinor: 100,
  });

  const { play } = useSound();
  useRoundSettleSound(r.last, r.inlineError);

  const state = parseBlackjackServerState(r.interactiveState);
  const roundOpen = r.status === "playing";
  // Server hat bereits abgerechnet (phase "done"), aber die Animationsverzögerung läuft noch —
  // solange bleiben alle Aktionen inaktiv (ersetzt den früheren lokalen runDealer()-Timer).
  const dealerBusy = roundOpen && state?.phase === "done";
  const dealerHidden = state !== null && state.phase === "player";

  // "card" bei jeder Zunahme der sichtbaren Kartenzahl — deckt Austeilen, Hit, Double und den
  // Dealer-Aufdeck-/Zug-Schritt ab, ohne pro Einzelkarte zu spielen (siehe Dateikommentar).
  const visibleCardCount = state ? state.dealer.length + state.hands.reduce((sum, h) => sum + h.cards.length, 0) : 0;
  const lastCardCount = useRef(0);
  useEffect(() => {
    if (visibleCardCount > lastCardCount.current) play("card");
    lastCardCount.current = visibleCardCount;
  }, [visibleCardCount, play]);

  const deal = () => {
    void r.startInteractive();
  };

  const act = (action: BlackjackAction) => {
    if (!state || state.phase !== "player" || dealerBusy) return;
    play("click");
    void r.sendAction(action, {});
  };

  // availableActions() liest ausschließlich phase/hands/activeHand (siehe Dateikommentar) — der
  // Cast ist sicher, weil die Funktion die übrigen RoundState-Felder (shoe, seed, drawIndex)
  // beweisbar nie anfasst; die Oberfläche selbst bekommt sie trotzdem nie vom Server.
  const actions = state && state.phase === "player" && !dealerBusy ? availableActions(state as unknown as RoundState) : [];
  const handResults = r.status === "finished" && Array.isArray(r.last?.detail?.hands) ? (r.last.detail.hands as string[]) : null;
  const currentTotalBet = state ? state.hands.reduce((sum, h) => sum + h.betMinor, 0) : r.stake;
  const extraBetMinor = state ? currentTotalBet - state.baseBetMinor : 0;

  const controls = state ? (
    <div role="group" aria-label="Spielaktionen" className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {(["hit", "stand", "double", "split"] as const).map((action) => (
          <Button key={action} variant="outline" onClick={() => act(action)} disabled={!actions.includes(action)} className="min-h-11">
            {ACTION_LABEL[action]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted" aria-live="polite">
        {dealerBusy
          ? "Der Dealer deckt auf und zieht. Aktionen sind währenddessen inaktiv."
          : state.phase === "player"
            ? `Hand ${state.activeHand + 1} von ${state.hands.length} ist am Zug.`
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
          Startet eine Runde und zieht {formatCreditsWithUnit(r.stake)} Guthaben ab. Verdoppeln und Teilen
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

        {state ? (
          <div className="space-y-4 rounded-card border border-border-subtle bg-base p-3 sm:p-4">
            {/* Dealer */}
            <section aria-label="Hand des Dealers" className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-medium text-primary">Dealer</h4>
                <p className="tabular text-sm text-muted">
                  {dealerHidden ? `Sichtbar: ${handValue(state.dealer.slice(0, 1)).total}` : `Wert: ${handLabel(state.dealer)}`}
                </p>
              </div>
              <CardRow cards={state.dealer} {...(dealerHidden ? { hiddenIndex: 1 } : {})} />
            </section>

            {/* Spielerhände */}
            <section aria-label="Deine Hände" className="space-y-3">
              {state.hands.map((hand, i) => (
                <PlayerHandView
                  key={i}
                  hand={hand}
                  index={i}
                  count={state.hands.length}
                  active={state.phase === "player" && state.activeHand === i && !dealerBusy}
                  result={handResults?.[i]}
                />
              ))}
            </section>

            <p className="tabular text-sm text-muted">
              Effektiver Gesamteinsatz dieser Runde: {formatCredits(currentTotalBet)} Credits
              {currentTotalBet > state.baseBetMinor
                ? ` (Grundeinsatz ${formatCredits(state.baseBetMinor)} + Zusatz ${formatCredits(currentTotalBet - state.baseBetMinor)})`
                : ""}
            </p>

            {r.status === "finished" && extraBetMinor > 0 ? (
              <p className="tabular text-sm text-muted">
                Davon {formatCredits(extraBetMinor)} Credits Zusatzeinsatz — als eigene Buchung mit derselben
                Runden-ID in der Historie.
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
          dieser Runde. Der Zusatzeinsatz wird sofort vom Guthaben abgebucht und erscheint als eigene Buchung mit
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
              <h4 className="text-sm font-medium text-primary">Regeln</h4>
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
                <li>Versicherung und Aufgeben sind derzeit nicht umgesetzt.</li>
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
        dieselbe Runde wie an den übrigen Blackjack-Tischen.
      </p>
    </section>
  );
}
