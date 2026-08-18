"use client";

import Link from "next/link";
import { Ban, Play, Radio, Sparkles } from "lucide-react";
import type { Game } from "@/types/game";
import { categoryLabel } from "@/data/categories";
import { providerName } from "@/data/providers";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { engineFor } from "./engine/registry";
import { GameArt } from "./GameArt";
import { FavoriteButton } from "./FavoriteButton";
import { cn } from "@/lib/cn";

export type GameCardVariant = "default" | "compact" | "featured";

export type GameCardProps = {
  game: Game;
  variant?: GameCardVariant;
  className?: string;
  priority?: boolean;
};

/**
 * Die eine Spielkarte (§8.3): drei Varianten über eine Prop. Startseiten-Reihen, Lobby,
 * „Ähnliche Spiele“ und Favoriten nutzen dieselbe Komponente. Deaktivierte Spiele werden
 * gedimmt, tragen das Badge „Zurzeit nicht verfügbar“ und haben keinen aktiven Start.
 */
export function GameCard({ game, variant = "default", className, priority }: GameCardProps) {
  const inactive = game.status === "inactive";
  const href = `/game/${game.slug}`;
  // Spielbar ist, wofür eine Engine registriert ist — nicht, wofür ein RTP ausgewiesen wird.
  const playable = engineFor(game.id) !== undefined && !inactive;
  // Dezenter Hinweis auf Geschwistermodi (Auftrag §2): macht sichtbar, dass hinter dieser
  // Kachel z. B. "Europäisch" steckt, weitere Modi aber einen Klick entfernt sind — bevor man
  // klickt. Nur gesetzt, wenn die Kachel über die Repositories aus der Datenbank kam.
  const siblingHint = game.siblingModes?.length ? `Auch als: ${game.siblingModes.map((m) => m.label).join(", ")}` : null;

  const badge = inactive ? (
    <Badge tone="neutral" icon={<Ban className="size-3" aria-hidden="true" />}>
      Zurzeit nicht verfügbar
    </Badge>
  ) : game.isLiveDemo ? (
    <Badge tone="teal" icon={<Radio className="size-3" aria-hidden="true" />}>
      Live-Demo
    </Badge>
  ) : game.isNew ? (
    <Badge tone="teal">Neu</Badge>
  ) : playable ? (
    <Badge tone="gold" icon={<Sparkles className="size-3" aria-hidden="true" />}>
      Spielbar
    </Badge>
  ) : game.isPopular ? (
    <Badge tone="neutral">Beliebt</Badge>
  ) : null;

  if (variant === "compact") {
    return (
      <article
        className={cn(
          "hover-elevate group relative flex w-[160px] flex-col overflow-hidden rounded-card border border-border-subtle bg-surface xs:w-[176px]",
          inactive && "opacity-60",
          className,
        )}
      >
        <Link href={href} className="focus-glow block aspect-[4/3] overflow-hidden rounded-t-card" aria-label={`${game.name} ansehen`}>
          <GameArt game={game} priority={priority} />
        </Link>
        <div className="absolute right-2 top-2">
          <FavoriteButton gameId={game.id} gameName={game.name} />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          {badge ? <div>{badge}</div> : null}
          <h3 className="line-clamp-1 text-sm font-semibold text-primary">
            <Link href={href} className="after:absolute after:inset-0 after:content-['']">
              {game.name}
            </Link>
          </h3>
          <p className="text-xs text-muted">{categoryLabel(game.category)}</p>
          {siblingHint ? <p className="line-clamp-1 text-xs text-muted/80">{siblingHint}</p> : null}
        </div>
      </article>
    );
  }

  if (variant === "featured") {
    // Kein signature-top hier: .hover-elevate deklariert dieselbe CSS-Eigenschaft (box-shadow)
    // und ersetzt die goldene Signaturlinie bewusst durch Kantenlicht (siehe app/globals.css) —
    // Tiefe über Licht, nicht über eine zweite goldene Fläche neben dem primären CTA-Button
    // dieser Karte ("Gold bleibt knapp").
    return (
      <article
        className={cn(
          "hover-elevate group relative grid overflow-hidden rounded-card border border-border-subtle bg-surface md:grid-cols-[1.4fr_1fr]",
          inactive && "opacity-60",
          className,
        )}
      >
        <Link href={href} className="focus-glow block aspect-[16/9] overflow-hidden md:aspect-auto md:h-full" aria-label={`${game.name} ansehen`}>
          <GameArt game={game} useBanner priority={priority} />
        </Link>
        <div className="flex flex-col gap-3 p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {badge}
            <Badge tone="neutral">{categoryLabel(game.category)}</Badge>
          </div>
          <h3 className="font-display text-xl text-primary sm:text-2xl">
            <Link href={href}>{game.name}</Link>
          </h3>
          <p className="text-sm text-muted">{providerName(game.providerId)}</p>
          <p className="measure line-clamp-3 text-sm text-primary/90">{game.description}</p>
          {siblingHint ? <p className="text-xs text-muted/80">{siblingHint}</p> : null}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <LinkButton href={href} variant={inactive ? "outline" : "primary"} iconLeft={<Play className="size-4" aria-hidden="true" />}>
              {inactive ? "Details ansehen" : "Demo spielen"}
            </LinkButton>
            <FavoriteButton gameId={game.id} gameName={game.name} size="md" />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "hover-elevate group relative flex flex-col overflow-hidden rounded-card border border-border-subtle bg-surface",
        inactive && "opacity-60",
        className,
      )}
    >
      <Link href={href} className="focus-glow block aspect-[4/3] overflow-hidden rounded-t-card" aria-label={`${game.name} ansehen`}>
        <GameArt game={game} priority={priority} />
      </Link>
      <div className="absolute right-2 top-2">
        <FavoriteButton gameId={game.id} gameName={game.name} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        {badge ? <div>{badge}</div> : null}
        <h3 className="line-clamp-1 text-base font-semibold text-primary">
          <Link href={href}>{game.name}</Link>
        </h3>
        <p className="text-xs text-muted">
          {categoryLabel(game.category)} · {providerName(game.providerId)}
        </p>
        {siblingHint ? <p className="line-clamp-1 text-xs text-muted/80">{siblingHint}</p> : null}
        <div className="mt-auto pt-2">
          <LinkButton href={href} variant="outline" size="sm" fullWidth iconLeft={<Play className="size-4" aria-hidden="true" />} aria-label={`${game.name}: ${inactive ? "Details ansehen" : "Demo spielen"}`}>
            {inactive ? "Details ansehen" : "Demo spielen"}
          </LinkButton>
        </div>
      </div>
    </article>
  );
}
