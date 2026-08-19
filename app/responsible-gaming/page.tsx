import type { Metadata } from "next";
import { RgPanel } from "@/components/rg/RgPanel";

export const metadata: Metadata = { title: "Responsible Gaming" };

export default function ResponsibleGamingPage() {
  return (
    <div className="anim-panel-in space-y-6 pt-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Responsible Gaming</h1>
        <p className="measure mt-1 text-sm text-muted">
          Spielzeit, Pause, Zeitlimit und Selbstsperre — jederzeit erreichbar. Sperren und Pausen blockieren tatsächlich, auch nach einem Reload.
        </p>
      </header>
      <RgPanel />
    </div>
  );
}
