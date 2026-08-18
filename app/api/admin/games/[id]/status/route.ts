import { db } from "@/server/db/client";
import { adminJson, readJsonBody, withAdminSession } from "@/server/admin/route-helpers";
import { gameStatusUpdateSchema } from "@/server/admin/schemas";
import { setGameStatus } from "@/server/admin/game-admin-service";

/** Titelstatus ändern (Admin-Auftrag §2). Erzwingt serverseitig: kein aktiver Titel ohne aktiven Modus. */
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withAdminSession(async (session) => {
    const { id: gameId } = await context.params;

    const body = await readJsonBody(request);
    if (!body.ok) return adminJson({ success: false, error: "INVALID_INPUT" }, 400);

    const parsed = gameStatusUpdateSchema.safeParse(body.value);
    if (!parsed.success) return adminJson({ success: false, error: "INVALID_INPUT" }, 400);

    const result = await setGameStatus(db, session.user.id, gameId, parsed.data.status);
    if (!result.ok) {
      const status = result.reason === "NOT_FOUND" ? 404 : 409;
      return adminJson({ success: false, error: result.reason }, status);
    }
    return adminJson({ success: true, data: { game: result.game } }, 200);
  });
}
