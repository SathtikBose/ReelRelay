/**
 * Extracts an 11-character YouTube video ID from various URL formats or raw ID string.
 * Supported formats:
 * - https://www.youtube.com/watch?v=dQw4w9WgXcQ
 * - https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share
 * - https://youtu.be/dQw4w9WgXcQ?t=10
 * - https://www.youtube.com/shorts/dQw4w9WgXcQ
 * - https://youtube.com/shorts/dQw4w9WgXcQ?feature=share
 * - https://www.youtube.com/embed/dQw4w9WgXcQ
 * - https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ
 * - dQw4w9WgXcQ (raw 11-char alphanumeric/dash/underscore ID)
 *
 * @param {string} input - YouTube URL or video ID
 * @returns {string|null} 11-character video ID, or null if invalid
 */
function parseYouTubeVideoId(input) {
  if (!input || typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // 1. Check if raw 11-char ID
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. Try parsing as URL
  try {
    const parsed = new URL(trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");

    // Case A: youtu.be/<id>
    if (hostname === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0].split("?")[0];
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) {
        return id;
      }
    }

    // Case B: youtube.com or youtube-nocookie.com
    if (hostname === "youtube.com" || hostname === "youtube-nocookie.com") {
      // /watch?v=<id>
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
          return id;
        }
      }

      // /shorts/<id>
      if (parsed.pathname.startsWith("/shorts/")) {
        const parts = parsed.pathname.split("/");
        const id = parts[2];
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
          return id;
        }
      }

      // /embed/<id>
      if (parsed.pathname.startsWith("/embed/")) {
        const parts = parsed.pathname.split("/");
        const id = parts[2];
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
          return id;
        }
      }

      // /v/<id>
      if (parsed.pathname.startsWith("/v/")) {
        const parts = parsed.pathname.split("/");
        const id = parts[2];
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
          return id;
        }
      }
    }
  } catch {
    // URL constructor failed, fall back to regex
  }

  // 3. Fallback regex patterns
  const patterns = [
    /(?:v=|v\/|embed\/|shorts\/|youtu\.be\/|\/v=|^)([A-Za-z0-9_-]{11})(?:[&?]|$|\/)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1] && /^[A-Za-z0-9_-]{11}$/.test(match[1])) {
      return match[1];
    }
  }

  return null;
}

module.exports = {
  parseYouTubeVideoId,
};
