"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { criteriaFromParams, paramsFromCriteria, type FilterCriteria } from "@/lib/filters";

export type UrlCriteria = Omit<FilterCriteria, "favorites">;

/**
 * Filterkriterien leben in der URL (§8.2): teilbar, Zurück-Button funktioniert, Reload verliert nichts.
 * `push` für Reiter/Filter/Sortierung (Historie), `replace` für Tipp-Eingaben in der Suche.
 */
export function useLobbyCriteria() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const criteria = useMemo(() => criteriaFromParams(new URLSearchParams(searchParams.toString())), [searchParams]);

  const update = useCallback(
    (patch: Partial<UrlCriteria>, mode: "push" | "replace" = "push") => {
      const next = { ...criteria, ...patch };
      const qs = paramsFromCriteria(next).toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (mode === "replace") router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [criteria, pathname, router],
  );

  const reset = useCallback(() => router.push(pathname, { scroll: false }), [pathname, router]);

  return { criteria, update, reset };
}
