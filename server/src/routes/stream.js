/**
 * GET /api/stream — Server-Sent Events for the live dashboard.
 *
 * Relays the pipeline's publish() events (issue:created, issue:updated,
 * report:failed) to every connected dashboard. This is what makes the map pin
 * drop on camera in the demo instead of after a page refresh (plan.md §9).
 */
import { Router } from 'express';

import { subscribe } from '../lib/events.js';

export function streamRouter() {
  const router = Router();

  router.get('/', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable proxy buffering (nginx/Render) so events flush immediately.
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n');
    res.write(': connected\n\n');

    const unsubscribe = subscribe(({ event, payload }) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    });

    // Comment pings keep intermediaries from closing an idle connection.
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  return router;
}
