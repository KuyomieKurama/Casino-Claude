import { db } from "@/server/db/client";
import { adminJson, readJsonBody, withAdminSession } from "@/server/admin/route-helpers";
import { gameModeStatusUpdateSchema } from "@/server/admin/schemas";
import { setGameModeStatus } from "@/server/admin/game-admin-service";

/** Modusstatus ändern (Admin-Auftrag §2). Erzwingt dieselbe Invariante spiegelbildlich: der letzte aktive Modus eines aktiven Titels lässt sich nicht deaktivieren. */
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withAdminSession(async (session) => {
    const { id: modeId } = await context.params;

    const body = await readJsonBody(request);
    if (!body.ok) return adminJson({ success: false, error: "INVALID_INPUT" }, 400);

    const parsed = gameModeStatusUpdateSchema.safeParse(body.value);
    if (!parsed.success) return adminJson({ success: false, error: "INVALID_INPUT" }, 400);

    const result = await setGameModeStatus(db, session.user.id, modeId, parsed.data.status);
    if (!result.ok) {
      const status = result.reason === "NOT_FOUND" ? 404 : 409;
      return adminJson({ success: false, error: result.reason }, status);
    }
    return adminJson({ success: true, data: { mode: result.mode } }, 200);
  });
}
