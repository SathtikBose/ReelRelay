/**
 * Cleans text: Unicode NFKC normalization, lowercase, trim.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  if (!text || typeof text !== "string") {
    return "";
  }
  return text.normalize("NFKC").toLowerCase().trim();
}

/**
 * Strips surrounding and trailing punctuation/emoji noise for exact comparison.
 * Keeps standard alphanumeric characters and internal single spaces.
 * @param {string} text
 * @returns {string}
 */
function cleanForExactMatch(text) {
  const normalized = normalizeText(text);
  // Strip emojis, punctuation, symbols from the edges/entire string
  // Remove non-word and non-space characters
  return normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks if comment text matches any of the rule's keywords according to matchMode
 * @param {string} commentText
 * @param {string[]} keywords Array of lowercase keywords
 * @param {"word" | "exact" | "contains"} [matchMode="word"]
 * @returns {string | null} The matched keyword, or null if no match
 */
function matchComment(commentText, keywords, matchMode = "word") {
  if (!commentText || !Array.isArray(keywords) || keywords.length === 0) {
    return null;
  }

  const normalizedComment = normalizeText(commentText);
  if (!normalizedComment) {
    return null;
  }

  const cleanedForExact = cleanForExactMatch(commentText);

  for (const rawKw of keywords) {
    const keyword = normalizeText(rawKw);
    if (!keyword) continue;

    if (matchMode === "exact") {
      // Exact mode: normalized comment text without punctuation must equal keyword
      if (cleanedForExact === cleanForExactMatch(keyword)) {
        return keyword;
      }
    } else if (matchMode === "contains") {
      // Contains mode: keyword is a substring anywhere in the normalized comment
      if (normalizedComment.includes(keyword)) {
        return keyword;
      }
    } else {
      // Default: word mode (whole word match)
      // Escape special regex characters in keyword
      const escapedKw = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Use Unicode-aware word boundary regex
      // eslint-disable-next-line security/detect-non-literal-regexp
      const wordRegex = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapedKw}(?:$|[^\\p{L}\\p{N}])`, "u");

      if (wordRegex.test(normalizedComment)) {
        return keyword;
      }
    }
  }

  return null;
}

module.exports = {
  normalizeText,
  cleanForExactMatch,
  matchComment,
};
