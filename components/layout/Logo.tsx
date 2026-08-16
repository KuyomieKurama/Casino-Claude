import Link from "next/link";
import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from "@/lib/constants";
import { cn } from "@/lib/cn";

/** Wortmarke in der Display-Schrift, mit einem kleinen goldenen Akzent (keine Fläche). */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-control", className)} aria-label={`${PRODUCT_NAME} – Startseite`}>
      <span aria-hidden="true" className="inline-block size-2 rounded-full bg-gold" />
      <span className="font-display text-lg leading-none text-primary sm:text-xl">
        {compact ? PRODUCT_SHORT_NAME : PRODUCT_NAME.replace(/ Demo$/, "")}
      </span>
      {!compact ? (
        <span className="-ml-1 self-start text-[0.625rem] font-medium uppercase tracking-wider text-muted">Demo</span>
      ) : null}
    </Link>
  );
}
