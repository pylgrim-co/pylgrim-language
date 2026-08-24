import type { Card, Story } from "./schema";
import type { StoryV2 } from "./schema-v2";
import type { ActivityEvent, FeedbackRecord, ReviewEvent } from "./sync-schema";
import { FLAGS } from "../edition/flags";

/**
 * IndexedDB is the PRIMARY store, not a cache (charter: local-first, with
 * accounts as a sync layer over it). v2 adds the sync machinery: a change
 * queue, append-only review events, feedback, and a meta store.
 * Minimal promise wrapper; no dependency.
 */

const DB_NAME = "pylgrim-p0";
const DB_VERSION = 4;

export interface QueueItem {
  /** auto-increment key — IndexedDB guarantees drain order matches write order */
  seq?: number;
  kind: "story" | "card" | "reviewEvent" | "feedback" | "activityEvent";
  op: "upsert" | "delete";
  payload: unknown;
  clientUpdatedAt: string;
  enqueuedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("stories")) db.createObjectStore("stories", { keyPath: "core.id" });
      if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "id" });
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "seq", autoIncrement: true });
      if (!db.objectStoreNames.contains("reviewEvents")) db.createObjectStore("reviewEvents", { keyPath: "id" });
      if (!db.objectStoreNames.contains("feedback")) db.createObjectStore("feedback", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      // v3: dialogue-tier stories (Amendment A1). Local-only during the
      // prototype gate - the sync layer stays v1 until the verdict.
      if (!db.objectStoreNames.contains("storiesV2")) db.createObjectStore("storiesV2", { keyPath: "id" });
      // v4: append-only activity events (work item activity-events-and-
      // mastery-fixes) — the timestamped record streaks and recaps derive from.
      if (!db.objectStoreNames.contains("activityEvents")) db.createObjectStore("activityEvents", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export const db = {
  putStory: (story: Story) => tx("stories", "readwrite", (s) => s.put(story)),
  putStoryV2: (story: StoryV2) => tx("storiesV2", "readwrite", (s) => s.put(story)),
  getStoryV2: (id: string) => tx<StoryV2 | undefined>("storiesV2", "readonly", (s) => s.get(id) as IDBRequest<StoryV2 | undefined>),
  listStoriesV2: () => tx<StoryV2[]>("storiesV2", "readonly", (s) => s.getAll() as IDBRequest<StoryV2[]>),
  deleteStoryV2: (id: string) => tx("storiesV2", "readwrite", (s) => s.delete(id)),
  getStory: (id: string) => tx<Story | undefined>("stories", "readonly", (s) => s.get(id) as IDBRequest<Story | undefined>),
  listStories: () => tx<Story[]>("stories", "readonly", (s) => s.getAll() as IDBRequest<Story[]>),
  deleteStory: (id: string) => tx("stories", "readwrite", (s) => s.delete(id)),

  putCard: (card: Card) => tx("cards", "readwrite", (s) => s.put(card)),
  getCard: (id: string) => tx<Card | undefined>("cards", "readonly", (s) => s.get(id) as IDBRequest<Card | undefined>),
  listCards: () => tx<Card[]>("cards", "readonly", (s) => s.getAll() as IDBRequest<Card[]>),
  deleteCard: (id: string) => tx("cards", "readwrite", (s) => s.delete(id)),

  // The change queue exists to be drained by the sync engine. Editions
  // with no server to sync to have no drain, so writing it would grow
  // IndexedDB forever — a slow leak on exactly the installs nobody is
  // monitoring. Local stores above are already written; this is the
  // outbound copy, and it is the only part that has no purpose here.
  enqueue: (item: QueueItem) => (FLAGS.HAS_SYNC ? tx("queue", "readwrite", (s) => s.put(item)) : Promise.resolve()),
  listQueue: () => tx<QueueItem[]>("queue", "readonly", (s) => s.getAll() as IDBRequest<QueueItem[]>),
  removeQueueItem: (seq: number) => tx("queue", "readwrite", (s) => s.delete(seq)),
  clearStore: (name: "queue" | "reviewEvents" | "feedback" | "activityEvents") => tx(name, "readwrite", (s) => s.clear()),

  putReviewEvent: (e: ReviewEvent) => tx("reviewEvents", "readwrite", (s) => s.put(e)),
  listReviewEvents: () => tx<ReviewEvent[]>("reviewEvents", "readonly", (s) => s.getAll() as IDBRequest<ReviewEvent[]>),

  putActivityEvent: (e: ActivityEvent) => tx("activityEvents", "readwrite", (s) => s.put(e)),
  listActivityEvents: () => tx<ActivityEvent[]>("activityEvents", "readonly", (s) => s.getAll() as IDBRequest<ActivityEvent[]>),

  putFeedback: (f: FeedbackRecord) => tx("feedback", "readwrite", (s) => s.put(f)),
  listFeedback: () => tx<FeedbackRecord[]>("feedback", "readonly", (s) => s.getAll() as IDBRequest<FeedbackRecord[]>),

  getMeta: <T = unknown>(key: string) =>
    tx<{ key: string; value: T } | undefined>("meta", "readonly", (s) => s.get(key) as IDBRequest<{ key: string; value: T } | undefined>),
  setMeta: (key: string, value: unknown) => tx("meta", "readwrite", (s) => s.put({ key, value })),
};
