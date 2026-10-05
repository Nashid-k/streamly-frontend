// server/templates.js — HTML/plaintext email templates.
//
// Email clients are not browsers: no flexbox/grid, no external stylesheets, no
// webfonts, no background images on <body>. Everything is inline CSS on
// table-based markup, which is the only layout Gmail's webmail client and
// Outlook's Word renderer agree on. The accent colour mirrors
// src/styles/tokens.css (--accent-primary #95ff50 on a near-black surface) so
// the message reads as part of the product.
//
// Every interpolated value passes through escapeHtml(). A display name is
// attacker-controlled, and an unescaped `<` in a name is a straightforward
// way to inject markup into a mail client that is far more trusting than ours.

const ACCENT = '#95ff50';
const ACCENT_DARK = '#5ce21c';
const SURFACE = '#0d0d10';
const CARD = '#17171c';
const BORDER = '#2a2a32';
const TEXT = '#f2f2f5';
const MUTED = '#9a9aa6';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for interpolation into HTML text or an attribute. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Escape for a URL, then only allow http(s). Guards against a `javascript:`
 * link if a site URL is ever misconfigured. Returns both the href and a safe
 * label for the visible fallback link, so an unsafe URL never appears as text
 * either.
 */
function safeUrl(raw, fallback) {
  try {
    const parsed = new URL(String(raw));
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { href: fallback, display: fallback };
    return { href: escapeHtml(parsed.toString()), display: escapeHtml(parsed.toString()) };
  } catch {
    return { href: fallback, display: fallback };
  }
}

/** Bulletproof button: VML roundrect for Outlook, padded <a> everywhere else. */
function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="${ACCENT}" style="border-radius:8px;mso-padding-alt:14px 28px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="12%" stroke="f" fillcolor="${ACCENT}">
        <w:anchorlock/>
        <center style="color:#0d0d10;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;">${escapeHtml(label)}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:20px;color:#0d0d10;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

function paragraph(text) {
  return `<p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:${TEXT};">${text}</p>`;
}

function shell({ preheader, accentBlock = '', body, footerNote }) {
  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Streamly</title>
</head>
<body style="margin:0;padding:0;background-color:${SURFACE};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:${CARD};border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
        <tr>
          <td style="height:4px;line-height:4px;font-size:0;background:${ACCENT};">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px 28px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;letter-spacing:-0.4px;color:${TEXT};">STREAMLY</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 28px 28px;">
            ${body}
          </td>
        </tr>
        ${accentBlock}
        <tr>
          <td style="padding:20px 28px 28px 28px;border-top:1px solid ${BORDER};">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:${MUTED};">
              ${footerNote}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

const FOOTER_STANDARD = `You are receiving this because someone signed up for Streamly with this address. If that was not you, no action is needed — nothing was created and the link expires on its own.`;

function footerWithSupport() {
  return `Need help? Just reply to this email. &copy; Streamly`;
}

/**
 * @param {{ name?: string, verifyUrl: string, siteName?: string }} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function verificationEmail({ name, verifyUrl, siteName = 'Streamly' }) {
  const { href: url, display: urlDisplay } = safeUrl(verifyUrl, '#');
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi there,';
  const urlText = String(verifyUrl ?? '');

  const html = shell({
    preheader: `Confirm your email address to finish setting up your ${siteName} account.`,
    body: [
      `<p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;letter-spacing:-0.6px;line-height:32px;color:${TEXT};">Confirm your email</p>`,
      paragraph(greeting),
      paragraph(
        `One last step and your ${escapeHtml(siteName)} account is live. Verify this address to unlock your watchlist, collections and watch history across every device.`
      ),
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td>${button(url, 'Verify my email')}</td></tr></table>`,
      `<p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:${MUTED};">Button not working? Paste this link into your browser:</p>`,
      `<p style="margin:0 0 24px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;word-break:break-all;"><a href="${url}" target="_blank" style="color:${ACCENT};text-decoration:underline;">${urlDisplay}</a></p>`,
      `<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:${MUTED};">This link works once and expires in 24 hours. Your account is created at the moment you click it — not before.</p>`,
    ].join('\n'),
    footerNote: FOOTER_STANDARD,
  });

  const text = [
    greeting,
    '',
    `One last step and your ${siteName} account is live. Verify this address to unlock your watchlist, collections and watch history across every device.`,
    '',
    `Verify your email: ${urlText}`,
    '',
    'This link works once and expires in 24 hours. Your account is created at the moment you click it — not before.',
    '',
    footerWithSupport(),
  ].join('\n');

  return { subject: `Verify your ${siteName} email address`, html, text };
}

/**
 * Sent only after the account row exists — i.e. proof the signup completed.
 * @returns {{ subject: string, html: string, text: string }}
 */
export function welcomeEmail({ name, siteUrl, siteName = 'Streamly' }) {
  const { href: url } = safeUrl(siteUrl, '#');
  const greeting = name ? `Welcome, ${escapeHtml(name)}.` : 'Welcome to Streamly.';

  const html = shell({
    preheader: `Your ${siteName} account is ready. Here's what's next.`,
    body: [
      `<p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;letter-spacing:-0.6px;line-height:32px;color:${TEXT};">You're in</p>`,
      paragraph(escapeHtml(greeting)),
      paragraph(
        `Your email is confirmed and your account is ready. Anything you add to your watchlist or collections now syncs to your account and follows you to every device you sign in on.`
      ),
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td>${button(url, 'Start watching')}</td></tr></table>`,
    ].join('\n'),
    accentBlock: `<tr>
      <td style="padding:0 28px 24px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:3px solid ${ACCENT};background:rgba(149,255,80,0.06);border-radius:0 8px 8px 0;">
          <tr><td style="padding:14px 16px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:${TEXT};"><strong>Tip:</strong> collections can be published to Explore. Open any collection and flip it to public — public collections never expose your name or email.</p>
          </td></tr>
        </table>
      </td>
    </tr>`,
    footerNote: `This is a one-time confirmation for your ${escapeHtml(siteName)} account.`,
  });

  const text = [
    greeting,
    '',
    'Your email is confirmed and your account is ready. Anything you add to your watchlist or collections now syncs to your account and follows you to every device you sign in on.',
    '',
    `Start watching: ${siteUrl ?? ''}`,
    '',
    'Tip: collections can be published to Explore. Public collections never expose your name or email.',
  ].join('\n');

  return { subject: `Welcome to ${siteName}`, html, text };
}
