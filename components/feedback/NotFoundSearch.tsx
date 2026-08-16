"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Suchfeld auf der 404-Seite — führt in die Lobby mit gesetztem Suchbegriff. */
export function NotFoundSearch() {
  const [q, setQ] = useState("");
  const router = useRouter();
  return (
    <form
      className="mx-auto flex w-full max-w-sm gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/casino?q=${encodeURIComponent(q.trim())}` : "/casino");
      }}
      role="search"
    >
      <label htmlFor="nf-search" className="sr-only">
        Spiel suchen
      </label>
      <input
        id="nf-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Spiel suchen …"
        className="h-11 min-w-0 flex-1 rounded-control border border-border-control bg-surface px-3 text-base text-primary"
      />
      <Button type="submit" variant="outline" iconLeft={<Search className="size-4" aria-hidden="true" />}>
        Suchen
      </Button>
    </form>
  );
}
