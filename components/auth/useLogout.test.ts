import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLogout } from "./useLogout";

const signOutMock = vi.fn();
const refreshMock = vi.fn();
const pushMock = vi.fn();

vi.mock("./authClient", () => ({
  authClient: { signOut: (...args: unknown[]) => signOutMock(...args) },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: pushMock }),
}));

describe("useLogout", () => {
  beforeEach(() => {
    signOutMock.mockReset().mockResolvedValue(undefined);
    refreshMock.mockReset();
    pushMock.mockReset();
  });

  it("beendet die Sitzung serverseitig über authClient.signOut()", async () => {
    const { result } = renderHook(() => useLogout());
    await result.current();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("aktualisiert die Server Components über router.refresh(), auch ohne Ziel", async () => {
    const { result } = renderHook(() => useLogout());
    await result.current();
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("navigiert zusätzlich, wenn ein redirectTo übergeben wird", async () => {
    const { result } = renderHook(() => useLogout());
    await result.current("/");
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("wartet auf das Ende von signOut, bevor refresh/push ausgelöst werden", async () => {
    const callOrder: string[] = [];
    signOutMock.mockImplementation(async () => {
      callOrder.push("signOut");
    });
    refreshMock.mockImplementation(() => callOrder.push("refresh"));
    const { result } = renderHook(() => useLogout());
    await result.current();
    expect(callOrder).toEqual(["signOut", "refresh"]);
  });
});
