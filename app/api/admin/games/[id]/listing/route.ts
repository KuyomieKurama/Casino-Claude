import { db } from "@/server/db/client";
import { adminJson, readJsonBody, withAdminSession } from "@/server/admin/route-helpers";
import { gameListingUpdateSchema } from "@/server/admin/schemas";
import { updateGameListingFields } from "@/server/admin/game-admin-service";

/** Vitrinenfelder eines Titels ändern: is_featured, sort_order (Admin-Auftrag §2). */
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withAdminSession(async (session) => {
    const { id: gameId } = await context.params;

    const body = await readJsonBody(request);
    if (!body.ok) return adminJson({ success: false, error: "INVALID_INPUT" }, 400);

    const parsed = gameListingUpdateSchema.safeParse(body.value);
    if (!parsed.success) return adminJson({ success: false, error: "INVALID_INPUT" }, 400);

    const result = await updateGameListingFields(db, session.user.id, gameId, parsed.data);
    if (!result.ok) return adminJson({ success: false, error: result.reason }, 404);
    return adminJson({ success: true, data: { game: result.game } }, 200);
  });
}
