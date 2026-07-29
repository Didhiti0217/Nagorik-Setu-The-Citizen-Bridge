/**
 * How a login code reaches a phone. One seam, one env var.
 *
 * There is no SMS gateway in this build. Wiring one needs an account, a
 * contract and per-message cost, and it would lock a judge without a
 * Bangladeshi SIM out of the demo entirely — which CLAUDE.md §0 forbids. So the
 * demo sender does not send anything: it returns `delivered: false`, and that
 * flag is what licenses the route to echo the code back in the response for the
 * login screen to display.
 *
 * Adding a real provider later is one entry in SENDERS and one env var flip.
 * Nothing outside this file changes — services/auth.js resolves the sender once
 * at module load and never branches on which one it got.
 *
 * Note that a real sender must return `delivered: true`. That is not
 * bookkeeping: it is the difference between "the code is on the user's phone"
 * and "the code is only on this screen", and the API response depends on it.
 * The boot interlock in lib/authConfig.js additionally refuses to start with
 * AUTH_DEMO_MODE=true next to a real sender, so the two can never disagree.
 */

const SENDERS = {
  demo: () => ({
    name: 'demo',
    async deliver({ phone, code, ttlSec }) {
      console.log(`[otp] DEMO ${phone} -> ${code} (valid ${ttlSec}s, not sent anywhere)`);
      return { delivered: false, channel: 'demo' };
    },
  }),

  // A real gateway goes here. Sketch:
  //
  // sms: () => ({
  //   name: 'sms',
  //   async deliver({ phone, code }) {
  //     const res = await fetch(process.env.SMS_API_URL, { ... });
  //     if (!res.ok) throw new Error(`sms gateway ${res.status}`);
  //     return { delivered: true, channel: 'sms' };
  //   },
  // }),
};

export function createOtpSender(kind = process.env.OTP_SENDER || 'demo') {
  const make = SENDERS[kind];
  if (!make) {
    throw new Error(`unknown OTP_SENDER "${kind}" (available: ${Object.keys(SENDERS).join(', ')})`);
  }
  return make();
}
