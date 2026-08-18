import { db } from "@/server/db/client";
import { adminJson, withAdminSession } from "@/server/admin/route-helpers";
import { revokeUserSessions } from "@/server/admin/user-admin-service";

/** Sitzungen eines Nutzers widerrufen (Admin-Auftrag §3). Kein Body nötig — die Ziel-ID kommt aus dem Pfad. */
export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withAdminSession(async (session) => {
    const { id: targetUserId } = await context.params;

    const result = await revokeUserSessions(db, session.user.id, targetUserId);
    if (!result.ok) return adminJson({ success: false, error: result.reason }, 404);
    return adminJson({ success: true, data: { revokedCount: result.revokedCount } }, 200);
  });
}
