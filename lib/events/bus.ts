import "server-only";
import type { EventName, EventPayloadMap } from "./types";

/**
 * In-process domain event bus.
 *
 * What this is NOT: a distributed message queue. There is no persistence,
 * no retry, no cross-invocation delivery, no Redis/SQS/Kafka. Each Vercel
 * serverless invocation is a fresh, isolated process — nothing "waits" for
 * an event between requests. That infrastructure doesn't exist for this app
 * and isn't warranted at its current scale.
 *
 * What this IS: a same-request, synchronous dispatch mechanism. A Server
 * Action calls `emit("ProjectPublished", payload)`; every subscriber
 * registered for that event runs, awaited, before the action returns. This
 * replaces "the action directly calls logAudit() AND revalidateProject()
 * AND recomputeMetrics()" with "the action emits one event; whichever
 * modules care are subscribed" — real decoupling, without inventing
 * infrastructure this app doesn't have.
 *
 * A subscriber's failure is caught and logged here, never thrown — one bad
 * subscriber must never block another subscriber, and must never fail the
 * mutation that already succeeded by the time anything emits.
 */

type Handler<E extends EventName> = (payload: EventPayloadMap[E]) => Promise<void> | void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<EventName, Handler<any>[]>();

/** Registers a subscriber for an event. Call once per subscriber, at module load (see lib/events/subscribers/*.ts). */
export function on<E extends EventName>(event: E, handler: Handler<E>): void {
  const existing = registry.get(event) ?? [];
  existing.push(handler);
  registry.set(event, existing);
}

/** Emits an event: every subscriber runs, in registration order, awaited. Never throws. */
export async function emit<E extends EventName>(event: E, payload: EventPayloadMap[E]): Promise<void> {
  const handlers = registry.get(event) ?? [];
  for (const handler of handlers) {
    try {
      await handler(payload);
    } catch (error) {
      console.error(`[events] subscriber for "${event}" failed:`, error);
    }
  }
}

/** Test/diagnostic use only — how many subscribers are registered for an event. */
export function subscriberCount(event: EventName): number {
  return registry.get(event)?.length ?? 0;
}

export type { EventName, EventPayloadMap } from "./types";
