import type { Metadata } from "next";
import { PromotionsList } from "@/components/promotions/PromotionsList";

export const metadata: Metadata = { title: "Promotions" };

export default function PromotionsPage() {
  return (
    <div className="space-y-6 pt-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Promotions</h1>
        <p className="measure mt-1 text-sm text-muted">
          Drei Beispiele als UI-Muster. Keine Einzahlungsvoraussetzungen, keine Umsatzbedingungen, keine Aussagen zu Gewinnchancen. Demo-Belohnungen sind rein additiv.
        </p>
      </header>
      <PromotionsList />
    </div>
  );
}
