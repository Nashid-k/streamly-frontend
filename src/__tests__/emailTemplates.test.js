import { describe, expect, it } from "vitest";
import { escapeHtml, verificationEmail, welcomeEmail } from "../../server/templates.js";

const LINK = "https://streamly.example/verify-email?token=abc.def.ghi";

/**
 * Mail clients are not browsers. These assertions are the whole point of the
 * templates: a stylesheet, a flex layout or a webfont silently degrades to an
 * unreadable message in Gmail/Outlook rather than throwing.
 */
function expectEmailSafeHtml(html) {
  expect(html).not.toMatch(/<style/i);
  expect(html).not.toMatch(/<link/i);
  expect(html).not.toMatch(/@import/i);
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/display:\s*flex/i);
  expect(html).not.toMatch(/display:\s*grid/i);
  expect(html).not.toMatch(/https?:\/\/fonts\./i);
  expect(html).not.toMatch(/<img/i);
  expect(html).not.toMatch(/background-image/i);
  // Dark-mode hint so the card isn't white-on-white in a light client.
  expect(html).toMatch(/color-scheme/i);
  // An optional template slot left undefined interpolates to the literal
  // string "undefined" in the recipient's inbox — assert it can never happen.
  expect(html).not.toMatch(/undefined/);
  expect(html).not.toMatch(/\[object Object\]/);
  expect(html).not.toMatch(/\[object/);
}

describe("escapeHtml", () => {
  it("neutralises every character that can break out of markup", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escapeHtml("it's")).toBe("it&#39;s");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("handles null/undefined/numbers without throwing", () => {
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(0)).toBe("0");
  });
});

describe("verification email", () => {
  const mail = verificationEmail({ name: "Nashid", verifyUrl: LINK });

  it("produces an email-client-safe html part", () => {
    expectEmailSafeHtml(mail.html);
  });

  it("always ships a plaintext alternative", () => {
    expect(mail.text).toContain(LINK);
    expect(mail.text).not.toContain("<");
  });

  it("carries the verify link in both the button and the fallback", () => {
    expect(mail.html).toContain(`href="${LINK}"`);
    // The Outlook VML roundrect and the <a> fallback both need the href.
    expect(mail.html.match(/verify-email\?token=abc\.def\.ghi/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("states the 24-hour window and that nothing exists yet", () => {
    expect(mail.text).toMatch(/24 hours/);
    expect(mail.text).toMatch(/created at the moment you click/i);
  });

  it("personalises the greeting and escapes the name", () => {
    expect(verificationEmail({ name: "Nashid", verifyUrl: LINK }).text).toMatch(/^Hi Nashid,/);
    expect(verificationEmail({ verifyUrl: LINK }).text).toMatch(/^Hi there,/);
    const evil = verificationEmail({ name: "<b>bold</b>", verifyUrl: LINK });
    expect(evil.html).not.toContain("<b>bold</b>");
    expect(evil.html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("refuses a non-http(s) verify url", () => {
    const evil = verificationEmail({ name: "x", verifyUrl: "javascript:alert(1)" });
    expect(evil.html).not.toContain("javascript:alert(1)");
    expect(evil.html).toContain('href="#"');
  });

  it("falls back gracefully for an unparseable url", () => {
    const broken = verificationEmail({ name: "x", verifyUrl: "not a url" });
    expect(broken.html).toContain('href="#"');
    expect(broken.subject).toMatch(/Verify your/);
  });

  it("has a subject naming the product", () => {
    expect(mail.subject).toBe("Verify your Streamly email address");
    expect(verificationEmail({ verifyUrl: LINK, siteName: "Zxc" }).subject).toBe("Verify your Zxc email address");
  });
});

describe("welcome email", () => {
  const mail = welcomeEmail({ name: "Nashid", siteUrl: "https://streamly.example" });

  it("produces an email-client-safe html part", () => {
    expectEmailSafeHtml(mail.html);
  });

  it("has a plaintext alternative with the site link", () => {
    expect(mail.text).toContain("https://streamly.example");
  });

  it("only goes out after the account exists", () => {
    expect(mail.text).toMatch(/account is ready/i);
  });

  it("escapes the name and keeps the public-collection reassurance", () => {
    const evil = welcomeEmail({ name: "<img src=x>", siteUrl: "https://streamly.example" });
    expect(evil.html).not.toContain("<img src=x>");
    expect(mail.text).toMatch(/never expose your name or email/);
  });

  it("falls back to # for a javascript: site url", () => {
    expect(welcomeEmail({ name: "x", siteUrl: "javascript:alert(1)" }).html).toContain('href="#"');
  });
});
