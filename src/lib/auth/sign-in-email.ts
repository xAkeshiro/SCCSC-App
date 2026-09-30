/**
 * The sign-in code email, in the sccsc.org look: the red 心 mark and lowercase "mileage tracker"
 * wordmark, a white card with a red top edge, the red-heart eyebrow, and the code on the pink tint.
 *
 * Built for email clients: tables and inline styles only, web fonts with Arial fallbacks, no images
 * (so nothing depends on the demo site being public), and a plain-text version.
 */
import { CODE_TTL_MINUTES } from "./codes";

const RED = "#D0112B";
const INK = "#1D1D1D";
const CHARCOAL = "#333333";
const MUTED = "#6B6B6B";
const TINT = "#FDECEE";
const TINT_BORDER = "#F3C4CB";
const SURFACE = "#F7F7F7";
const LINE = "#E6E6E6";

const HEADING_FONT = "'Onest', Arial, Helvetica, sans-serif";
const BODY_FONT = "'Instrument Sans', Arial, Helvetica, sans-serif";
const SERIF_FONT = "'EB Garamond', Georgia, 'Times New Roman', serif";
const CODE_FONT = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type SignInEmail = { subject: string; html: string; text: string };

export function signInCodeEmail({
  code,
  fullName,
  contactMasked,
  demo,
}: {
  code: string;
  /** The name typed on the sign-in page. */
  fullName?: string;
  /** The email or number typed, masked, e.g. "fe•••@example.org" or "(•••) •••-0108". */
  contactMasked: string;
  /** Demo: every code goes to one inbox. */
  demo: boolean;
}): SignInEmail {
  const first = fullName?.trim().split(/\s+/)[0];
  const who = fullName?.trim() ? `${fullName.trim()}, ${contactMasked}` : contactMasked;
  const subject = `${code} is your SCCSC sign-in code`;
  const preheader = `Use ${code} to sign in to the mileage tracker. It works for ${CODE_TTL_MINUTES} minutes.`;

  const text = [
    `${first ? `Hi ${first},` : "Hi,"}`,
    "",
    `Your SCCSC mileage tracker sign-in code is: ${code}`,
    `It works for ${CODE_TTL_MINUTES} minutes.`,
    "",
    `Signing in as: ${who}`,
    "",
    "Didn't try to sign in? You can ignore this email.",
    demo ? "\nDemo with fake data: every sign-in code for the demo comes to this inbox." : "",
    "",
    "Sacramento Chinese Community Service Center · Staff tools",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond&family=Instrument+Sans:wght@400;600&family=Onest:wght@600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${SURFACE};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

        <!-- Logo: the 心 mark and the lowercase wordmark -->
        <tr>
          <td style="padding:0 4px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="40" height="40" align="center" valign="middle" style="width:40px;height:40px;background:${RED};border-radius:6px;color:#ffffff;font-family:'Kaiti SC','STKaiti','KaiTi','Songti SC','SimSun',serif;font-size:26px;line-height:40px;">&#24515;</td>
                <td style="padding-left:12px;font-family:${SERIF_FONT};line-height:1;">
                  <span style="font-size:19px;color:${CHARCOAL};">mileage</span>
                  <span style="font-size:28px;color:${RED};">tracker</span><br>
                  <span style="font-size:11px;color:${MUTED};line-height:1.6;">sacramento chinese community service center</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#ffffff;border:1px solid ${LINE};border-top:4px solid ${RED};border-radius:12px;padding:40px 40px 36px;">
            <p style="margin:0 0 16px;font-family:${HEADING_FONT};font-size:14px;font-weight:600;color:${INK};">
              <span style="color:${RED};">&#10084;</span>&nbsp; Welcome to the Center
            </p>
            <h1 style="margin:0 0 16px;font-family:${HEADING_FONT};font-size:30px;line-height:1.2;font-weight:700;color:${INK};">
              <span style="border-bottom:6px solid ${TINT_BORDER};">Your sign-in code</span>
            </h1>
            <p style="margin:0 0 28px;font-family:${BODY_FONT};font-size:16px;line-height:1.6;color:${MUTED};">
              ${first ? `Hi ${escapeHtml(first)}, use` : "Use"} this code to finish signing in to the mileage tracker.
              It works for ${CODE_TTL_MINUTES} minutes.
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background:${TINT};border:1px solid ${TINT_BORDER};border-radius:12px;padding:22px 16px;">
                  <span style="font-family:${CODE_FONT};font-size:36px;line-height:1;font-weight:700;letter-spacing:10px;color:${INK};">${escapeHtml(code)}</span>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0;font-family:${BODY_FONT};font-size:14px;line-height:1.6;color:${MUTED};">
              Signing in as <strong style="color:${INK};">${escapeHtml(who)}</strong>
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
              <tr><td style="border-top:1px solid ${LINE};font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
            <p style="margin:20px 0 0;font-family:${BODY_FONT};font-size:14px;line-height:1.6;color:${MUTED};">
              <strong style="color:${CHARCOAL};">Didn&#39;t try to sign in?</strong> You can ignore this email. Nobody can sign in without the code.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:24px 16px 0;font-family:${BODY_FONT};font-size:12px;line-height:1.6;color:${MUTED};">
            Sacramento Chinese Community Service Center &middot; Staff tools${
              demo ? `<br>Demo with fake data: every sign-in code for the demo comes to this inbox.` : ""
            }
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
