import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";
import { ToastProvider } from "@/components/ui/Toast";

const signInEmailMock = vi.fn();
const replaceMock = vi.fn();
const refreshMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("./authClient", () => ({
  authClient: {
    signIn: { email: (...args: unknown[]) => signInEmailMock(...args), social: vi.fn() },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

function renderLoginForm(providers: Array<{ key: "google" | "github" | "discord"; displayName: string }> = []) {
  return render(
    <ToastProvider>
      <LoginForm providers={providers} />
    </ToastProvider>,
  );
}

describe("LoginForm", () => {
  beforeEach(() => {
    signInEmailMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
    searchParams = new URLSearchParams();
  });

  it("hat zugängliche Labels für E-Mail und Passwort", () => {
    renderLoginForm();
    expect(screen.getByLabelText("E-Mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Passwort")).toBeInTheDocument();
  });

  it("fokussiert bei leerem Formular das erste fehlerhafte Feld (E-Mail)", async () => {
    const user = userEvent.setup();
    renderLoginForm();
    await user.click(screen.getByRole("button", { name: "Anmelden" }));
    expect(screen.getByLabelText("E-Mail")).toHaveFocus();
    expect(screen.getByText(/Bitte gib eine E-Mail-Adresse ein/)).toBeInTheDocument();
    expect(signInEmailMock).not.toHaveBeenCalled();
  });

  it("verknüpft Feldfehler über aria-describedby mit dem Eingabefeld", async () => {
    const user = userEvent.setup();
    renderLoginForm();
    await user.click(screen.getByRole("button", { name: "Anmelden" }));
    const emailInput = screen.getByLabelText("E-Mail");
    const describedBy = emailInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const errorNode = document.getElementById(describedBy ?? "");
    expect(errorNode).toHaveTextContent(/Bitte gib eine E-Mail-Adresse ein/);
    expect(errorNode).toHaveAttribute("role", "alert");
  });

  it("meldet erfolgreich an, leert das Passwortfeld und leitet zum next-Ziel weiter", async () => {
    signInEmailMock.mockResolvedValueOnce({ data: { user: {} }, error: null });
    searchParams = new URLSearchParams("next=/wallet");
    const user = userEvent.setup();
    renderLoginForm();
    await user.type(screen.getByLabelText("E-Mail"), "person@example.com");
    await user.type(screen.getByLabelText("Passwort"), "ein-passwort-123");
    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(signInEmailMock).toHaveBeenCalledWith({ email: "person@example.com", password: "ein-passwort-123", rememberMe: false });
    expect((screen.getByLabelText("Passwort") as HTMLInputElement).value).toBe("");
    expect(refreshMock).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/wallet");
  });

  it("weist ein externes next-Ziel ab und leitet stattdessen zu /profile weiter", async () => {
    signInEmailMock.mockResolvedValueOnce({ data: { user: {} }, error: null });
    searchParams = new URLSearchParams("next=https://evil.example.com");
    const user = userEvent.setup();
    renderLoginForm();
    await user.type(screen.getByLabelText("E-Mail"), "person@example.com");
    await user.type(screen.getByLabelText("Passwort"), "ein-passwort-123");
    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(replaceMock).toHaveBeenCalledWith("/profile");
  });

  it("zeigt für ein unbekanntes Konto und für ein falsches Passwort dieselbe Meldung", async () => {
    // Beide Fälle liefern serverseitig dieselbe Antwortform (Status 401, gleicher Code/Text,
    // siehe server/auth/create-auth.test.ts, "Keine Nutzer-Enumeration") — hier wird geprüft,
    // dass die Oberfläche daraus auch tatsächlich denselben Text macht, statt selbst zu verraten,
    // welcher der beiden Fälle vorliegt.
    async function submitAndReadError(email: string, password: string): Promise<string> {
      signInEmailMock.mockResolvedValueOnce({ data: null, error: { status: 401, message: "Invalid email or password" } });
      const user = userEvent.setup();
      const view = renderLoginForm();
      await user.type(screen.getByLabelText("E-Mail"), email);
      await user.type(screen.getByLabelText("Passwort"), password);
      await user.click(screen.getByRole("button", { name: "Anmelden" }));
      const alert = await screen.findByText(/E-Mail oder Passwort sind falsch/);
      const text = alert.textContent ?? "";
      view.unmount();
      return text;
    }

    const unknownAccountText = await submitAndReadError("unbekannt@example.com", "irgendein-passwort");
    const wrongPasswordText = await submitAndReadError("bekannt@example.com", "falsches-passwort");

    expect(unknownAccountText).toBe(wrongPasswordText);
  });

  it("zeigt eine verständliche Meldung bei Rate-Limit (429)", async () => {
    signInEmailMock.mockResolvedValueOnce({ data: null, error: { status: 429, message: "Zu viele Anmeldeversuche. Was tun: Kurz warten (bis zu 15 Minuten) und dann erneut versuchen." } });
    const user = userEvent.setup();
    renderLoginForm();
    await user.type(screen.getByLabelText("E-Mail"), "person@example.com");
    await user.type(screen.getByLabelText("Passwort"), "ein-passwort-123");
    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByText(/Zu viele Anmeldeversuche/)).toBeInTheDocument();
  });

  it("zeigt OAuth-Knöpfe nur für übergebene Provider", () => {
    renderLoginForm([{ key: "github", displayName: "GitHub" }]);
    expect(screen.getByRole("button", { name: "Mit GitHub anmelden" })).toBeInTheDocument();
  });

  it("zeigt keinen OAuth-Bereich, wenn keine Provider konfiguriert sind", () => {
    renderLoginForm([]);
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});
