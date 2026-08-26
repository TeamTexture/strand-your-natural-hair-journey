import { json } from "./cors.ts";

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AiRequestMode {
  userId: string;
  dryRun: boolean;
  isImpersonated: boolean;
  impersonatedBy: string | null;
}

function targetFromBody(body: Record<string, unknown>): string | null {
  const direct = body.impersonatedUserId;
  if (typeof direct === "string") return direct;
  const nested = body.impersonation;
  if (nested && typeof nested === "object") {
    const target = (nested as { targetUserId?: unknown }).targetUserId;
    if (typeof target === "string") return target;
  }
  return null;
}

export async function resolveAiRequestMode(
  authUserId: string,
  body: Record<string, unknown>,
  client: RpcClient,
): Promise<AiRequestMode | Response> {
  if (body.dryRun !== true) {
    return {
      userId: authUserId,
      dryRun: false,
      isImpersonated: false,
      impersonatedBy: null,
    };
  }

  const targetUserId = targetFromBody(body);
  if (!targetUserId || !UUID_RE.test(targetUserId)) {
    return json(400, { error: "invalid_impersonation_target" });
  }

  const { data, error } = await client.rpc("has_role", {
    _user_id: authUserId,
    _role: "admin",
  });
  if (error || data !== true) return json(403, { error: "impersonation_forbidden" });

  return {
    userId: targetUserId,
    dryRun: true,
    isImpersonated: true,
    impersonatedBy: authUserId,
  };
}
