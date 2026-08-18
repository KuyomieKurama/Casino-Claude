import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, LinkButton } from "./Button";
import { cn } from "@/lib/cn";

export type PaginationProps = {
  /** Ziel für "Vorherige Seite" — fehlt auf der ersten Seite, dann ein deaktivierter Button statt eines Links. */
  prevHref?: string;
  /** Ziel für "Nächste Seite" — fehlt auf der letzten Seite. */
  nextHref?: string;
  /** Sichtbarer und für Screenreader vorgelesener Stand, z. B. "Seite 2, 45 Buchungen". */
  summary: string;
  className?: string;
};

/**
 * Zustandslose Blätterung über echte Links (`<Link>`/`LinkButton`), keine Client-seitige
 * Zustandslogik — die aufrufende Server Component berechnet `prevHref`/`nextHref` aus der
 * URL (Auftrag §2/§6: Historie ist URL-getrieben, Keyset-Cursor). Dadurch per Tastatur wie jeder
 * andere Link erreichbar (Tab, Enter) und für Screenreader ein normaler Link mit klarem Namen —
 * kein eigens zu erklärendes Steuerelement.
 */
export function Pagination({ prevHref, nextHref, summary, className }: PaginationProps) {
  return (
    <nav aria-label="Seitennavigation" className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-sm text-muted">{summary}</p>
      <div className="flex gap-2">
        {prevHref ? (
          <LinkButton href={prevHref} variant="outline" size="md" iconLeft={<ChevronLeft className="size-4" aria-hidden="true" />}>
            Vorherige Seite
          </LinkButton>
        ) : (
          <Button variant="outline" size="md" disabled iconLeft={<ChevronLeft className="size-4" aria-hidden="true" />}>
            Vorherige Seite
          </Button>
        )}
        {nextHref ? (
          <LinkButton href={nextHref} variant="outline" size="md" iconRight={<ChevronRight className="size-4" aria-hidden="true" />}>
            Nächste Seite
          </LinkButton>
        ) : (
          <Button variant="outline" size="md" disabled iconRight={<ChevronRight className="size-4" aria-hidden="true" />}>
            Nächste Seite
          </Button>
        )}
      </div>
    </nav>
  );
}
