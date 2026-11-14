import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { renderNotificationEmail } = await import("./email");

const base = {
  firstName: "Asha",
  title: "Welcome to Gold",
  body: "You've reached Gold.",
  link: "/account",
  siteUrl: "https://shop.example",
};

describe("renderNotificationEmail", () => {
  it("builds subject, text and an absolute same-origin link", () => {
    const email = renderNotificationEmail(base);
    expect(email.subject).toBe("Welcome to Gold");
    expect(email.text).toContain("Hi Asha,");
    expect(email.text).toContain("https://shop.example/account");
    expect(email.html).toContain('href="https://shop.example/account"');
  });

  it("escapes every interpolated value in the HTML part", () => {
    const email = renderNotificationEmail({
      ...base,
      firstName: '<img src=x onerror="alert(1)">',
      title: "<script>alert(1)</script>",
      body: 'Tom & "Jerry"',
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Tom &amp; &quot;Jerry&quot;");
  });

  it("falls back to a neutral greeting and the site root", () => {
    const email = renderNotificationEmail({ ...base, firstName: null, link: null });
    expect(email.text.startsWith("Hi,")).toBe(true);
    expect(email.html).toContain('href="https://shop.example"');
  });
});
