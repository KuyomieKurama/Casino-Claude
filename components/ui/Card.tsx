import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Signaturlinie oben — für tragende Flächen (Wallet-Panel, Hero, aktive Bereiche). */
  signature?: boolean;
  elevated?: boolean;
  padded?: boolean;
  /** Glasartige Fläche (Glassmorphism) für schwebende Panels, z. B. Bonus-Hinweise. Default
   * false, damit bestehende Aufrufe ohne diese Prop unverändert bg-surface/bg-elevated zeigen. */
  glass?: boolean;
  as?: "div" | "section" | "article" | "aside";
};

export function Card({ signature, elevated, padded = true, glass = false, as: Tag = "div", className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        // surface-raised (statt shadow-rest) kombiniert Ruheschatten UND Kantenlicht in EINER
        // box-shadow-Deklaration (siehe app/globals.css) — box-shadow kennt pro Element nur einen
        // Gewinner, "shadow-rest" allein hätte bei glass=true gegen die eigene box-shadow von
        // .glass-panel konkurriert und nur zufällig denselben Wert gezeigt, weil --shadow-rest und
        // --shadow-1 identisch sind (kein verlässlicher Zusammenhang, sobald sich einer der beiden
        // Werte künftig ändert). surface-raised ist in app/globals.css bewusst NACH .glass-panel
        // notiert und gewinnt deshalb zuverlässig, unabhängig vom glass-Zustand.
        "rounded-card border border-border-subtle surface-raised",
        glass ? "glass-panel" : elevated ? "bg-elevated" : "bg-surface",
        signature && "signature-top",
        padded && "p-lg sm:p-xl",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
