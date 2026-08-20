"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Varianten: `primary` ist die einzige goldene Fläche — höchstens eine pro Bildschirm (§4).
 * Alles andere ist Umriss oder Text. Fokusring bleibt immer sichtbar.
 */
export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
};

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-medium select-none transition-state press-feedback " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 whitespace-nowrap";

const sizes: Record<ButtonSize, string> = {
  // `sm` ist bewusst 36 px hoch und deshalb NUR für Bedienelemente gedacht, die in einem
  // größeren Klickziel liegen (z. B. innerhalb einer Karte). Steht ein Button für sich,
  // verlangt die Touch-Ziel-Regel (§12) mindestens 44 px — dann `md` verwenden.
  sm: "h-9 min-h-9 px-3 text-sm",
  md: "h-11 min-h-11 px-4 text-base",
  lg: "h-12 min-h-12 px-6 text-md",
};

const variants: Record<ButtonVariant, string> = {
  // `bg-gold` bleibt die tatsächliche Füllfarbe (siehe app/page.test.tsx — zählt `.bg-gold`, um
  // "Gold bleibt knapp" zu belegen); `metal-sheen` legt nur ein dekoratives Verlaufsbild darüber.
  // `hover-elevate` liefert die Ruhe-Elevation (--shadow-rest, entspricht --shadow-1) und im
  // Hover shadow-hover plus Kantenlicht mit leichtem Anheben, siehe app/globals.css.
  primary: "bg-gold text-on-gold on-gold-surface metal-sheen hover-elevate hover:bg-gold-strong",
  // Glasartige Fläche statt Volltonrahmen. .glass-panel ist jetzt eine @utility (siehe
  // app/globals.css) und folgt damit normalen Kaskadenregeln — der frühere Tailwind-„!“-
  // Modifikator auf der Randfarbe war nur nötig, weil .glass-panel bis dahin ungelayertes CSS war
  // und deshalb jede Utility für dieselbe Eigenschaft unabhängig von Reihenfolge/Spezifität schlug.
  // Gold bleibt der einen CTA-Fläche vorbehalten, der Hover wandert deshalb auf den violetten
  // Akzent statt auf Gold.
  //
  // Bewusst KEIN statisches `text-primary` mehr hier (anders als zuvor): Tailwind sortiert
  // generierte Farb-Utilities alphabetisch nach Tokenname, `.text-primary` steht deshalb IMMER
  // nach `.text-accent` im kompilierten CSS und gewänne bei gleicher Spezifität gegen jeden
  // Aufrufstellen-Override wie `text-accent` (z. B. der aktive Zustand in DiceGame/MinesGame/
  // ModeSwitcher) — unabhängig von der Reihenfolge im className. `button { color: inherit }`
  // (siehe @layer base weiter unten) liefert denselben Wert bereits über Vererbung von body
  // (color: var(--text-primary)), ein erneutes, unbedingtes Setzen hier ist überflüssig und wäre
  // genau die Sorte Kaskadenkonflikt, die dieser Auftrag beheben soll.
  //
  // `aria-pressed:`/`aria-[current=page]:` statt eines zweiten `!`: Aufrufstellen wie DiceGame,
  // MinesGame (aria-pressed) und ModeSwitcher (aria-current="page") markieren ihren aktiven
  // Zustand bereits semantisch korrekt über diese ARIA-Attribute (§12, nie Farbe allein). Eine
  // Attribut-Variante erzeugt einen Selektor mit Klasse+Attribut (z. B.
  // `.aria-pressed\:border-accent[aria-pressed="true"]`) und damit höhere Spezifität als die
  // statische `border-border-control`-Regel darüber — sie gewinnt deshalb zuverlässig, ganz ohne
  // `!important` und ohne die Aufrufstellen selbst ändern zu müssen (liegen außerhalb des
  // Auftragsumfangs). `aria-current` kennt mehrere Werte (page/step/…), deshalb die Arbitrary-
  // Variant-Schreibweise `aria-[current=page]:`; `aria-pressed` ist ein von Tailwind vordefinierter
  // Variantenname. Nur die Randfarbe ist hier an aria-current gekoppelt (nicht die Textfarbe) —
  // ModeSwitcher setzt für den aktiven Modus bewusst `text-primary` statt `text-accent` (das
  // Häkchen-Icon trägt dort bereits den Akzent), das bliebe sonst überschrieben.
  outline: "glass-panel border-border-control hover:border-accent hover:text-accent aria-pressed:border-accent aria-pressed:text-accent aria-[current=page]:border-accent",
  ghost: "bg-transparent text-primary hover:bg-elevated",
  danger: "border border-danger bg-transparent text-danger hover:bg-elevated",
};

export function buttonClasses(opts: CommonProps = {}): string {
  const { variant = "outline", size = "md", fullWidth, className } = opts;
  return cn(base, sizes[size], variants[variant], fullWidth && "w-full", className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "outline", size = "md", loading = false, iconLeft, iconRight, fullWidth, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export type LinkButtonProps = CommonProps & {
  href: string;
  prefetch?: boolean;
  "aria-label"?: string;
};

/** Link im Button-Gewand — für Navigation, damit Semantik (Link) und Optik (Button) stimmen. */
export function LinkButton({ href, variant = "outline", size = "md", iconLeft, iconRight, fullWidth, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {iconLeft}
      {children}
      {iconRight}
    </Link>
  );
}
