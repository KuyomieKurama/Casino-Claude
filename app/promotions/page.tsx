import type { Metadata } from "next";
import { PromotionsList } from "@/components/promotions/PromotionsList";

export const metadata: Metadata = { title: "Promotions" };

export default function PromotionsPage() {
  return (
    <div className="anim-panel-in space-y-6 pt-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Promotions</h1>
        <p className="measure mt-1 text-sm text-muted">
          Drei Beispiele als UI-Muster. Keine Einzahlungsvoraussetzungen, keine Umsatzbedingungen, keine Aussagen zu Gewinnchancen. Demo-Belohnungen sind rein additiv, wirken aber nur in diesem Tab: Ohne Server-Endpunkt dafür überschreibt ein Neuladen den Stand wieder mit dem zuletzt bekannten Wallet-Stand.
        </p>
      </header>
      <PromotionsList />
    </div>
  );
}
