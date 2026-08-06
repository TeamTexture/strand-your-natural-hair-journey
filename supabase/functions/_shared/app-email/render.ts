/**
 * STRAND email shell — the ONLY place email HTML is composed.
 * Playfair-style serif wordmark, sand/gold/ink palette, 520px card.
 * Transactional emails never render an unsubscribe line; marketing always does.
 */
import { appUrl, SUPPORT_EMAIL } from "./config.ts";

const SAND = "#F7F1E7";
const GOLD = "#B08D4F";
const INK = "#3B2E26";
const MUTED = "#8A7F6B";
const LINE = "#E8DDC5";

export interface RenderInput {
  subject: string;
  /** Small uppercase eyebrow above the heading, e.g. "Admin" or "Professional". */
  eyebrow?: string | null;
  blocks: string[];
  /** Optional label/value detail table. */
  rows?: { label: string; value: string }[] | null;
  /** `path` may be an in-app path or an absolute URL. */
  cta?: { label: string; path: string } | null;
  isMarketing: boolean;
  unsubscribeUrl?: string | null;
  footerNote?: string | null;
}

const esc = (v: string) =>
  String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function renderEmail(input: RenderInput): { html: string; text: string } {
  const { subject, eyebrow, blocks, rows, cta, isMarketing, unsubscribeUrl, footerNote } =
    input;

  const paragraphs = blocks
    .filter((b) => b && String(b).trim())
    .map(
      (b) =>
        `<p style="margin:0 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${INK};">${esc(
          b,
        )}</p>`,
    )
    .join("");

  const rowsHtml = rows?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${INK};margin:4px 0 18px;">
${rows
        .filter((r) => r && r.value)
        .map(
          (r) =>
            `<tr><td style="padding:6px 0;width:120px;color:${MUTED};text-transform:uppercase;font-size:10px;letter-spacing:0.12em;">${esc(
              r.label,
            )}</td><td style="padding:6px 0;color:${INK};">${esc(r.value)}</td></tr>`,
        )
        .join("")}
</table>`
    : "";

  const ctaUrl = cta ? appUrl(cta.path) : "";
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 6px;"><tr><td style="border-radius:999px;background:${GOLD};">
<a href="${esc(ctaUrl)}" style="display:inline-block;padding:12px 24px;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;">${esc(
        cta.label,
      )}</a></td></tr></table>`
    : "";

  const footerLines: string[] = [];
  if (footerNote) footerLines.push(esc(footerNote));
  footerLines.push(
    `STRAND is part of TT Collective. Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${MUTED};">${SUPPORT_EMAIL}</a>`,
  );
  if (isMarketing && unsubscribeUrl) {
    footerLines.push(
      `You are receiving this because you opted in to STRAND updates. <a href="${esc(
        unsubscribeUrl,
      )}" style="color:${MUTED};">Unsubscribe</a>`,
    );
  }

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(
    subject,
  )}</title></head>
<body style="margin:0;padding:0;background:${SAND};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SAND};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:14px;border:1px solid ${LINE};">
<tr><td style="padding:28px 32px 4px;">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:0.3em;color:${INK};text-transform:uppercase;">STRAND</div>
${eyebrow ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:${GOLD};margin-top:8px;">${esc(eyebrow)}</div>` : ""}
<h1 style="margin:14px 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;font-weight:600;color:${INK};">${esc(
    subject,
  )}</h1>
${paragraphs}
${rowsHtml}
${ctaHtml}
</td></tr>
<tr><td style="padding:14px 32px 26px;">
<div style="height:1px;background:${LINE};margin:0 0 14px;"></div>
${footerLines
    .map(
      (l) =>
        `<p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:${MUTED};">${l}</p>`,
    )
    .join("")}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    "STRAND",
    "",
    subject,
    "",
    ...blocks.filter(Boolean),
    ...(rows?.filter((r) => r?.value).map((r) => `${r.label}: ${r.value}`) ?? []),
    cta ? `\n${cta.label}: ${ctaUrl}` : "",
    "",
    `STRAND is part of TT Collective. Questions? ${SUPPORT_EMAIL}`,
    isMarketing && unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { html, text };
}
