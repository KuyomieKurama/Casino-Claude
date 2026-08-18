import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const headersMock = vi.fn();

vi.mock("@/server/auth/guards", () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock("next/headers", () => ({
  headers: () => headersMock(),
}));
vi.mock("@/components/layout/UserShell", () => ({
  UserShell: ({ children }: { children: React.ReactNode }) => <div data-testid="user-shell">{children}</div>,
}));

import UserLayout from "./layout";

describe("UserLayout (app/(user)/layout.tsx)", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    redirectMock.mockClear();
    headersMock.mockReset();
  });

  it("leitet ohne Sitzung nach /login mit dem aktuellen Pfad als next weiter", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    headersMock.mockResolvedValueOnce(new Headers({ "x-pathname": "/wallet" }));

    await expect(UserLayout({ children: <div /> })).rejects.toThrow("REDIRECT:/login?next=%2Fwallet");
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("weist einen externen x-pathname-Header ab und fällt auf /profile zurück (offene Weiterleitung)", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    headersMock.mockResolvedValueOnce(new Headers({ "x-pathname": "https://evil.example.com" }));

    await expect(UserLayout({ children: <div /> })).rejects.toThrow("REDIRECT:/login?next=%2Fprofile");
  });

  it("fällt ohne x-pathname-Header (kein Cookie über die Middleware gesehen) auf /profile zurück", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    headersMock.mockResolvedValueOnce(new Headers());

    await expect(UserLayout({ children: <div /> })).rejects.toThrow("REDIRECT:/login?next=%2Fprofile");
  });

  it("rendert die Kindelemente innerhalb der Nutzerhülle bei gültiger Sitzung, ohne Weiterleitung", async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: "u1", role: "user", status: "active", isGuest: false } });

    const element = await UserLayout({ children: <div>Inhalt</div> });
    render(element);

    expect(screen.getByTestId("user-shell")).toHaveTextContent("Inhalt");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
