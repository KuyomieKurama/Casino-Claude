import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requireAdmin, UnauthenticatedError, UnauthorizedError } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { resolveAdminGameOverview } from "@/server/admin/game-admin-read-model";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { GamesTable } from "@/components/admin/GamesTable";

export const metadata: Metadata = { title: "Admin — Spiele" };

/** Dieselbe requireAdmin()-Gate-Logik wie app/admin/page.tsx. */
export default async function AdminGamesPage() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect(`/login?next=${encodeURIComponent("/admin/games")}`);
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

  const games = await resolveAdminGameOverview(db);

  return (
    <div className="anim-panel-in">
      <AdminHeader />
      <div className="mx-auto max-w-6xl space-y-xl px-4 py-6 sm:px-6">
        <header>
          <h1 className="font-display text-2xl text-primary sm:text-3xl">Spielverwaltung</h1>
          <p className="mt-1 text-sm text-muted">Status, Hervorhebung und Sortierung ändern. Auszahlungstabelle, Engine und RTP sind fest.</p>
        </header>
        <GamesTable items={games} />
      </div>
    </div>
  );
}
