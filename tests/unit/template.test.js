const { render, sanitizeControlChars, MAX_TEMPLATE_LENGTH } = require("../../src/services/template");

describe("DM Template Service", () => {
  const defaultTemplate = "Hey {{username}}! 👋 Here's the link you asked for:\n{{link}}";

  it("replaces {{link}}, {{username}}, and {{keyword}} variables", () => {
    const rendered = render(defaultTemplate, {
      link: "https://example.com/guide",
      username: "johndoe",
      keyword: "link",
    });

    expect(rendered).toBe("Hey johndoe! 👋 Here's the link you asked for:\nhttps://example.com/guide");
  });

  it("strips leading @ from username if passed", () => {
    const rendered = render("Hello @{{username}} or {{username}}", {
      username: "@janedoe",
    });

    expect(rendered).toBe("Hello @janedoe or janedoe");
  });

  it("defaults username to 'there' when omitted or empty", () => {
    const rendered = render("Hey {{username}}! Check {{link}}", {
      link: "https://example.com",
    });

    expect(rendered).toBe("Hey there! Check https://example.com");
  });

  it("strips harmful control characters while preserving newlines and tabs", () => {
    const inputWithControl = "Line 1\nLine 2\tTabbed\x00\x08\x1F\x7F";
    const cleaned = sanitizeControlChars(inputWithControl);

    expect(cleaned).toBe("Line 1\nLine 2\tTabbed");
  });

  it("caps rendered output at MAX_TEMPLATE_LENGTH (800 chars)", () => {
    const longLink = "https://example.com/" + "a".repeat(1000);
    const rendered = render("Link: {{link}}", { link: longLink });

    expect(rendered.length).toBe(MAX_TEMPLATE_LENGTH);
    expect(rendered.startsWith("Link: https://example.com/")).toBe(true);
  });

  it("returns empty string when template is not a string", () => {
    expect(render(null)).toBe("");
    expect(render(undefined)).toBe("");
    expect(render(12345)).toBe("");
  });
});
