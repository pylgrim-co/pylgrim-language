/**
 * Open-source server seam — the counterpart to ../cloud/server.ts.
 *
 * Same names, same signatures, none of the hosted machinery behind them.
 * See ./flags.ts for what this edition deliberately does not have.
 */

export { currentSessionUser, currentUserId, requireUserId, unauthorized, LOCAL_USER } from "./identity";
// No upgradeRequired: there is nothing to upgrade to, and nothing in
// this edition calls it.
export { planFor, recordPlanChoice, requirePaid, requestContext, quotaResponse } from "./entitlement";
export { recordGenerationEvent, costUsd } from "./usage";
export { audioExists, audioUrl, uploadAudio, audioFilePath } from "./audio-store";
export { getProvider, resolveProvider, providerStatus } from "./provider";
export { FLAGS } from "./flags";
