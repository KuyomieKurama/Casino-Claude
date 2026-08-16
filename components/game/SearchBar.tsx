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
    if (draft === lastEmitted.current) return;
    const t = setTimeout(() => {
      lastEmitted.current = draft;
      onChange(draft);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, onChange]);

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
        className="h-11 w-full rounded-control border border-border-control bg-surface pl-9 pr-11 text-base text-primary transition-state hover:border-gold-strong/70 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            lastEmitted.current = "";
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label="Suche leeren"
          className="absolute right-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-control text-muted transition-state hover:text-primary"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
