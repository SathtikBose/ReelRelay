/**
 * Unicode NFKC normalization, lowercase, and whitespace trim.
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text || typeof text !== "string") {
    return "";
  }
  return text.normalize("NFKC").toLowerCase().trim();
}

/**
 * Strips non-alphanumeric punctuation/emojis for clean exact-match comparison.
 */
export function cleanForExactMatch(text: string | null | undefined): string {
  const normalized = normalizeText(text);
  return normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses raw comma-separated or array keywords into a clean array of unique lowercase keywords.
 */
export function parseKeywordList(input: string | string[]): string[] {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(input.map((k) => normalizeText(k)).filter(Boolean))
    );
  }
  if (typeof input === "string") {
    return Array.from(
      new Set(
        input
          .split(/[,\n]+/)
          .map((k) => normalizeText(k))
          .filter(Boolean)
      )
    );
  }
  return [];
}

/**
 * Checks if comment text matches any of the rule's keywords according to matchMode.
 * @param commentText Raw comment text from Instagram
 * @param keywords Input keywords (comma-separated string or array)
 * @param matchMode "word" | "exact" | "contains"
 * @returns The matched keyword if found, or null
 */
export function matchComment(
  commentText: string,
  keywords: string | string[],
  matchMode: "word" | "exact" | "contains" = "word"
): string | null {
  if (!commentText) {
    return null;
  }

  const keywordList = parseKeywordList(keywords);
  if (keywordList.length === 0) {
    return null;
  }

  const normalizedComment = normalizeText(commentText);
  if (!normalizedComment) {
    return null;
  }

  const cleanedComment = cleanForExactMatch(commentText);

  for (const keyword of keywordList) {
    if (!keyword) continue;

    if (matchMode === "exact") {
      // Exact mode: Entire comment text matches the keyword (ignoring external punctuation/emojis)
      if (cleanedComment === cleanForExactMatch(keyword)) {
        return keyword;
      }
    } else if (matchMode === "contains") {
      // Contains mode: Keyword appears as substring anywhere in normalized comment
      if (normalizedComment.includes(keyword)) {
        return keyword;
      }
    } else {
      // Default: "word" mode (matches whole word using Unicode boundary)
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wordRegex = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "u");
      if (wordRegex.test(normalizedComment)) {
        return keyword;
      }
    }
  }

  return null;
}
