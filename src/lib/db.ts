/**
 * Data Access Layer for Cloudflare D1 (SQLite at the edge)
 */

export type KeywordRule = {
  id: number;
  media_id: string;
  keyword: string;
  match_mode: "word" | "exact" | "contains";
  dm_message: string;
  link: string;
  active: number;
  caption: string;
  thumbnail_url: string;
  permalink: string;
  matched_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
};

export type ProcessedComment = {
  id: number;
  comment_id: string;
  media_id: string;
  commenter_id: string;
  commenter_username: string;
  comment_text: string;
  matched_keyword: string | null;
  status: "processing" | "sent" | "failed" | "skipped";
  skip_reason: string | null;
  attempts: number;
  error_message: string | null;
  message_id: string | null;
  created_at: string;
  processed_at: string | null;
};

export type CreateKeywordInput = {
  mediaId: string;
  keyword: string;
  matchMode?: "word" | "exact" | "contains";
  dmMessage?: string;
  link: string;
  active?: boolean;
  caption?: string;
  thumbnailUrl?: string;
  permalink?: string;
};

export type UpdateKeywordInput = Partial<CreateKeywordInput>;

/**
 * Creates a new keyword rule in D1.
 */
export async function createKeywordRule(
  db: D1Database,
  input: CreateKeywordInput
): Promise<KeywordRule> {
  const result = await db
    .prepare(
      `INSERT INTO keywords (
        media_id, keyword, match_mode, dm_message, link, active, caption, thumbnail_url, permalink, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      RETURNING *`
    )
    .bind(
      input.mediaId.trim(),
      input.keyword.trim().toLowerCase(),
      input.matchMode || "word",
      input.dmMessage || "Hey {{username}}! 👋 Here's the link you asked for:\n{{link}}",
      input.link.trim(),
      input.active === false ? 0 : 1,
      input.caption || "",
      input.thumbnailUrl || "",
      input.permalink || ""
    )
    .first<KeywordRule>();

  if (!result) {
    throw new Error("Failed to insert keyword rule into D1");
  }

  return result;
}

/**
 * Retrieves all keyword rules.
 */
export async function getKeywordRules(db: D1Database): Promise<KeywordRule[]> {
  const { results } = await db
    .prepare("SELECT * FROM keywords ORDER BY id DESC")
    .all<KeywordRule>();
  return results || [];
}

/**
 * Finds a rule by internal ID.
 */
export async function getKeywordRuleById(
  db: D1Database,
  id: number
): Promise<KeywordRule | null> {
  return db
    .prepare("SELECT * FROM keywords WHERE id = ?")
    .bind(id)
    .first<KeywordRule>();
}

/**
 * Finds active rule for an Instagram Reel media ID.
 */
export async function getKeywordRuleByMediaId(
  db: D1Database,
  mediaId: string
): Promise<KeywordRule | null> {
  return db
    .prepare("SELECT * FROM keywords WHERE media_id = ? ORDER BY id DESC LIMIT 1")
    .bind(mediaId.trim())
    .first<KeywordRule>();
}

/**
 * Updates an existing keyword rule.
 */
export async function updateKeywordRule(
  db: D1Database,
  id: number,
  input: UpdateKeywordInput
): Promise<KeywordRule | null> {
  const existing = await getKeywordRuleById(db, id);
  if (!existing) return null;

  const mediaId = input.mediaId !== undefined ? input.mediaId.trim() : existing.media_id;
  const keyword =
    input.keyword !== undefined ? input.keyword.trim().toLowerCase() : existing.keyword;
  const matchMode = input.matchMode || existing.match_mode;
  const dmMessage = input.dmMessage !== undefined ? input.dmMessage : existing.dm_message;
  const link = input.link !== undefined ? input.link.trim() : existing.link;
  const active =
    input.active !== undefined ? (input.active ? 1 : 0) : existing.active;
  const caption = input.caption !== undefined ? input.caption : existing.caption;
  const thumbnailUrl =
    input.thumbnailUrl !== undefined ? input.thumbnailUrl : existing.thumbnail_url;
  const permalink = input.permalink !== undefined ? input.permalink : existing.permalink;

  const result = await db
    .prepare(
      `UPDATE keywords SET
        media_id = ?, keyword = ?, match_mode = ?, dm_message = ?, link = ?,
        active = ?, caption = ?, thumbnail_url = ?, permalink = ?, updated_at = datetime('now')
      WHERE id = ?
      RETURNING *`
    )
    .bind(
      mediaId,
      keyword,
      matchMode,
      dmMessage,
      link,
      active,
      caption,
      thumbnailUrl,
      permalink,
      id
    )
    .first<KeywordRule>();

  return result;
}

/**
 * Toggles a keyword rule active/paused status.
 */
