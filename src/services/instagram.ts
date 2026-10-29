import { Bindings } from "../index";
import { CommentEvent } from "./normalizer";
import { KeywordRule, updateCommentStatus, incrementRuleStats } from "../lib/db";
import { renderTemplate } from "./template";
import { logger } from "../lib/logger";

const DEFAULT_GRAPH_VERSION = "v23.0";
const DEFAULT_TIMEOUT_MS = 10000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 2; // Bounded retry: up to 2 attempts max for transient errors, no infinite loops

export type MetaErrorClassification = "transient" | "permanent" | "auth";

export type SendReplyResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
  errorType?: MetaErrorClassification;
};

/**
 * Classifies Meta Graph API errors into actionable categories.
 */
export function classifyMetaError(
  httpStatus: number,
  igCode?: number | string,
  igSubcode?: number | string,
  message = ""
): MetaErrorClassification {
  const codeNum = Number(igCode);
  const subcodeNum = Number(igSubcode);

  // Authentication error (Code 190: Invalid/expired token)
  if (codeNum === 190 || subcodeNum === 463 || subcodeNum === 467) {
    return "auth";
  }

  // Rate limits or transient errors:
  // Code 4: Application request limit reached
  // Code 17: User request limit reached
  // Code 32: Page request limit reached
  // Code 613: Custom-level throttling
  if ([4, 17, 32, 613].includes(codeNum) || httpStatus === 429 || httpStatus >= 500) {
    return "transient";
  }

  // Network / timeout error
  if (message.includes("timeout") || message.includes("abort") || message.includes("ETIMEDOUT")) {
    return "transient";
  }

  // All other errors are permanent (e.g., user blocked DM, permissions, comment deleted)
  return "permanent";
}

/**
 * Strips sensitive Meta tokens from raw error strings.
 */
function sanitizeErrorMessage(msg: string): string {
  if (!msg) return "Unknown error";
  return msg.replace(/EAA[a-zA-Z0-9_\-]+/g, "[REDACTED_META_TOKEN]");
}

/**
 * Sends a private reply message to an Instagram commenter via Meta Graph API.
 */
