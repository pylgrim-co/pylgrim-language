/**
 * Open-source client seam — the counterpart to ../cloud/client.tsx.
 *
 * The hosted surfaces have no meaning here, so they render nothing.
 * App.tsx does not call them anyway: it guards every one on FLAGS. These
 * exist so the module contract holds and the build stays honest.
 */

import type {
  AuthFormComponent,
  ExploreComponent,
  PlanChoiceComponent,
  ShareFlowComponent,
  UpgradePanelComponent,
} from "../types";
import type { OpenedPoolStory } from "../types";

export const Explore: ExploreComponent = () => null;
export const ShareFlow: ShareFlowComponent = () => null;
export const UpgradePanel: UpgradePanelComponent = () => null;
export const AuthForm: AuthFormComponent = () => null;
export const PlanChoice: PlanChoiceComponent = () => null;

/**
 * There is no server to sync to. The change queue is not written either
 * (see db.enqueue) — without a drain it would grow forever.
 */
export function scheduleSync(_delayMs?: number): void {}

/** Kept so listeners can be registered unconditionally; never dispatched. */
export const CAP_EVENT = "pylgrim:card-cap";

export async function signOut(): Promise<void> {}

/** No plan, no cap. The counter that reads this is billing-gated off. */
export const FREE_CARD_CAP = Infinity;

/**
 * Scenario ladders recommend the next story out of the pool. With no pool
 * there is nothing to recommend, so this always returns null and the
 * reader simply never shows a suggestion. Charter:
 * self-hosters-get-no-pool-access — no self-host path reads the pool, and
 * that includes the recommendation query.
 */
export async function nextScenario(_input?: unknown): Promise<null> {
  return null;
}

/** Unreachable: nothing in this edition produces a pool result to open. */
export function poolResultToLocal(_r?: unknown): OpenedPoolStory | null {
  return null;
}

/** No pool, so a rating stays local. The local feedback record is
 *  already written by the caller; this is only the shared half. */
export function reportPoolFeedback(_input?: unknown): void {}

export { FLAGS } from "./flags";
