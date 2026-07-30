/**
 * GET /api/stream — Server-Sent Events for the live dashboard.
 *
 * Relays the pipeline's publish() events (issue:created, issue:updated,
 * report:failed) to every connected dashboard. This is what makes the map pin
 * drop on camera in the demo instead of after a page refresh (plan.md §9).
 *
 * Console-only, but it cannot be guarded the usual way: the browser's
 * EventSource API has no way to set an Authorization header. So the dashboard
 * trades its session token for a short-lived, stream-audience ticket
 * (POST /api/auth/stream-ticket) and passes it in the query string.
 *
 * requireStreamTicket runs BEFORE anything is written, which matters more here
 * than on a normal route: once res.writeHead sends `text/event-stream` the
 * status line is already on the wire, and a rejection after that point would
 * reach the client as a silent, empty stream rather than a 401.
 */
import { Router } from 'express';

import { subscribe } from '../lib/events.js';
import { requireStreamTicket } from '../middleware/auth.js';

export function streamRouter() {
  const router = Router();

  router.get('/', requireStreamTicket, (req, res) => {
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
