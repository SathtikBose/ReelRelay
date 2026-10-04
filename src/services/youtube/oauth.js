const crypto = require("crypto");
const { env } = require("../../config/env");
const { ValidationError, YouTubeApiError } = require("../../lib/errors");
const { logger } = require("../../lib/logger");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const REQUIRED_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

/**
 * Generates the Google OAuth authorization URL with PKCE and state protection
 * @param {object} session - Express session object
 * @returns {string} Google OAuth consent screen URL
 */
function generateAuthUrl(session) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new ValidationError(
      "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env."
    );
  }

  const state = crypto.randomBytes(32).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  session.ytOauth = {
    state,
    codeVerifier,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minute expiry
  };

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", REQUIRED_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

/**
 * Validates OAuth state and exchanges authorization code for tokens
 * @param {object} query - Query parameters from callback (code, state, error)
 * @param {object} session - Express session object
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number, scopes: string[] }>}
 */
async function validateAndExchangeCode(query, session) {
  if (query.error) {
    logger.warn({ oauthError: query.error }, "Google OAuth callback returned error");
    throw new ValidationError(`Google authorization failed: ${query.error}`);
  }

  if (!query.code || !query.state) {
    throw new ValidationError("Missing OAuth state or authorization code from Google");
  }

  const savedOauth = session?.ytOauth;
  if (!savedOauth || !savedOauth.state || !savedOauth.codeVerifier) {
    throw new ValidationError("OAuth session expired or missing. Please try connecting again.");
  }

  // Constant-time comparison on state to prevent timing attacks
  const stateA = Buffer.from(savedOauth.state);
  const stateB = Buffer.from(query.state);
  const isStateMatch =
    stateA.length === stateB.length && crypto.timingSafeEqual(stateA, stateB);

  if (!isStateMatch || Date.now() > savedOauth.expiresAt) {
    throw new ValidationError("OAuth state mismatch or expired. Please try connecting again.");
  }

  const codeVerifier = savedOauth.codeVerifier;
  delete session.ytOauth;

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: query.code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.error) {
    logger.error({ status: res.status, error: data.error }, "OAuth token exchange failed");
    throw new YouTubeApiError(
      data.error_description || data.error || "Failed to exchange authorization code with Google",
      res.status,
      data.error || "oauth_exchange_failed",
      "auth"
    );
  }

  if (!data.refresh_token) {
    throw new ValidationError(
      "Google did not return a refresh token. Please revoke access to ReelRelay in your Google Account security settings and reconnect."
    );
  }

  const grantedScopes = (data.scope || "").split(" ");
  const hasForceSslScope = grantedScopes.some((s) => s.includes("youtube.force-ssl"));
  if (!hasForceSslScope) {
    throw new ValidationError(
      "The required YouTube permission (youtube.force-ssl) was not granted. Please reconnect and check all requested permissions."
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || 3600,
    scopes: grantedScopes,
  };
}

/**
 * Refreshes the short-lived access token using the stored refresh token
 * @param {string} refreshToken
 * @returns {Promise<{ accessToken: string, expiresIn: number }>}
 */
async function refreshAccessToken(refreshToken) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new YouTubeApiError("Google OAuth client is not configured", 500, "not_configured", "auth");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.error) {
    if (data.error === "invalid_grant") {
      logger.warn("Google OAuth refresh token expired or revoked (invalid_grant)");
      throw new YouTubeApiError(
        "YouTube authorization has expired or was revoked. Please reconnect your channel.",
        400,
        "invalid_grant",
        "auth"
      );
    }

    throw new YouTubeApiError(
      data.error_description || data.error || "Failed to refresh YouTube access token",
      res.status,
      data.error || "refresh_failed",
      "auth"
    );
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  };
}

/**
 * Revokes a token with Google OAuth revoke endpoint
 * @param {string} token - Refresh token or access token
 */
async function revokeToken(token) {
  if (!token) return;
  try {
    const params = new URLSearchParams({ token });
    await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch (err) {
    logger.warn({ err }, "Non-fatal error revoking Google token");
  }
}

module.exports = {
  generateAuthUrl,
  validateAndExchangeCode,
  refreshAccessToken,
  revokeToken,
  REQUIRED_SCOPE,
};
