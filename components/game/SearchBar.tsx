"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { SEARCH_DEBOUNCE_MS } from "@/lib/constants";
import { cn } from "@/lib/cn";

export type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  label?: string;
};

/** Volltextsuche mit 200 ms Verzögerung; die Eingabe bleibt sofort sichtbar, nur die Auswertung ist verzögert. */
export function SearchBar({ value, onChange, placeholder = "Spiel, Anbieter oder Mechanik suchen", className, autoFocus, label = "Spiele durchsuchen" }: SearchBarProps) {
  const [draft, setDraft] = useState(value);
  // Sichtbarer Zustand beim Tippen (Auftrag §3): solange die letzte Eingabe noch nicht
  // ausgewertet wurde (Debounce läuft), ist das für Sehende sonst unsichtbar — der Effekt
  // greift erst nach SEARCH_DEBOUNCE_MS. Bewusst eigener State statt eines Vergleichs gegen
  // lastEmitted (ref) beim Rendern: eine Ref-Mutation allein löst kein Re-Render aus, der
  // Zustand würde also nie sichtbar wieder verschwinden.
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef(value);

  // Externe Änderungen (Zurück-Button, Reset) übernehmen
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setDraft(value);
      lastEmitted.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (draft === lastEmitted.current) {
      setPending(false);
      return;
    }
    setPending(true);
    const t = setTimeout(() => {
      lastEmitted.current = draft;
      setPending(false);
      onChange(draft);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, onChange]);

  const clearSearch = () => {
    setDraft("");
    lastEmitted.current = "";
    onChange("");
    inputRef.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      <label htmlFor="lobby-search" className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        ref={inputRef}
        id="lobby-search"
        type="search"
        inputMode="search"
        autoComplete="off"
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-control border border-border-control bg-surface pl-9 pr-11 text-base text-primary transition-state hover:border-accent/70 [&::-webkit-search-cancel-button]:hidden"
      />
      <span role="status" className="sr-only">
        {pending ? "Suche wird aktualisiert." : ""}
      </span>
      {/* Pulsierender Punkt statt Text: nimmt keinen Platz ein (kein Layoutsprung), verschwindet
          von selbst, sobald die Auswertung greift — reine Deckkraftänderung, unter reduced
          motion bereits über .anim-skeleton abgedeckt (siehe app/globals.css). */}
      <span
        aria-hidden="true"
        className={cn("anim-skeleton absolute right-11 top-1/2 size-1.5 -translate-y-1/2 rounded-pill bg-accent-strong", pending ? "opacity-100" : "opacity-0")}
      />
      {/* Immer im DOM (statt bedingt gemountet): absolut positioniert, daher ohne Layoutfolgen,
          und nur so lässt sich das Verschwinden mit einer kürzeren Ausgangskurve animieren
          (.transition-exit, siehe app/globals.css) statt abrupt zu verschwinden. */}
      <button
        type="button"
        onClick={clearSearch}
        aria-label="Suche leeren"
        aria-hidden={draft ? undefined : true}
        tabIndex={draft ? 0 : -1}
        className={cn(
          "press-feedback absolute right-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-control text-muted hover:text-primary",
          draft ? "transition-fade pointer-events-auto opacity-100" : "transition-exit pointer-events-none opacity-0",
        )}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
