import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Signaturlinie oben — für tragende Flächen (Wallet-Panel, Hero, aktive Bereiche). */
  signature?: boolean;
  elevated?: boolean;
  padded?: boolean;
  as?: "div" | "section" | "article" | "aside";
};

export function Card({ signature, elevated, padded = true, as: Tag = "div", className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-card border border-border-subtle",
        elevated ? "bg-elevated" : "bg-surface",
        signature && "signature-top",
        padded && "p-4 sm:p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
