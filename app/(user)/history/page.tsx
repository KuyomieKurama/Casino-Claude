import type { Metadata } from "next";
import { getSession } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { historySearchParamsSchema, resolveLedgerHistoryPage } from "@/server/wallet/ledger-history";
import { HistoryPage } from "@/components/wallet/HistoryPage";

export const metadata: Metadata = { title: "Spielhistorie" };

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function buildHref(range: string, gameId: string, cursors: readonly number[]): string {
  const params = new URLSearchParams();
  if (range !== "all") params.set("range", range);
  if (gameId) params.set("gameId", gameId);
  if (cursors.length > 0) params.set("cursors", cursors.join(","));
  const query = params.toString();
  return query ? `/history?${query}` : "/history";
}

/**
 * Server Component (Auftrag §1/§2: "Server Component bevorzugt"). Filter UND Blätterung leben
 * vollständig in der URL (`range`, `gameId`, `cursors`) statt in Client-Zustand — ein Wechsel ist
 * dadurch ein normaler Link/Navigation, per Tastatur wie jeder andere Link erreichbar, und die
 * Seite bleibt bei einem Reload exakt auf demselben Filter/derselben Seite stehen. Kein Route
 * Handler nötig: reiner Lesevorgang, den Next.js über `searchParams` bereits unterstützt — ein
 * zusätzlicher API-Layer wäre hier nur Boilerplate ohne echten Zusatznutzen.
 *
 * Autorisierung: `userId` kommt ausschließlich aus getSession() (der geprüften Sitzung), niemals
 * aus einem Suchparameter — ein manipulierter `?gameId=`/`?range=` kann höchstens die eigenen
 * Filter verändern, nie fremde Nutzerdaten erreichen (Auftrag §3).
 */
export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const parsed = historySearchParamsSchema.parse({
    range: firstValue(raw.range),
    gameId: firstValue(raw.gameId),
    cursors: firstValue(raw.cursors),
  });

  const session = await getSession();
  const userId = session?.user.id ?? null;
  const currentCursor = parsed.cursors.at(-1);

  const page = await resolveLedgerHistoryPage(db, userId, {
    range: parsed.range,
    ...(parsed.gameId !== undefined ? { gameId: parsed.gameId } : {}),
    ...(currentCursor !== undefined ? { cursor: currentCursor } : {}),
  });

  const pageNumber = parsed.cursors.length + 1;
  const lastSeqOnPage = page.entries.at(-1)?.seq;
  const nextHref = page.hasMore && lastSeqOnPage !== undefined ? buildHref(parsed.range, parsed.gameId ?? "", [...parsed.cursors, lastSeqOnPage]) : undefined;
  const prevHref = parsed.cursors.length > 0 ? buildHref(parsed.range, parsed.gameId ?? "", parsed.cursors.slice(0, -1)) : undefined;

  return (
    <HistoryPage
      range={parsed.range}
      gameId={parsed.gameId ?? ""}
      entries={page.entries}
      gameOptions={page.gameOptions}
      total={page.total}
      pageNumber={pageNumber}
      {...(prevHref !== undefined ? { prevHref } : {})}
      {...(nextHref !== undefined ? { nextHref } : {})}
    />
  );
}