export async function sendPrivateReplyDm(
  params: {
    commentId: string;
    text: string;
    env: Bindings;
    fetchFn?: typeof fetch;
  }
): Promise<SendReplyResult> {
  const { commentId, text, env, fetchFn = fetch } = params;

  const token = env.META_ACCESS_TOKEN || env.IG_ACCESS_TOKEN;
  if (!token) {
    logger.error({}, "No Meta Access Token configured in environment bindings");
    return {
      success: false,
      error: "META_ACCESS_TOKEN is not configured",
      errorCode: "TOKEN_MISSING",
      errorType: "auth",
    };
  }

  const accountId = env.IG_BUSINESS_ACCOUNT_ID || env.IG_USER_ID;
  if (!accountId) {
    logger.error({}, "No IG_BUSINESS_ACCOUNT_ID configured in environment bindings");
    return {
      success: false,
      error: "IG_BUSINESS_ACCOUNT_ID is not configured",
      errorCode: "ACCOUNT_ID_MISSING",
      errorType: "permanent",
    };
  }

  const version = (env.GRAPH_API_VERSION || env.IG_API_VERSION || DEFAULT_GRAPH_VERSION).replace(/^\//, "");
  // Standard Meta Graph API private reply endpoint
  const url = `https://graph.facebook.com/${version}/${accountId}/messages`;

  const payload = {
    recipient: { comment_id: commentId },
    message: { text },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }

    if (!response.ok) {
      const errObj = (data?.error as Record<string, unknown>) || {};
      const code = errObj.code as number | undefined;
      const subcode = errObj.error_subcode as number | undefined;
      const rawMsg = (errObj.message as string) || `Meta API error with HTTP ${response.status}`;
      const sanitized = sanitizeErrorMessage(rawMsg);
      const errorType = classifyMetaError(response.status, code, subcode, sanitized);

      logger.warn(
        {
          commentId,
          status: response.status,
          code,
          subcode,
          errorType,
        },
        `Meta Graph API returned error: ${sanitized}`
      );

      return {
        success: false,
        error: sanitized,
        errorCode: code ? String(code) : String(response.status),
        errorType,
      };
    }

    const messageId = (data.message_id as string) || (data.recipient_id as string) || "sent";
    return {
      success: true,
      messageId,
    };
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError" || err?.message?.includes("abort");
    const rawMsg = isTimeout ? "Meta API request timed out after 10s" : err?.message || "Network error";
    const sanitized = sanitizeErrorMessage(rawMsg);

    return {
      success: false,
      error: sanitized,
      errorCode: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
      errorType: "transient",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handles full delivery pipeline for an eligible comment event:
 * - Checks 7-day Meta reply window
 * - Renders DM template
 * - Sends DM with bounded retry
 * - Updates D1 status and counters
 * - NEVER crashes the Worker
 */
export async function dispatchCommentReply(
  commentEvent: CommentEvent,
  rule: KeywordRule,
  env: Bindings,
  fetchFn?: typeof fetch
): Promise<{ status: "sent" | "failed" | "skipped"; reason?: string; messageId?: string; error?: string }> {
  try {
    // 1. Enforce Meta's strict 7-day policy window for private replies
    const commentAgeMs = Date.now() - commentEvent.commentedAt.getTime();
    if (commentAgeMs >= SEVEN_DAYS_MS) {
      logger.warn(
        { commentId: commentEvent.commentId, ageHours: Math.round(commentAgeMs / 3600000) },
        "Comment is older than 7 days; skipping private reply per Meta platform policy"
      );

      await updateCommentStatus(env.DB, commentEvent.commentId, {
        status: "skipped",
        skipReason: "expired_7_days",
      });

      return { status: "skipped", reason: "expired_7_days" };
    }

    // 2. Render personalized DM text
    const dmText = renderTemplate(rule.dm_message, {
      link: rule.link,
      username: commentEvent.commenterUsername,
      keyword: commentEvent.text,
    });

    // 3. Dispatch with bounded retries (no infinite loop)
    let lastResult: SendReplyResult | null = null;
    let attempts = 0;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      attempts++;

      lastResult = await sendPrivateReplyDm({
        commentId: commentEvent.commentId,
        text: dmText,
        env,
        fetchFn,
      });

      if (lastResult.success) {
        // Success: update status in D1 and increment sent counter
        await updateCommentStatus(env.DB, commentEvent.commentId, {
          status: "sent",
          messageId: lastResult.messageId,
        });

        await incrementRuleStats(env.DB, rule.id, "sent");

        logger.info(
          {
            commentId: commentEvent.commentId,
            messageId: lastResult.messageId,
            attempts,
            to: commentEvent.commenterUsername,
          },
          "Instagram private reply sent successfully"
        );

        return { status: "sent", messageId: lastResult.messageId };
      }

      // If permanent error or auth failure, do not retry
      if (lastResult.errorType === "permanent" || lastResult.errorType === "auth") {
        break;
      }

      // If transient error and another attempt remains, wait briefly
      if (i < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Retries exhausted or permanent failure: mark as failed in D1
    const errorMessage = lastResult?.error || "Send DM failed";
    await updateCommentStatus(env.DB, commentEvent.commentId, {
      status: "failed",
      errorMessage,
      skipReason: lastResult?.errorCode || "SEND_FAILED",
    });

    await incrementRuleStats(env.DB, rule.id, "failed");

    logger.error(
      {
        commentId: commentEvent.commentId,
        attempts,
        errorCode: lastResult?.errorCode,
        errorMessage,
      },
      "Instagram private reply delivery failed permanently"
    );

    return { status: "failed", error: errorMessage };
  } catch (err: any) {
    // Fail-safe catch to ensure Worker never crashes
    logger.error({ err: err?.message, commentId: commentEvent.commentId }, "Unexpected error in dispatchCommentReply");
    return { status: "failed", error: err?.message || "Unexpected worker error" };
  }
}
