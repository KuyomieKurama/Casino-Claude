import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "./RegisterForm";
import { ToastProvider } from "@/components/ui/Toast";

const signUpEmailMock = vi.fn();
const replaceMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("./authClient", () => ({
  authClient: {
    signUp: { email: (...args: unknown[]) => signUpEmailMock(...args) },
    signIn: { social: vi.fn() },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

function renderRegisterForm(providers: Array<{ key: "google" | "github" | "discord"; displayName: string }> = []) {
  return render(
    <ToastProvider>
      <RegisterForm providers={providers} />
    </ToastProvider>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Anzeigename"), "Kim Muster");
  await user.type(screen.getByLabelText("E-Mail"), "kim@example.com");
  await user.type(screen.getByLabelText("Passwort"), "ein-sicheres-passwort");
  await user.type(screen.getByLabelText("Passwort bestätigen"), "ein-sicheres-passwort");
  await user.click(screen.getByLabelText(/Nutzungsbedingungen/));
}

describe("RegisterForm", () => {
  beforeEach(() => {
    signUpEmailMock.mockReset();
    replaceMock.mockReset();
    searchParams = new URLSearchParams();
  });

  it("fokussiert bei leerem Formular das erste fehlerhafte Feld (Anzeigename)", async () => {
    const user = userEvent.setup();
    renderRegisterForm();
    await user.click(screen.getByRole("button", { name: "Konto anlegen" }));
    expect(screen.getByLabelText("Anzeigename")).toHaveFocus();
    expect(signUpEmailMock).not.toHaveBeenCalled();
  });

  it("registriert ohne automatische Anmeldung und leitet zur Login-Seite weiter", async () => {
    signUpEmailMock.mockResolvedValueOnce({ data: { user: {} }, error: null });
    const user = userEvent.setup();
    renderRegisterForm();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Konto anlegen" }));

    expect(signUpEmailMock).toHaveBeenCalledWith({ email: "kim@example.com", password: "ein-sicheres-passwort", name: "Kim Muster" });
    expect(replaceMock).toHaveBeenCalledWith("/login");
    expect((screen.getByLabelText("Passwort") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Passwort bestätigen") as HTMLInputElement).value).toBe("");
  });

  it("verhält sich bei bereits vergebener E-Mail identisch zu einer neuen E-Mail (kein Fehler, keine Enumeration)", async () => {
    // server/auth/create-auth.ts (autoSignIn: false) liefert für beide Fälle denselben
    // 200er-Erfolg ohne Sitzung — die Oberfläche unterscheidet hier bewusst nicht.
    signUpEmailMock.mockResolvedValueOnce({ data: { user: {} }, error: null });
    const user = userEvent.setup();
    renderRegisterForm();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Konto anlegen" }));
    expect(replaceMock).toHaveBeenCalledWith("/login");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hängt next an den Link zur Anmeldung an, wenn gesetzt", async () => {
    searchParams = new URLSearchParams("next=/wallet");
    signUpEmailMock.mockResolvedValueOnce({ data: { user: {} }, error: null });
    const user = userEvent.setup();
    renderRegisterForm();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Konto anlegen" }));
    expect(replaceMock).toHaveBeenCalledWith("/login?next=%2Fwallet");
  });

  it("zeigt eine verständliche Meldung bei Rate-Limit (429)", async () => {
    signUpEmailMock.mockResolvedValueOnce({ data: null, error: { status: 429, message: "Bitte kurz warten." } });
    const user = userEvent.setup();
    renderRegisterForm();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Konto anlegen" }));
    expect(await screen.findByText("Bitte kurz warten.")).toBeInTheDocument();
  });

  it("zeigt OAuth-Knöpfe nur für übergebene Provider", () => {
    renderRegisterForm([{ key: "google", displayName: "Google" }]);
    expect(screen.getByRole("button", { name: "Mit Google anmelden" })).toBeInTheDocument();
  });
});
