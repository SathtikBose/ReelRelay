const path = require("path");
const ejs = require("ejs");

describe("EJS XSS Escaping Unit Tests", () => {
  const viewsDir = path.join(__dirname, "../../src/views");

  it("escapes malicious scripts in captions and titles in reels/index.ejs", async () => {
    const maliciousRule = {
      _id: "60c72b2f9b1d8b2badbee123",
      mediaId: "1799999999",
      captionSnippet: "<script>alert('xss')</script>",
      keywords: ["<img src=x onerror=alert(1)>", "safe"],
      matchMode: "word",
      link: "https://example.com/safe",
      isActive: true,
      stats: { matched: 0, sent: 0, failed: 0 },
    };

    const rendered = await ejs.renderFile(
      path.join(viewsDir, "reels/index.ejs"),
      {
        reels: [maliciousRule],
        csrfToken: "token123",
        title: "Test Title",
        activeNav: "reels",
        isAdmin: true,
        flash: null,
      },
      { views: [viewsDir] }
    );

    // Verify raw malicious tags are escaped and not rendered executable
    expect(rendered).not.toContain("<script>alert('xss')</script>");
    expect(rendered).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    expect(rendered).not.toContain("<img src=x onerror=alert(1)>");
    expect(rendered).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("escapes malicious scripts in form fields in reels/form.ejs", async () => {
    const maliciousRule = {
      mediaId: "1799999999",
      captionSnippet: '"><script>alert(1)</script>',
      keywords: ["test"],
      matchMode: "word",
      link: "https://example.com",
      template: "<script>bad()</script>",
      isActive: true,
    };

    const rendered = await ejs.renderFile(
      path.join(viewsDir, "reels/form.ejs"),
      {
        isEdit: false,
        rule: maliciousRule,
        errors: {},
        csrfToken: "token123",
        title: "New Rule",
        activeNav: "reels",
        isAdmin: true,
        flash: null,
      },
      { views: [viewsDir] }
    );

    expect(rendered).not.toContain('"><script>alert(1)</script>');
    expect(rendered).toContain('&#34;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
