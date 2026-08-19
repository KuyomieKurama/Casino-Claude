import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { User } from "@/types/user";
import { AppProviders } from "@/state/AppProviders";
import { CURRENCY_NOTICE } from "@/lib/constants";
import { Footer } from "./Footer";

const routerRefreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerRefreshMock, push: vi.fn() }) }));

const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/components/auth/authClient", () => ({ authClient: { signOut: (...args: unknown[]) => signOutMock(...args) } }));

const player: User = { id: "u-1", displayName: "Spielerin", email: "p@example.com", role: "user", isGuest: false };
const admin: User = { id: "u-2", displayName: "Admina", email: "a@example.com", role: "admin", isGuest: false };

function renderFooter(user: User | null) {
  return render(
    <AppProviders user={user}>
      <Footer />
    </AppProviders>,
  );
}

describe("Footer — Konto-Bereich spiegelt den Anmeldezustand", () => {
  test("zeigt abgemeldet Anmelden und Registrieren", () => {
    renderFooter(null);
    const nav = screen.getByRole("navigation", { name: "Konto" });
    expect(within(nav).getByRole("link", { name: "Anmelden" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Konto anlegen" })).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Abmelden" })).not.toBeInTheDocument();
  });

  test("weist auf die Spielwährung ohne Geldwert hin", () => {
    renderFooter(null);
    expect(screen.getByText(CURRENCY_NOTICE)).toBeInTheDocument();
  });

  test("zeigt angemeldet Nutzerbereich, Einstellungen und Abmelden, kein Anmelden mehr", () => {
    renderFooter(player);
    const nav = screen.getByRole("navigation", { name: "Konto" });
    expect(within(nav).getByRole("link", { name: "Nutzerbereich" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Abmelden" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Anmelden" })).not.toBeInTheDocument();
  });

  test("zeigt den Admin-Zugang für Admins", () => {
    renderFooter(admin);
    const nav = screen.getByRole("navigation", { name: "Konto" });
    expect(within(nav).getByRole("link", { name: "Admin-Bereich" })).toBeInTheDocument();
  });

  test("zeigt keinen Admin-Zugang für normale Nutzer", () => {
    renderFooter(player);
    const nav = screen.getByRole("navigation", { name: "Konto" });
    expect(within(nav).queryByRole("link", { name: "Admin-Bereich" })).not.toBeInTheDocument();
  });
});
