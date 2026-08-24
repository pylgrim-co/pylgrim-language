import type { EditionFlags } from "../types";

/**
 * The open-source edition: a single-user local app.
 *
 * No accounts, because there is nobody to distinguish from. No billing,
 * because nobody is being charged — generation runs on the operator's own
 * provider key. No pool, because the shared library is a hosted-service
 * asset and not part of this distribution (charter:
 * self-hosters-get-no-pool-access). No sync, because IndexedDB is the
 * whole store and there is no server behind it.
 *
 * Everything else — generation, the weave, dialogue tiers, difficulty,
 * review scheduling, audio, export — works exactly as it does hosted.
 */
export const FLAGS: EditionFlags = {
  HAS_ACCOUNTS: false,
  HAS_BILLING: false,
  HAS_POOL: false,
  HAS_SYNC: false,
  EDITION: "oss",
};
