import { getProvider } from "../../lib/provider";
import type { QuotaDecision, RequestContext } from "../types";
import { LOCAL_USER } from "./identity";

/**
 * Entitlement in the open-source edition: everything is allowed.
 *
 * There is no plan to be on and no quota to spend, because pylgrim is not
 * paying for any of it — generation runs against the operator's own
 * ANTHROPIC_API_KEY and is billed to them by Anthropic directly. That is
 * the same cost model the hosted BYO-key option uses, which is why the
 * hosted paywall waves BYO-key callers through too.
 *
 * The honest limit here is the operator's provider account, and it
 * enforces itself.
 */

const UNMETERED: QuotaDecision = { allowed: true, used: 0, limit: Infinity };

export async function requestContext(): Promise<RequestContext> {
  return {
    userId: LOCAL_USER.id,
    provider: await getProvider(),
    quota: UNMETERED,
    byoKey: true,
  };
}

/**
 * No plan, no gate. Returning null means "proceed".
 *
 * The parameters exist because the hosted seam takes them and callers are
 * shared code; nothing here reads them.
 */
export async function requirePaid(_userId?: string, _byoKey?: boolean): Promise<Response | null> {
  return null;
}

/** Never reached — nothing in this edition is metered. */
export function quotaResponse(_quota: QuotaDecision): Response {
  return new Response(JSON.stringify({ error: "quota" }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  });
}

export async function hasByoKey(_userId?: string): Promise<boolean> {
  return true;
}

/**
 * Plan surface, present only so the seam's shape holds. Nothing in the
 * open-source build renders a plan or asks whether one was chosen.
 */
export async function planFor(_userId?: string): Promise<{ plan: "paid"; choice: "paid"; chosen: true; grace: false }> {
  return { plan: "paid", choice: "paid", chosen: true, grace: false };
}

export async function recordPlanChoice(_userId?: string, _choice?: string): Promise<void> {
  // No plans to record.
}
