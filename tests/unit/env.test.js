const { validateEnv } = require("../../src/config/env");

describe("Environment configuration validation", () => {
  const validEnv = {
    NODE_ENV: "development",
    PORT: "4000",
    BASE_URL: "https://reelrelay.example.com",
    MONGODB_URI: "mongodb://localhost:27017/reelrelay",
    IG_APP_ID: "1234567890",
    IG_APP_SECRET: "secret1234567890",
    IG_VERIFY_TOKEN: "verify_token_123",
    IG_USER_ID: "17841400000000000",
    IG_ACCESS_TOKEN: "EAA...",
    IG_API_VERSION: "v23.0",
    ADMIN_PASSWORD: "very_secure_admin_password_123",
    SESSION_SECRET: "session_secret_32_characters_minimum!",
    CSRF_SECRET: "csrf_secret_32_characters_minimum__!",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    LOG_LEVEL: "debug",
    LOG_TTL_DAYS: "30",
    LOG_SKIPPED: "true",
  };

  it("successfully parses valid environment variables", () => {
    const config = validateEnv(validEnv);

    expect(config.NODE_ENV).toBe("development");
    expect(config.PORT).toBe(4000);
    expect(config.BASE_URL).toBe("https://reelrelay.example.com");
    expect(config.MONGODB_URI).toBe("mongodb://localhost:27017/reelrelay");
    expect(config.IG_APP_ID).toBe("1234567890");
    expect(config.IG_APP_SECRET).toBe("secret1234567890");
    expect(config.IG_VERIFY_TOKEN).toBe("verify_token_123");
    expect(config.IG_USER_ID).toBe("17841400000000000");
    expect(config.IG_ACCESS_TOKEN).toBe("EAA...");
    expect(config.IG_API_VERSION).toBe("v23.0");
    expect(config.ADMIN_PASSWORD).toBe("very_secure_admin_password_123");
    expect(config.SESSION_SECRET).toBe("session_secret_32_characters_minimum!");
    expect(config.CSRF_SECRET).toBe("csrf_secret_32_characters_minimum__!");
    expect(config.ENCRYPTION_KEY).toBe(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    );
    expect(config.LOG_LEVEL).toBe("debug");
    expect(config.LOG_TTL_DAYS).toBe(30);
    expect(config.LOG_SKIPPED).toBe(true);
  });

  it("applies default values for optional environment variables", () => {
    const minimalEnv = {
      MONGODB_URI: "mongodb://localhost:27017/reelrelay",
      IG_APP_ID: "1234567890",
      IG_APP_SECRET: "secret1234567890",
      IG_VERIFY_TOKEN: "verify_token_123",
      IG_USER_ID: "17841400000000000",
      ADMIN_PASSWORD: "very_secure_admin_password_123",
      SESSION_SECRET: "session_secret_32_characters_minimum!",
      CSRF_SECRET: "csrf_secret_32_characters_minimum__!",
      ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    };

    const config = validateEnv(minimalEnv);

    expect(config.NODE_ENV).toBe("development");
    expect(config.PORT).toBe(3000);
    expect(config.BASE_URL).toBe("http://localhost:3000");
    expect(config.IG_API_VERSION).toBe("v23.0");
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.LOG_TTL_DAYS).toBe(60);
    expect(config.LOG_SKIPPED).toBe(false);
  });

  it("throws a descriptive error when required variables are missing", () => {
    expect(() => validateEnv({})).toThrow(/Invalid environment variables/);
  });

  it("rejects ADMIN_PASSWORD if shorter than 12 characters", () => {
    const invalidEnv = {
      ...validEnv,
      ADMIN_PASSWORD: "short",
    };

    expect(() => validateEnv(invalidEnv)).toThrow(/ADMIN_PASSWORD/);
  });

  it("rejects SESSION_SECRET if shorter than 32 characters", () => {
    const invalidEnv = {
      ...validEnv,
      SESSION_SECRET: "short_secret",
    };

    expect(() => validateEnv(invalidEnv)).toThrow(/SESSION_SECRET/);
  });

  it("rejects CSRF_SECRET if shorter than 32 characters", () => {
    const invalidEnv = {
      ...validEnv,
      CSRF_SECRET: "short_secret",
    };

    expect(() => validateEnv(invalidEnv)).toThrow(/CSRF_SECRET/);
  });

  it("rejects ENCRYPTION_KEY if not 64 hex characters", () => {
    const nonHexEnv = {
      ...validEnv,
      ENCRYPTION_KEY: "not_a_hex_key_0123456789abcdef0123456789abcdef0123456789abcdef12",
    };

    expect(() => validateEnv(nonHexEnv)).toThrow(/ENCRYPTION_KEY/);

    const wrongLengthEnv = {
      ...validEnv,
      ENCRYPTION_KEY: "0123456789abcdef",
    };

    expect(() => validateEnv(wrongLengthEnv)).toThrow(/ENCRYPTION_KEY/);
  });

  it("rejects invalid LOG_LEVEL", () => {
    const invalidLogLevel = {
      ...validEnv,
      LOG_LEVEL: "invalid_level",
    };

    expect(() => validateEnv(invalidLogLevel)).toThrow(/LOG_LEVEL/);
  });
});
