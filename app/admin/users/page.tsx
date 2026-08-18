import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requireAdmin, UnauthenticatedError, UnauthorizedError } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { adminUsersSearchParamsSchema, resolveAdminUsersPage } from "@/server/admin/user-admin-read-model";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UsersTable } from "@/components/admin/UsersTable";

export const metadata: Metadata = { title: "Admin — Nutzer" };

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Dieselbe requireAdmin()-Gate-Logik wie app/admin/page.tsx — jede Admin-Seite prüft für sich selbst, nicht nur zentral in einem Layout. */
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  let actorId: string;
  try {
    const session = await requireAdmin();
    actorId = session.user.id;
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect(`/login?next=${encodeURIComponent("/admin/users")}`);
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
  const parsed = adminUsersSearchParamsSchema.parse({ page: firstValue(raw.page) });
  const usersPage = await resolveAdminUsersPage(db, parsed.page);

  return (
    <div className="anim-panel-in">
      <AdminHeader />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <header>
          <h1 className="font-display text-2xl text-primary sm:text-3xl">Nutzerverwaltung</h1>
          <p className="mt-1 text-sm text-muted">Konten sperren/entsperren, Sitzungen widerrufen, Responsible-Gaming-Einstellungen einsehen.</p>
        </header>
        <UsersTable items={usersPage.items} currentAdminId={actorId} page={usersPage.page} pageCount={usersPage.pageCount} total={usersPage.total} />
      </div>
    </div>
  );
}
