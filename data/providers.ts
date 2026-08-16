import type { Provider } from "@/types/game";

/** Sechs frei erfundene Anbieter (Regel 8). Keine realen Studios. */
export const providers: readonly Provider[] = [
  { id: "velora-studios", name: "Velora Studios" },
  { id: "northgate-play", name: "Northgate Play" },
  { id: "kessel-sonne", name: "Kessel & Sonne" },
  { id: "halbmond-interactive", name: "Halbmond Interactive" },
  { id: "tessera-games", name: "Tessera Games" },
  { id: "fuenf-tuerme", name: "Fünf Türme Studio" },
];

export function providerName(id: string): string {
  return providers.find((p) => p.id === id)?.name ?? "Unbekannter Anbieter";
}
