import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthButtons } from "./OAuthButtons";

const signInSocialMock = vi.fn();

vi.mock("./authClient", () => ({
  authClient: { signIn: { social: (...args: unknown[]) => signInSocialMock(...args) } },
}));

describe("OAuthButtons", () => {
  beforeEach(() => {
    signInSocialMock.mockReset();
  });

  it("rendert nichts, wenn kein Provider konfiguriert ist — kein leerer Rahmen", () => {
    const { container } = render(<OAuthButtons providers={[]} callbackURL="/profile" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt genau einen zugänglich benannten Knopf je konfiguriertem Provider", () => {
    render(
      <OAuthButtons
        providers={[
          { key: "google", displayName: "Google" },
          { key: "github", displayName: "GitHub" },
        ]}
        callbackURL="/profile"
      />,
    );
    expect(screen.getByRole("button", { name: "Mit Google anmelden" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mit GitHub anmelden" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Discord/i })).not.toBeInTheDocument();
  });

  it("zeigt nur Knöpfe für aktive Provider, keine toten Knöpfe für inaktive", () => {
    render(<OAuthButtons providers={[{ key: "discord", displayName: "Discord" }]} callbackURL="/profile" />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("Touch-Ziel ist mindestens 44px hoch (Button-Größe md)", () => {
    render(<OAuthButtons providers={[{ key: "google", displayName: "Google" }]} callbackURL="/profile" />);
    const button = screen.getByRole("button", { name: "Mit Google anmelden" });
    expect(button.className).toMatch(/h-11/);
  });

  it("startet die OAuth-Anmeldung mit Provider-Schlüssel und callbackURL beim Klick", async () => {
    const user = userEvent.setup();
    render(<OAuthButtons providers={[{ key: "github", displayName: "GitHub" }]} callbackURL="/wallet" />);
    await user.click(screen.getByRole("button", { name: "Mit GitHub anmelden" }));
    expect(signInSocialMock).toHaveBeenCalledWith({ provider: "github", callbackURL: "/wallet" });
  });
});
