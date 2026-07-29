/**
 * Every auth-related knob, read once and validated once.
 *
 * Two of these checks are boot interlocks rather than defaults, because both
 * failure modes are silent and catastrophic:
 *
 *  1. A missing or short JWT_SECRET. HS256 with a weak secret is a forgeable
 *     session, and the symptom is nothing at all until someone forges one.
 *
 *  2. AUTH_DEMO_MODE=true paired with a real SMS sender. Demo mode returns the
 *     OTP in the API response so a judge can sign in without a Bangladeshi SIM
 *     (CLAUDE.md §0 requires the demo be reachable without a paywall). Ship that
 *     alongside a live gateway and the endpoint becomes a log-in-as-anyone
 *     oracle for every phone number in the country.
 *
 * Both refuse to start rather than warn. A warning in a deploy log is a warning
 * nobody reads.
 */

const int = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number (got "${raw}")`);
  }
  return n;
};

export const MIN_SECRET_LENGTH = 32;

export function authConfig() {
  return {
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    demoMode: process.env.AUTH_DEMO_MODE === 'true',
    otpSender: process.env.OTP_SENDER || 'demo',
    otpTtlSec: int('OTP_TTL_SECONDS', 300),
    otpMaxAttempts: int('OTP_MAX_ATTEMPTS', 5),
    otpResendCooldownSec: int('OTP_RESEND_COOLDOWN_SECONDS', 60),
    inviteTtlHours: int('INVITE_TTL_HOURS', 72),
    streamTicketTtlSec: int('STREAM_TICKET_TTL_SECONDS', 900),
    publicAppUrl: (process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  };
}

/** Throws with an actionable message if the auth environment is unsafe. */
export function assertAuthConfig(cfg = authConfig()) {
  if (!cfg.jwtSecret) {
    throw new Error(
      'JWT_SECRET is not set. Generate one with:  openssl rand -base64 48',
    );
  }
  if (cfg.jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is ${cfg.jwtSecret.length} characters; at least ${MIN_SECRET_LENGTH} are required.`,
    );
  }
  if (cfg.demoMode && cfg.otpSender !== 'demo') {
    throw new Error(
      `AUTH_DEMO_MODE=true returns the OTP in the API response, which is only safe with OTP_SENDER=demo (got "${cfg.otpSender}"). ` +
        'Set AUTH_DEMO_MODE=false before enabling a real gateway.',
    );
  }
  return cfg;
}
