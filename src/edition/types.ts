/**
 * The edition contract.
 *
 * pylgrim ships in two editions from one source tree. The HOSTED edition
 * (src/edition/cloud) has accounts, a subscription, a shared story pool
 * and Supabase behind it. The OPEN SOURCE edition (src/edition/oss) has
 * none of those: it is a single-user local app that talks to the
 * operator's own provider keys and stores everything in IndexedDB.
 *
 * Every hosted-only concern is reached through this contract and nowhere
 * else. That is what lets the export delete src/edition/cloud/ outright
 * and still produce a working app — and what stops accounts or billing
 * leaking back into the open-source build by accident.
 *
 * Both implementations export these types identically. Nothing outside
 * src/edition/ may import from cloud/ or oss/ directly.
 */

/** What a hosted account is entitled to. The open-source edition has
 *  no plans; its seam reports "paid" so shared code needs no branch. */
export type Plan = "free" | "paid";

export interface SessionUser {
  id: string;
  email: string | null;
}

/** Whether a caller may generate, and how much they have left. */
export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
}

/** Per-request identity, provider and entitlement, resolved once. */
export interface RequestContext {
  userId: string | null;
  provider: import("../lib/provider").Provider;
  quota: QuotaDecision;
}

export interface GenerationEvent {
  userId?: string | null;
  kind: "extract" | "generate" | "translate" | "seed" | "regen" | "tts" | "checkpoint";
  provider: string;
  model: string;
  targetLang?: string;
  poolHit?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  /** explicit cost override — TTS is priced per character, not per token */
  costUsd?: number;
}

/**
 * What this edition has. Read these instead of testing for a plan: the
 * open-source build has no plan to test.
 */
export interface EditionFlags {
  /** accounts, sign-in, a login gate */
  HAS_ACCOUNTS: boolean;
  /** subscriptions, checkout, quotas, the free-tier gate */
  HAS_BILLING: boolean;
  /** the shared story pool and its seed library (charter: hosted-only) */
  HAS_POOL: boolean;
  /** server-side sync of stories and cards across devices */
  HAS_SYNC: boolean;
  /** human-readable edition name, for UI and diagnostics */
  EDITION: "cloud" | "oss";
}

/**
 * Hosted client surfaces, typed structurally so both editions satisfy the
 * same contract: the cloud build supplies the real components, the
 * open-source build supplies renderers that draw nothing. App.tsx guards
 * on FLAGS and never learns which it got.
 */
export type ExploreComponent = import("react").ComponentType<{
  onOpen: (story: import("../lib/schema").Story) => void;
  onOpenV2: (story: import("../lib/schema-v2").StoryV2) => void;
}>;

export type ShareFlowComponent = import("react").ComponentType<{
  story: import("../lib/schema").Story;
  onDone: (contributed: boolean) => void;
}>;

export type UpgradePanelComponent = import("react").ComponentType<{
  title: string;
  what: string;
}>;

export type AuthFormComponent = import("react").ComponentType<{
  next?: string;
  initialMode?: "signin" | "signup";
}>;

export type PlanChoiceComponent = import("react").ComponentType<{
  upgrade?: boolean;
  email: string | null;
}>;

/**
 * Background sync. The open-source edition has nothing to sync to, so its
 * scheduleSync is a no-op — and db.enqueue stops writing the change queue
 * entirely, which is what stops it growing forever with no drain.
 */
export interface SyncSeam {
  scheduleSync: (delayMs?: number) => void;
  CAP_EVENT: string;
  signOut: () => Promise<void>;
}

/**
 * A story offered by the pool. Declared here rather than in lib/ladder
 * because the open-source edition has no pool but still compiles the
 * reader components that would display a suggestion — they just never
 * receive one.
 */
export interface PoolSuggestion {
  poolId: string;
  format: string;
  titleL1: string;
  titleTarget: string;
  targetLang: string;
  region: string;
  register: string;
  level: string;
  tags: string[];
  source: string;
  objectives: string[];
  rating: number;
  generated: unknown;
}

/** A pooled story converted into something the local reader can open. */
export type OpenedPoolStory =
  | { format: "weave"; story: import("../lib/schema").Story }
  | { format: "dialogue-tiers"; story: import("../lib/schema-v2").StoryV2 };
