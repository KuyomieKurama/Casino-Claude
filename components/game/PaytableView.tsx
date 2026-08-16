import type { Paytable } from "@/types/game-round";
import { expectedValue } from "@/lib/rng";
import { formatMultiplier, formatPercent } from "@/lib/formatters";

/**
 * Einsehbare Auszahlungstabelle (§6): Ergebnisklassen, Multiplikatoren, Wahrscheinlichkeiten,
 * Beitrag zum Erwartungswert. Die Summe der Beiträge ist der ausgewiesene Demo-RTP.
 *
 * Bewusst engine-unabhängig: keine Symbole, keine Spielgrafik. Was hier steht, gilt für Slots,
 * Roulette, Baccarat und Arcade gleichermaßen — die Tabelle ist die geprüfte Wahrheit über die
 * Wahrscheinlichkeiten, nicht die Illustration des Spiels.
 */
export function PaytableView({ paytable }: { paytable: Paytable }) {
  const ev = expectedValue(paytable);
  const sum = paytable.entries.reduce((s, e) => s + e.probability, 0);
  return (
    <div className="overflow-x-auto rounded-card border border-border-subtle">
      <table className="w-full min-w-[440px] text-sm">
        <caption className="px-4 py-3 text-left text-sm text-muted">
          Dokumentierte Auszahlungstabelle. Erwartungswert = Demo-RTP {formatPercent(ev)}. Jede Runde zieht genau eine Ergebnisklasse anhand dieser
          Wahrscheinlichkeiten (gesäter Zufallsgenerator, kein Zustand zwischen Runden).
        </caption>
        <thead className="bg-elevated text-left text-xs uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              Ergebnis
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Multiplikator
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Wahrscheinlichkeit
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Beitrag
            </th>
          </tr>
        </thead>
        <tbody>
          {paytable.entries.map((e) => (
            <tr key={e.key} className="border-t border-border-subtle">
              <td className="px-4 py-2 text-primary">{e.label}</td>
              <td className="tabular px-4 py-2 text-right text-primary">{formatMultiplier(e.multiplier)}</td>
              <td className="tabular px-4 py-2 text-right text-primary">{formatPercent(e.probability, e.probability < 0.001 ? 4 : 2)}</td>
              <td className="tabular px-4 py-2 text-right text-muted">{(e.multiplier * e.probability).toFixed(4).replace(".", ",")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gold/50 bg-elevated font-medium">
            <td className="px-4 py-2" colSpan={2}>
              Summe
            </td>
            <td className="tabular px-4 py-2 text-right">{formatPercent(sum, 2)}</td>
            <td className="tabular px-4 py-2 text-right text-gold">{ev.toFixed(4).replace(".", ",")}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
