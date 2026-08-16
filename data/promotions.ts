import type { CreditsMinor } from "@/types/money";

export type Promotion = {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** Was die Demo-Aktivierung gutschreibt. Rein additiv, ohne Bedingungen (Konzept L2). */
  reward: { bonusMinor?: CreditsMinor; freeSpins?: number };
  rewardLabel: string;
  validUntilLabel: string;
  status: "active" | "upcoming" | "expired";
};

/**
 * Drei Beispiele als UI-Muster (§8.10). Keine Einzahlungsvoraussetzungen, keine
 * Umsatzbedingungen, keine Aussagen zu Gewinnchancen, keine Verknappung.
 */
export const promotions: readonly Promotion[] = [
  {
    id: "p-welcome",
    slug: "demo-willkommensbonus",
    title: "Demo-Willkommensbonus",
    description:
      "Zum Kennenlernen des Prototyps: 200 Freirunden für Demo-Slots. Eine Freirunde verbraucht eine Freirunde statt Demo-Credits. Ohne Bedingungen, ohne Einzahlung — es gibt keine.",
    reward: { freeSpins: 200 },
    rewardLabel: "200 Freirunden (Demo)",
    validUntilLabel: "Beispiel-Gültigkeit: unbegrenzt im Prototyp",
    status: "active",
  },
  {
    id: "p-weekend",
    slug: "weekend-challenge",
    title: "Weekend Challenge",
    description:
      "Ein Beispiel für eine zeitlich gerahmte Aktion: Am Wochenende gibt es 50,00 Demo-Credits als Bonusguthaben. Rein illustrativ, kein Wettbewerb, keine Rangliste.",
    reward: { bonusMinor: 5000 },
    rewardLabel: "50,00 Bonus-Credits (Demo)",
    validUntilLabel: "Beispiel-Gültigkeit: jedes Wochenende (Mock)",
    status: "active",
  },
  {
    id: "p-vip",
    slug: "vip-lounge",
    title: "VIP-Lounge",
    description:
      "Platzhalter für ein Treueprogramm. In dieser Demo nur eine Ansicht: Was ein Loyalitätsbereich zeigen könnte, ohne Stufen, ohne Punkte, ohne Versprechen.",
    reward: {},
    rewardLabel: "Nur Ansicht (Mock)",
    validUntilLabel: "Beispiel-Gültigkeit: demnächst (Mock)",
    status: "upcoming",
  },
];
