import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/user";
import { AppProviders } from "@/state/AppProviders";
import { installDialogPolyfill } from "@/test/dialog-polyfill";
import { __resetStorageForTests } from "@/lib/storage";
import { __resetSoundStoreForTests } from "@/components/sound/sound-store";

installDialogPolyfill();

const refreshMock = vi.fn();
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock, push: pushMock }) }));

const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/components/auth/authClient", () => ({
  authClient: { signOut: (...args: unknown[]) => signOutMock(...args) },
}));

import { SettingsPage } from "./SettingsPage";

const user: User = { id: "u1", displayName: "Ada Beispiel", email: "ada@example.com", role: "user", isGuest: false };

function renderSettings() {
  return render(
    <AppProviders user={user}>
      <SettingsPage />
    </AppProviders>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    refreshMock.mockClear();
    pushMock.mockClear();
    signOutMock.mockClear();
    __resetSoundStoreForTests();
    __resetStorageForTests();
    window.localStorage.clear();
  });

  it("zeigt die Überschriftenfolge ohne Sprünge (h1 → h2)", () => {
    renderSettings();
    expect(screen.getByRole("heading", { level: 1, name: "Einstellungen" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Profil/ })).toBeInTheDocument();
  });

  it("zeigt das Profil nur lesbar, mit Begründung, warum kein Bearbeiten möglich ist", () => {
    renderSettings();
    expect(screen.getByText("Nur lesbar")).toBeInTheDocument();
    expect(screen.getByText(/keinen serverseitigen Weg, sie hier zu ändern/i)).toBeInTheDocument();
    const nameField = screen.getByLabelText("Anzeigename") as HTMLInputElement;
    const emailField = screen.getByLabelText("E-Mail") as HTMLInputElement;
    expect(nameField).toHaveAttribute("readonly");
    expect(emailField).toHaveAttribute("readonly");
    expect(nameField.value).toBe("Ada Beispiel");
    expect(emailField.value).toBe("ada@example.com");
  });

  it("öffnet den Bestätigungsdialog für das Löschen der Demo-Daten und erlaubt Abbrechen", async () => {
    const u = userEvent.setup();
    renderSettings();
    await u.click(screen.getByRole("button", { name: /Alle Demo-Daten löschen/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/lässt sich nicht rückgängig machen/i)).toBeInTheDocument();
    await u.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("verwendet höchstens eine goldene Fläche (im Nutzerbereich bevorzugt keine)", () => {
    const { container } = renderSettings();
    expect(container.querySelectorAll('[class*="bg-gold"]').length).toBeLessThanOrEqual(1);
  });

  it("zeigt die ausführliche Ton-Einstellung mit Umschalter und Lautstärkeregler (Auftrag: Klang-Infrastruktur)", () => {
    renderSettings();
    expect(screen.getByRole("heading", { level: 2, name: "Ton" })).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: "Ton" });
    expect(toggle).toHaveAttribute("aria-checked", "false"); // Standardzustand ist "aus"
    expect(screen.getByLabelText("Lautstärke")).toBeDisabled();
  });
});
