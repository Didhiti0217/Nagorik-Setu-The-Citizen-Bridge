/**
 * Tiny in-process event bus for Server-Sent Events.
 *
 * The pipeline calls publish(event, payload) when an issue is created, updated,
 * or a report fails; the /api/stream route relays those to every connected
 * dashboard so the map pin drops live (plan.md §5, the proof-of-realness shot).
 *
 * In-process is deliberate: a single Node instance is all the demo needs. A
 * multi-instance deploy would swap this for Redis pub/sub, but that is scope we
 * are explicitly not building (plan.md §12).
 */
import { EventEmitter } from 'node:events';

const bus = new EventEmitter();
bus.setMaxListeners(0); // many dashboard tabs may subscribe at once

/** Matches the pipeline's `publish` dependency signature. */
export function publish(event, payload) {
  bus.emit('sse', { event, payload });
}

export function subscribe(listener) {
  bus.on('sse', listener);
  return () => bus.off('sse', listener);
}
