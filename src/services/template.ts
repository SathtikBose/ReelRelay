const MAX_TEMPLATE_LENGTH = 800;

/**
 * Strips non-printable control characters while preserving newlines and carriage returns.
 */
export function sanitizeControlChars(text: string): string {
  if (typeof text !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Renders DM template with variables {{link}}, {{username}}, {{keyword}}.
 * Sanitizes and caps at 800 characters per Meta Instagram DM specifications.
 */
export function renderTemplate(
  template: string | null | undefined,
  context: { link?: string; username?: string; keyword?: string } = {}
): string {
  const tpl = template || "Hey {{username}}! 👋 Here's the link you asked for:\n{{link}}";

  const link = context.link || "";
  const rawAuthor = context.username || "there";
  const username = rawAuthor.replace(/^@/, "").trim() || "there";
  const keyword = context.keyword || "";

  let output = tpl
    .replace(/\{\{\s*link\s*\}\}/gi, link)
    .replace(/\{\{\s*(?:username|author)\s*\}\}/gi, username)
    .replace(/\{\{\s*keyword\s*\}\}/gi, keyword);

  output = sanitizeControlChars(output);

  if (output.length > MAX_TEMPLATE_LENGTH) {
    output = output.slice(0, MAX_TEMPLATE_LENGTH);
  }

  return output;
}
