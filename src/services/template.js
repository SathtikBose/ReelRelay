const MAX_TEMPLATE_LENGTH = 800;

/**
 * Strips non-printable ASCII/Unicode control characters, preserving newlines and tabs
 * @param {string} text
 * @returns {string}
 */
function sanitizeControlChars(text) {
  if (typeof text !== "string") return "";
  // Keep \r (13), \n (10), \t (9), strip other control chars 0-31 and 127
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Renders a DM template with variables {{link}}, {{username}}, {{keyword}}
 * @param {string} template
 * @param {{ link?: string, username?: string, keyword?: string }} context
 * @returns {string} Sanitized plain text output capped at 800 characters
 */
function render(template, context = {}) {
  if (typeof template !== "string") {
    return "";
  }

  const link = context.link || "";
  const rawAuthor = context.author || context.username;
  const username = rawAuthor ? rawAuthor.replace(/^@/, "") : "there";
  const keyword = context.keyword || "";

  let output = template
    .replace(/\{\{\s*link\s*\}\}/gi, link)
    .replace(/\{\{\s*(?:username|author)\s*\}\}/gi, username)
    .replace(/\{\{\s*keyword\s*\}\}/gi, keyword);

  output = sanitizeControlChars(output);

  if (output.length > MAX_TEMPLATE_LENGTH) {
    output = output.slice(0, MAX_TEMPLATE_LENGTH);
  }

  return output;
}

module.exports = {
  render,
  sanitizeControlChars,
  MAX_TEMPLATE_LENGTH,
};
