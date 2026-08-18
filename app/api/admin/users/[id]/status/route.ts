import { db } from "@/server/db/client";
import { adminJson, readJsonBody, withAdminSession } from "@/server/admin/route-helpers";
import { userStatusUpdateSchema } from "@/server/admin/schemas";
import { setUserStatus } from "@/server/admin/user-admin-service";

/**
 * Konto sperren/entsperren (Admin-Auftrag §3). `runtime = "nodejs"`: der `pg`-Treiber
 * (server/db/client.ts) ist nicht Edge-fähig, dieselbe Begründung wie bei den übrigen
 * Route-Handlern des Projekts.
 */
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withAdminSession(async (session) => {
    const { id: targetUserId } = await context.params;

    const body = await readJsonBody(request);
    if (!body.ok) return adminJson({ success: false, error: "INVALID_INPUT" }, 400);

    const parsed = userStatusUpdateSchema.safeParse(body.value);
    if (!parsed.success) return adminJson({ success: false, error: "INVALID_INPUT" }, 400);

    const result = await setUserStatus(db, session.user.id, targetUserId, parsed.data.status);
    if (!result.ok) {
      const status = result.reason === "NOT_FOUND" ? 404 : 409;
      return adminJson({ success: false, error: result.reason }, status);
    }
    return adminJson({ success: true, data: { user: result.user } }, 200);
  });
}
