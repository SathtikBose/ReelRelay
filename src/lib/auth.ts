import { constantTimeEqual, computeHmacSha256Hex } from "./crypto";

const SESSION_COOKIE_NAME = "reelrelay_session";
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours session duration
const MAX_FAILED_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes lockout window

type RateLimitRecord = {
  failedCount: number;
  firstAttemptAt: number;
  lockedUntil: number;
};

// In-memory sliding rate-limit storage per client IP
const loginRateLimitMap = new Map<string, RateLimitRecord>();

/**
 * Creates a cryptographically signed session cookie value.
 * Format: "<timestamp>.<hmacSha256Hex>"
 */
export async function createSignedSession(secret: string): Promise<string> {
  const timestamp = Date.now().toString();
  const dataBytes = new TextEncoder().encode(`admin_session:${timestamp}`);
  const signature = await computeHmacSha256Hex(secret, dataBytes);
  return `${timestamp}.${signature}`;
}

/**
 * Verifies that the incoming cookie has a valid HMAC signature and has not expired.
 */
export async function verifySignedSession(
  cookieHeader: string | undefined | null,
  secret: string,
  maxAgeMs = SESSION_MAX_AGE_MS
): Promise<boolean> {
  if (!cookieHeader || !secret) {
    return false;
  }

  // Parse cookies
  const cookies = parseCookies(cookieHeader);
  const sessionValue = cookies[SESSION_COOKIE_NAME];
  if (!sessionValue) {
    return false;
  }

  const parts = sessionValue.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [timestampStr, receivedSig] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return false;
  }

  // Check expiration
  const now = Date.now();
  if (now - timestamp > maxAgeMs || timestamp > now + 60000) {
    return false;
  }

  // Verify HMAC signature
  const dataBytes = new TextEncoder().encode(`admin_session:${timestampStr}`);
  const expectedSig = await computeHmacSha256Hex(secret, dataBytes);

  return constantTimeEqual(receivedSig.toLowerCase(), expectedSig.toLowerCase());
}

/**
 * Constant-time comparison to verify admin password without leaking timing information.
 */
export function verifyAdminPassword(
  input: string | undefined | null,
  expected: string | undefined | null
): boolean {
  if (!input || !expected) {
    return false;
  }
  return constantTimeEqual(input.trim(), expected.trim());
}

/**
 * Rate limits login attempts per client IP.
 */
export function checkLoginRateLimit(ip: string): {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSec?: number;
} {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip);

  if (!record) {
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS };
  }

  // If locked out, check if lock has expired
  if (record.lockedUntil > now) {
    const retryAfterSec = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSec };
  }

  // If window has passed, reset record
  if (now - record.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    loginRateLimitMap.delete(ip);
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS };
  }

  const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - record.failedCount);
  return { allowed: remaining > 0, remainingAttempts: remaining };
}

/**
 * Records a failed login attempt for a client IP.
 */
export function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip);

  if (!record || now - record.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    loginRateLimitMap.set(ip, {
      failedCount: 1,
      firstAttemptAt: now,
      lockedUntil: 0,
    });
    return;
  }

  record.failedCount += 1;
  if (record.failedCount >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + RATE_LIMIT_WINDOW_MS;
  }
}

/**
 * Resets failed login records for a client IP on successful login.
 */
export function clearFailedLogins(ip: string): void {
  loginRateLimitMap.delete(ip);
}

/**
 * Helper to build Set-Cookie header for session creation.
 */
export function buildSessionCookie(sessionValue: string, maxAgeSec = 28800): string {
  return `${SESSION_COOKIE_NAME}=${sessionValue}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

/**
 * Helper to build Set-Cookie header to clear the session cookie on logout.
 */
export function buildLogoutCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

/**
 * Simple cookie parser helper.
 */
export function parseCookies(header: string): Record<string, string> {
  const list: Record<string, string> = {};
  header.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const name = parts[0]?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.slice(1).join("=").trim());
    }
  });
  return list;
}

export { SESSION_COOKIE_NAME };
