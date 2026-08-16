"use client";

import { Tabs } from "@/components/ui/Tabs";
import { lobbyCategories } from "@/data/categories";
import { paramsFromCriteria, type LobbyCategory } from "@/lib/filters";
import type { UrlCriteria } from "./useLobbyCriteria";

export function CategoryTabs({ criteria, counts }: { criteria: UrlCriteria; counts?: Partial<Record<LobbyCategory, number>> }) {
  const items = lobbyCategories.map((c) => {
    const qs = paramsFromCriteria({ ...criteria, cat: c.id }).toString();
    return { id: c.id, label: c.label, href: qs ? `/casino?${qs}` : "/casino", count: counts?.[c.id] };
  });
  return <Tabs items={items} activeId={criteria.cat} ariaLabel="Kategorien" />;
}
