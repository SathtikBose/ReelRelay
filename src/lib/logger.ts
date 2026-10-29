/**
 * Structured logger for Cloudflare Workers.
 * Logs output in structured JSON format and ensures tokens/secrets are never exposed.
 */

function sanitize(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/EAA[a-zA-Z0-9_\-]+/g, "[REDACTED_META_TOKEN]")
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED_TOKEN]")
    .replace(/secret=[a-zA-Z0-9_\-]+/gi, "secret=[REDACTED]");
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("token") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("password") ||
      lowerKey.includes("auth")
    ) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      result[key] = sanitize(value);
    } else if (value && typeof value === "object" && !(value instanceof Date)) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export const logger = {
  debug: (data: Record<string, unknown>, message?: string) => {
    console.debug(
      JSON.stringify({
        level: "debug",
        timestamp: new Date().toISOString(),
        message: message ? sanitize(message) : undefined,
        ...sanitizeObject(data),
      })
    );
  },
  info: (data: Record<string, unknown>, message?: string) => {
    console.info(
      JSON.stringify({
        level: "info",
        timestamp: new Date().toISOString(),
        message: message ? sanitize(message) : undefined,
        ...sanitizeObject(data),
      })
    );
  },
  warn: (data: Record<string, unknown>, message?: string) => {
    console.warn(
      JSON.stringify({
        level: "warn",
        timestamp: new Date().toISOString(),
        message: message ? sanitize(message) : undefined,
        ...sanitizeObject(data),
      })
    );
  },
  error: (data: Record<string, unknown>, message?: string) => {
    console.error(
      JSON.stringify({
        level: "error",
        timestamp: new Date().toISOString(),
        message: message ? sanitize(message) : undefined,
        ...sanitizeObject(data),
      })
    );
  },
};
