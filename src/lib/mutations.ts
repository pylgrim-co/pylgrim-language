import { db } from "./db";
import type { Card, Story } from "./schema";
import type { ActivityEvent, FeedbackRecord, ReviewEvent } from "./sync-schema";

/**
 * Every local mutation goes through here: write IndexedDB (the primary
 * store), then enqueue the change for background sync. The UI never talks
 * to the network for its own reads or writes.
 */

function now(): string {
  return new Date().toISOString();
}

export async function saveStory(story: Story): Promise<Story> {
  const stamped = { ...story, updatedAt: now() };
  await db.putStory(stamped);
  await db.enqueue({
    kind: "story",
    op: "upsert",
    payload: stamped,
    clientUpdatedAt: stamped.updatedAt,
    enqueuedAt: now(),
  });
  return stamped;
}

export async function deleteStory(story: Story): Promise<void> {
  await db.deleteStory(story.core.id);
  await db.enqueue({
    kind: "story",
    op: "delete",
    payload: story,
    clientUpdatedAt: now(),
    enqueuedAt: now(),
  });
}

export async function saveCard(card: Card): Promise<Card> {
  const stamped = { ...card, updatedAt: now() };
  await db.putCard(stamped);
  await db.enqueue({
    kind: "card",
    op: "upsert",
    payload: stamped,
    clientUpdatedAt: stamped.updatedAt,
    enqueuedAt: now(),
  });
  return stamped;
}

export async function deleteCard(card: Card): Promise<void> {
  await db.deleteCard(card.id);
  await db.enqueue({
    kind: "card",
    op: "delete",
    payload: card,
    clientUpdatedAt: now(),
    enqueuedAt: now(),
  });
}

/** A review appends an event AND updates the card's scheduling state. */
export async function recordReview(event: ReviewEvent, updatedCard: Card): Promise<void> {
  await db.putReviewEvent(event);
  await db.enqueue({
    kind: "reviewEvent",
    op: "upsert",
    payload: event,
    clientUpdatedAt: event.reviewedAt,
    enqueuedAt: now(),
  });
  await saveCard(updatedCard);
}

/** Activity is append-only, like reviews: put + enqueue, never update. */
export async function recordActivity(event: ActivityEvent): Promise<void> {
  await db.putActivityEvent(event);
  await db.enqueue({
    kind: "activityEvent",
    op: "upsert",
    payload: event,
    clientUpdatedAt: event.occurredAt,
    enqueuedAt: now(),
  });
}

export async function recordFeedback(f: FeedbackRecord): Promise<void> {
  await db.putFeedback(f);
  await db.enqueue({
    kind: "feedback",
    op: "upsert",
    payload: f,
    clientUpdatedAt: f.clientUpdatedAt,
    enqueuedAt: now(),
  });
}

/**
 * Signup/signin migration: everything already in the local store is
 * enqueued so the account receives the full anonymous history. Losing a
 * user's pre-signup cards is the one unforgivable bug in this layer.
 */
export async function enqueueAllLocal(): Promise<number> {
  const [stories, cards, reviewEvents, feedback, activityEvents] = await Promise.all([
    db.listStories(),
    db.listCards(),
    db.listReviewEvents(),
    db.listFeedback(),
    db.listActivityEvents(),
  ]);
  let count = 0;
  for (const s of stories) {
    await db.enqueue({
      kind: "story",
      op: "upsert",
      payload: s,
      clientUpdatedAt: s.updatedAt ?? s.createdAt,
      enqueuedAt: now(),
    });
    count++;
  }
  for (const c of cards) {
    await db.enqueue({
      kind: "card",
      op: "upsert",
      payload: c,
      clientUpdatedAt: c.updatedAt ?? c.createdAt,
      enqueuedAt: now(),
    });
    count++;
  }
  for (const r of reviewEvents) {
    await db.enqueue({
      kind: "reviewEvent",
      op: "upsert",
      payload: r,
      clientUpdatedAt: r.reviewedAt,
      enqueuedAt: now(),
    });
    count++;
  }
  for (const f of feedback) {
    await db.enqueue({
      kind: "feedback",
      op: "upsert",
      payload: f,
      clientUpdatedAt: f.clientUpdatedAt,
      enqueuedAt: now(),
    });
    count++;
  }
  for (const a of activityEvents) {
    await db.enqueue({
      kind: "activityEvent",
      op: "upsert",
      payload: a,
      clientUpdatedAt: a.occurredAt,
      enqueuedAt: now(),
    });
    count++;
  }
  return count;
}
