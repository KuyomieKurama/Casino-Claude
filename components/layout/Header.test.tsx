import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { User } from "@/types/user";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { __resetSoundStoreForTests } from "@/components/sound/sound-store";
import { Header } from "./Header";

const usePathnameMock = vi.fn();
const routerRefreshMock = vi.fn();
const routerPushMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ refresh: routerRefreshMock, push: routerPushMock }),
}));

const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/components/auth/authClient", () => ({
  authClient: { signOut: (...args: unknown[]) => signOutMock(...args) },
}));

function renderHeader(pathname: string, user: User | null = null) {
  usePathnameMock.mockReturnValue(pathname);
  return render(
    <AppProviders user={user}>
      <Header />
    </AppProviders>,
  );
}

const adminUser: User = { id: "u-admin", displayName: "Admina", email: "admina@example.com", role: "admin", isGuest: false };
const player: User = { id: "u-1", displayName: "Spielerin", email: "p@example.com", role: "user", isGuest: false };

describe("Header — aktiver Bereich", () => {
  test("markiert den aktiven Hauptbereich über aria-current UND ein visuelles Merkmal (Kantenlicht/Indikator), nicht nur über Farbe", () => {
    renderHeader("/casino");
    const nav = screen.getByRole("navigation", { name: "Hauptnavigation" });
    const active = within(nav).getByRole("link", { name: "Casino" });
    expect(active).toHaveAttribute("aria-current", "page");
    // Das goldene Indikator-Element ist ein zusätzliches, nicht-farbliches Strukturmerkmal
    // (Vorhandensein/Position einer Kante) — nicht die einzige Markierung.
    expect(active.querySelector('[aria-hidden="true"]')).not.toBeNull();

    const inactive = within(nav).getByRole("link", { name: "Live-Casino" });
    expect(inactive).not.toHaveAttribute("aria-current");
    expect(inactive.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  test("markiert Unterseiten des aktiven Bereichs ebenfalls als aktiv", () => {
    renderHeader("/casino/foo");
    const nav = screen.getByRole("navigation", { name: "Hauptnavigation" });
    expect(within(nav).getByRole("link", { name: "Casino" })).toHaveAttribute("aria-current", "page");
  });
});

describe("Header — Anmeldezustand", () => {
  test("zeigt abgemeldet Anmelden- und Registrieren-Zugänge, kein Nutzerbereich/Abmelden", () => {
    renderHeader("/", null);
    expect(screen.getAllByRole("link", { name: /^Anmelden$/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^Registrieren$/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Abmelden" })).not.toBeInTheDocument();
  });

  test("zeigt angemeldet den Nutzernamen, Zugang zum Nutzerbereich und Abmelden, keine Anmelden-Links", () => {
    renderHeader("/", player);
    expect(screen.getByText("Spielerin")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Nutzerbereich|Spielerin/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Abmelden" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /^Anmelden$/ })).not.toBeInTheDocument();
  });

  test("Abmelden ruft die Sitzungsbeendigung auf", async () => {
    renderHeader("/", player);
    const logoutButton = screen.getAllByRole("button", { name: "Abmelden" })[0];
    fireEvent.click(logoutButton!);
    expect(signOutMock).toHaveBeenCalled();
  });
});

describe("Header — Admin-Sichtbarkeit", () => {
  test("zeigt den Admin-Zugang nur für Admins", () => {
    renderHeader("/", adminUser);
    expect(screen.getAllByRole("link", { name: /Admin-Bereich/ }).length).toBeGreaterThan(0);
  });

  test("zeigt keinen Admin-Zugang für normale Nutzer", () => {
    renderHeader("/", player);
    expect(screen.queryByRole("link", { name: /Admin-Bereich/ })).not.toBeInTheDocument();
  });

  test("zeigt keinen Admin-Zugang für abgemeldete Besucher", () => {
    renderHeader("/", null);
    expect(screen.queryByRole("link", { name: /Admin-Bereich/ })).not.toBeInTheDocument();
  });
});

describe("Header — Guthabenanzeige", () => {
  test("zeigt die Guthabenanzeige für angemeldete Nutzer", () => {
    renderHeader("/", player);
    expect(screen.getByText("DEMO")).toBeInTheDocument();
  });

  // Auftrag „Spielen nur angemeldet": ohne Sitzung existiert kein Wallet, die Anzeige eines
  // hypothetischen Guthabens wäre irreführend (components/wallet/BalanceDisplay.tsx).
  test("zeigt keine Guthabenanzeige für abgemeldete Besucher", () => {
    renderHeader("/", null);
    expect(screen.queryByText("DEMO")).not.toBeInTheDocument();
  });
});

describe("Header — Responsible Gaming jederzeit erreichbar", () => {
  test("Responsible Gaming ist sowohl im Icon als auch in der Hauptnavigation verlinkt", () => {
    renderHeader("/");
    const rgLinks = screen.getAllByRole("link", { name: /Responsible Gaming/ });
    expect(rgLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of rgLinks) {
      expect(link).toHaveAttribute("href", "/responsible-gaming");
    }
  });
});

describe("Header — Ton-Umschalter (Auftrag: Klang-Infrastruktur)", () => {
  beforeEach(() => {
    __resetSoundStoreForTests();
    __resetStorageForTests();
    window.localStorage.clear();
  });

  test("ist unabhängig vom Anmeldezustand erreichbar und standardmäßig aus", () => {
    renderHeader("/", null);
    expect(screen.getByRole("switch", { name: "Ton" })).toHaveAttribute("aria-checked", "false");
  });

  test("lässt sich per Klick umschalten", () => {
    renderHeader("/", player);
    const toggle = screen.getByRole("switch", { name: "Ton" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});

describe("Header — mobiles Menü", () => {
  test("öffnet über den Menü-Knopf und zeigt dieselben Ziele wie die Hauptnavigation", () => {
    renderHeader("/promotions", player);
    fireEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));

    const dialog = screen.getByRole("dialog", { name: "Menü" });
    expect(within(dialog).getByRole("link", { name: "Promotions" })).toHaveAttribute("aria-current", "page");
    expect(within(dialog).getByRole("link", { name: "Nutzerbereich" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Abmelden" })).toBeInTheDocument();
  });

  test("Escape schließt das mobile Menü und der Fokus kehrt zum Menü-Knopf zurück", () => {
    renderHeader("/", player);
    const trigger = screen.getByRole("button", { name: "Menü öffnen" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test("zeigt den Admin-Zugang im mobilen Menü nur für Admins", () => {
    renderHeader("/", adminUser);
    fireEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("link", { name: /Admin-Bereich/ })).toBeInTheDocument();
  });
});
