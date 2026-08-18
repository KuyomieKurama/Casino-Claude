import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requireAdmin, UnauthenticatedError, UnauthorizedError } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { auditLogSearchParamsSchema, resolveAuditLogPage } from "@/server/admin/audit-log-read-model";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AuditLogTable } from "@/components/admin/AuditLogTable";

export const metadata: Metadata = { title: "Admin — Audit-Log" };

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function buildHref(cursors: readonly number[]): string {
  if (cursors.length === 0) return "/admin/audit-log";
  return `/admin/audit-log?cursors=${cursors.join(",")}`;
}

/**
 * Dieselbe URL-getriebene Keyset-Blätterung wie app/(user)/history/page.tsx (Admin-Auftrag §4:
 * „Ansicht mit Blätterung, keine unbegrenzte Abfrage"). Dieselbe requireAdmin()-Gate-Logik wie
 * die übrigen Admin-Seiten.
 */
export default async function AdminAuditLogPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect(`/login?next=${encodeURIComponent("/admin/audit-log")}`);
    }
    if (error instanceof UnauthorizedError) {
      return (
        <div className="anim-panel-in mx-auto max-w-xl pt-8">
          <EmptyState
            icon={<ShieldAlert aria-hidden="true" />}
            headingLevel={1}
            title="Kein Zugriff auf den Admin-Bereich."
            text="Dieser Bereich ist Konten mit aktiver Admin-Rolle vorbehalten."
            action={<LinkButton href="/">Zur Startseite</LinkButton>}
          />
        </div>
      );
    }
    throw error;
  }

  const raw = await searchParams;
  const parsed = auditLogSearchParamsSchema.parse({ cursors: firstValue(raw.cursors) });
  const currentCursor = parsed.cursors.at(-1);
  const page = await resolveAuditLogPage(db, currentCursor);

  const lastSeqOnPage = page.entries.at(-1)?.seq;
  const nextHref = page.hasMore && lastSeqOnPage !== undefined ? buildHref([...parsed.cursors, lastSeqOnPage]) : undefined;
  const prevHref = parsed.cursors.length > 0 ? buildHref(parsed.cursors.slice(0, -1)) : undefined;

  return (
    <div className="anim-panel-in">
      <AdminHeader />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <header>
          <h1 className="font-display text-2xl text-primary sm:text-3xl">Audit-Log</h1>
          <p className="mt-1 text-sm text-muted">Nachvollziehbarkeit jeder Admin-Schreiboperation.</p>
        </header>
        <AuditLogTable entries={page.entries} total={page.total} {...(prevHref !== undefined ? { prevHref } : {})} {...(nextHref !== undefined ? { nextHref } : {})} />
      </div>
    </div>
  );
}