export async function toggleKeywordRule(
  db: D1Database,
  id: number
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE keywords SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?"
    )
    .bind(id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/**
 * Deletes a keyword rule.
 */
export async function deleteKeywordRule(
  db: D1Database,
  id: number
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM keywords WHERE id = ?")
    .bind(id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/**
 * Increments matched, sent, or failed counters on a rule.
 */
export async function incrementRuleStats(
  db: D1Database,
  id: number,
  stat: "matched" | "sent" | "failed"
): Promise<void> {
  const column = `${stat}_count`;
  await db
    .prepare(`UPDATE keywords SET ${column} = ${column} + 1 WHERE id = ?`)
    .bind(id)
    .run();
}

/**
 * Attempts to claim a comment event atomically for processing.
 * Returns true if newly claimed. Returns false if duplicate (already exists in D1).
 */
export async function claimCommentForProcessing(
  db: D1Database,
  event: {
    commentId: string;
    mediaId: string;
    commenterId: string;
    commenterUsername: string;
    text: string;
    matchedKeyword?: string;
  }
): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO processed_comments (
        comment_id, media_id, commenter_id, commenter_username, comment_text, matched_keyword, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'processing', datetime('now'))`
    )
    .bind(
      event.commentId,
      event.mediaId,
      event.commenterId,
      event.commenterUsername,
      event.text.slice(0, 300),
      event.matchedKeyword || null
    )
    .run();

  return (res.meta.changes ?? 0) > 0;
}

/**
 * Checks if a commenter has already been sent a DM for this reel (per-user-per-reel deduplication).
 */
export async function hasUserReceivedDmForReel(
  db: D1Database,
  mediaId: string,
  commenterId: string,
  excludeCommentId?: string
): Promise<boolean> {
  if (!commenterId) return false;

  let query =
    "SELECT id FROM processed_comments WHERE media_id = ? AND commenter_id = ? AND status = 'sent'";
  const binds: string[] = [mediaId, commenterId];

  if (excludeCommentId) {
    query += " AND comment_id != ?";
    binds.push(excludeCommentId);
  }

  query += " LIMIT 1";

  const row = await db.prepare(query).bind(...binds).first();
  return row !== null;
}

/**
 * Updates comment delivery status, error message, or skip reason.
 */
export async function updateCommentStatus(
  db: D1Database,
  commentId: string,
  update: {
    status: "processing" | "sent" | "failed" | "skipped";
    skipReason?: string | null;
    messageId?: string | null;
    errorMessage?: string | null;
    matchedKeyword?: string | null;
  }
): Promise<void> {
  await db
    .prepare(
      `UPDATE processed_comments SET
        status = ?,
        skip_reason = COALESCE(?, skip_reason),
        message_id = COALESCE(?, message_id),
        error_message = COALESCE(?, error_message),
        matched_keyword = COALESCE(?, matched_keyword),
        processed_at = datetime('now')
      WHERE comment_id = ?`
    )
    .bind(
      update.status,
      update.skipReason || null,
      update.messageId || null,
      update.errorMessage ? update.errorMessage.slice(0, 500) : null,
      update.matchedKeyword || null,
      commentId
    )
    .run();
}

/**
 * Retrieves paginated processed comments log with optional status filter.
 */
export async function getProcessedComments(
  db: D1Database,
  limit = 25,
  offset = 0,
  statusFilter?: string
): Promise<{ items: ProcessedComment[]; total: number }> {
  let countQuery = "SELECT COUNT(*) as count FROM processed_comments";
  let dataQuery = "SELECT * FROM processed_comments";
  const binds: string[] = [];

  if (statusFilter && statusFilter !== "all") {
    countQuery += " WHERE status = ?";
    dataQuery += " WHERE status = ?";
    binds.push(statusFilter);
  }

  dataQuery += " ORDER BY id DESC LIMIT ? OFFSET ?";

  const totalRow = await db
    .prepare(countQuery)
    .bind(...binds)
    .first<{ count: number }>();

  const total = totalRow?.count || 0;

  const { results } = await db
    .prepare(dataQuery)
    .bind(...binds, limit, offset)
    .all<ProcessedComment>();

  return { items: results || [], total };
}

/**
 * Auto-cleanup function to purge old comments and event logs.
 */
export async function cleanupOldRecords(
  db: D1Database,
  daysToKeep = 60
): Promise<{ commentsDeleted: number; eventsDeleted: number }> {
  const commentsRes = await db
    .prepare(
      `DELETE FROM processed_comments WHERE created_at < datetime('now', '-' || ? || ' days')`
    )
    .bind(daysToKeep)
    .run();

  const eventsRes = await db
    .prepare(
      `DELETE FROM events_log WHERE created_at < datetime('now', '-' || ? || ' days')`
    )
    .bind(daysToKeep)
    .run();

  return {
    commentsDeleted: commentsRes.meta.changes ?? 0,
    eventsDeleted: eventsRes.meta.changes ?? 0,
  };
}

/**
 * Records an audit event in the events_log table.
 */
export async function logEvent(
  db: D1Database,
  eventType: string,
  payload?: unknown
): Promise<void> {
  const json = payload ? JSON.stringify(payload) : null;
  await db
    .prepare(
      "INSERT INTO events_log (event_type, payload, created_at) VALUES (?, ?, datetime('now'))"
    )
    .bind(eventType, json)
    .run();
}
