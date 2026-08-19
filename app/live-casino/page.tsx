import type { Metadata } from "next";
import { Radio } from "lucide-react";
import { LiveGrid } from "@/components/game/LiveGrid";

export const metadata: Metadata = { title: "Live-Casino" };

export default function LiveCasinoPage() {
  return (
    <div className="anim-panel-in space-y-6 pt-6">
      <header className="space-y-2">
        <h1 className="font-display flex items-center gap-2 text-2xl text-primary sm:text-3xl">
          <Radio className="size-6 text-teal" aria-hidden="true" /> Live-Casino
        </h1>
        <p className="measure text-sm text-muted">
          Statischer Dealer-Bereich als Illustration, kein Video, keine realen Personen. Die drei Tische zeigen nur die Informationsarchitektur eines Live-Bereichs.
        </p>
      </header>
      <div className="rounded-card border border-border-subtle bg-surface p-5">
        <div className="signature-top flex aspect-[21/9] items-center justify-center rounded-card border border-border-subtle bg-base">
          <div className="text-center">
            <p className="font-display text-lg text-primary">Dealer-Bereich (Illustration)</p>
            <p className="mt-1 text-sm text-muted">Hier stünde eine echte Video-Übertragung. Diese Fläche bleibt bewusst leer — es gibt keinen Videostream.</p>
          </div>
        </div>
      </div>
      <LiveGrid />
    </div>
  );
}
