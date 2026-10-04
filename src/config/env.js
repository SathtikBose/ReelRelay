const { z } = require("zod");
require("dotenv").config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    BASE_URL: z.string().url().default("http://localhost:3000"),
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
    IG_APP_ID: z.string().min(1, "IG_APP_ID is required"),
    IG_APP_SECRET: z.string().min(1, "IG_APP_SECRET is required"),
    IG_INSTAGRAM_APP_SECRET: z.string().optional(),
    IG_VERIFY_TOKEN: z.string().min(1, "IG_VERIFY_TOKEN is required"),
    IG_USER_ID: z.string().min(1, "IG_USER_ID is required"),
    IG_ACCESS_TOKEN: z.string().optional(),
    IG_API_VERSION: z.string().default("v23.0"),
    ADMIN_PASSWORD: z.string().min(12, "ADMIN_PASSWORD must be at least 12 characters"),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
    CSRF_SECRET: z.string().min(32, "CSRF_SECRET must be at least 32 characters"),
    ENCRYPTION_KEY: z
      .string()
      .length(64, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)")
      .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be a valid hex string"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    LOG_TTL_DAYS: z.coerce.number().int().min(1).default(60),
    LOG_SKIPPED: z
      .union([z.boolean(), z.string()])
      .transform((val) => val === true || val === "true")
      .default(false),

    // YouTube module environment variables
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().optional(),
    YT_ENABLED: z
      .union([z.boolean(), z.string()])
      .transform((val) => val === true || val === "true" || val === "1")
      .default(true),
    YT_POLL_ENABLED: z
      .union([z.boolean(), z.string()])
      .transform((val) => val === true || val === "true" || val === "1")
      .default(true),
    YT_POLL_BASE_INTERVAL_SEC: z.coerce.number().int().min(10).default(300),
    YT_QUOTA_DAILY_BUDGET: z.coerce.number().int().min(100).default(9000),
    YT_MAX_REPLIES_PER_HOUR: z.coerce.number().int().min(1).default(60),
    YT_REPLY_DELAY_MIN_MS: z.coerce.number().int().min(0).default(3000),
    YT_REPLY_DELAY_MAX_MS: z.coerce.number().int().min(0).default(10000),
    YT_PICKER_CACHE_SEC: z.coerce.number().int().min(0).default(600),
  })
  .transform((data) => {
    // Dynamically set default GOOGLE_REDIRECT_URI if not provided
    const redirectUri =
      data.GOOGLE_REDIRECT_URI ||
      `${data.BASE_URL.replace(/\/+$/, "")}/admin/youtube/oauth/callback`;

    return {
      ...data,
      GOOGLE_REDIRECT_URI: redirectUri,
      isYtConfigured: !!(data.GOOGLE_CLIENT_ID && data.GOOGLE_CLIENT_SECRET),
    };
  });

/**
 * Validates provided env or process.env against the Zod schema.
 * @param {Record<string, unknown>} [sourceEnv=process.env]
 * @returns {z.infer<typeof envSchema>}
 */
function validateEnv(sourceEnv = process.env) {
  const result = envSchema.safeParse(sourceEnv);

  if (!result.success) {
    const errorIssues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    const errorMessage = `[Config Error] Invalid environment variables:\n${errorIssues}`;
    throw new Error(errorMessage);
  }

  return result.data;
}

// In test environment, allow falling back to dummy values if not provided
const testDefaults = {
  NODE_ENV: "test",
  PORT: "3000",
  BASE_URL: "http://localhost:3000",
  MONGODB_URI: "mongodb://localhost:27017/reelrelay_test",
  IG_APP_ID: "test_app_id",
  IG_APP_SECRET: "test_app_secret",
  IG_VERIFY_TOKEN: "test_verify_token",
  IG_USER_ID: "17841400000000000",
  ADMIN_PASSWORD: "test_admin_password_min_12_chars",
  SESSION_SECRET: "test_session_secret_32_characters_long!",
  CSRF_SECRET: "test_csrf_secret_32_characters_long_!",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  LOG_LEVEL: "silent",
  LOG_TTL_DAYS: "60",
  LOG_SKIPPED: "false",
  GOOGLE_CLIENT_ID: "test_google_client_id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test_google_client_secret",
  YT_ENABLED: "true",
  YT_POLL_ENABLED: "false", // default polling off in tests
};

let config;
if (process.env.NODE_ENV === "test") {
  config = validateEnv({ ...testDefaults, ...process.env });
} else {
  config = validateEnv(process.env);
}

module.exports = {
  env: config,
  validateEnv,
  envSchema,
};
