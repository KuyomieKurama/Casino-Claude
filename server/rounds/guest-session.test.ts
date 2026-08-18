// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { createTestDatabase } from "@/server/db/test-harness";
import { createAuth } from "@/server/auth/create-auth";
import { createAuthGuards } from "@/server/auth/guards";
import { startGuestSession } from "./guest-session";

describe("startGuestSession", () => {
  test("legt ein Gastkonto an und liefert ein Cookie, das getSession() erkennt", async () => {
    const db = await createTestDatabase();
    const auth = createAuth(db);
    const { getSession } = createAuthGuards(auth);

    const guest = await startGuestSession(db, auth);

    const [name, ...rest] = guest.setCookieHeader.split(";")[0]?.split("=") ?? [];
    expect(name).toContain("session_token");
    const headers = new Headers({ cookie: guest.setCookieHeader.split(";")[0] ?? "" });

    const session = await getSession(headers);
    expect(session?.user.id).toBe(guest.userId);
    expect(session?.user.isGuest).toBe(true);
    expect(rest.join("=")).not.toBe("");
  });

  test("zwei Gastsitzungen bekommen unterschiedliche Konten", async () => {
    const db = await createTestDatabase();
    const auth = createAuth(db);

    const a = await startGuestSession(db, auth);
    const b = await startGuestSession(db, auth);

    expect(a.userId).not.toBe(b.userId);
  });

  test("das Cookie trägt HttpOnly (kein Zugriff aus clientseitigem JavaScript)", async () => {
    const db = await createTestDatabase();
    const auth = createAuth(db);

    const guest = await startGuestSession(db, auth);

    expect(guest.setCookieHeader).toContain("HttpOnly");
  });
});
