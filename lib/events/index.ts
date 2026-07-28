import "server-only";

/**
 * Side-effect import: registers every subscriber exactly once. Any action
 * that calls `emit()` must import from "@/lib/events" (this file), not
 * "@/lib/events/bus" directly, or subscribers won't be registered.
 */
import "./subscribers/audit";
import "./subscribers/cache";
import "./subscribers/analytics";

export { emit, on, subscriberCount } from "./bus";
export type { EventName, EventPayloadMap } from "./types";
