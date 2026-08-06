/**
 * STRAND email shell — Playfair Display headings, Jost body, sand/gold/ink.
 * Inline styles only; no external CSS. Transactional emails never render an
 * unsubscribe line; marketing emails always do.
 */

const SAND = "#F6F1E9";
const GOLD = "#B08D57";
const INK = "#3B2F2A";
const MUTED = "#7A6A60";

export interface RenderInput {
  appUrl: string;
  subject: string;
  blocks: string[];
  cta?: { label: string; path: string } | null;
  isMarketing: boolean;
  unsubscribeUrl?: string | null;
}

const esc = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderEmail(input: RenderInput): { html: string; text: string } {
  const { appUrl, subject, blocks, cta, isMarketing, unsubscribeUrl } = input;

  const paragraphs = blocks
    .filter((b) => b && b.trim())
    .map(
      (b) =>
        `<p style="margin:0 0 16px;font-family:Jost,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${INK};">${esc(
          b,
        )}</p>`,
    )
    .join("");

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr><td style="border-radius:50px;background:${GOLD};">
<a href="${esc(appUrl)}${esc(cta.path)}" style="display:inline-block;padding:13px 26px;border-radius:50px;font-family:Jost,Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;color:#FFFFFF;text-decoration:none;">${esc(
        cta.label,
      )}</a></td></tr></table>`
    : "";

  const footerLines = [
    `STRAND is part of TT Collective. Questions? <a href="mailto:info@teamtexture.co.uk" style="color:${MUTED};">info@teamtexture.co.uk</a>`,
  ];
  if (isMarketing && unsubscribeUrl) {
    footerLines.push(
      `You are receiving this because you opted in to STRAND updates. <a href="${esc(
        unsubscribeUrl,
      )}" style="color:${MUTED};">Unsubscribe</a>`,
    );
  }

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${SAND};border-radius:18px;">
<tr><td style="padding:28px 28px 8px;">
<div style="font-family:'Playfair Display',Georgia,serif;font-size:24px;letter-spacing:1px;color:${INK};">STRAND</div>
<div style="height:2px;width:44px;background:${GOLD};margin:10px 0 20px;"></div>
<h1 style="margin:0 0 18px;font-family:'Playfair Display',Georgia,serif;font-size:22px;line-height:1.3;font-weight:500;color:${INK};">${esc(
    subject,
  )}</h1>
${paragraphs}
${ctaHtml}
</td></tr>
<tr><td style="padding:16px 28px 26px;">
<div style="height:1px;background:rgba(59,47,42,0.12);margin:0 0 14px;"></div>
${footerLines
    .map(
      (l) =>
        `<p style="margin:0 0 8px;font-family:Jost,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${MUTED};">${l}</p>`,
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
    cta ? `\n${cta.label}: ${appUrl}${cta.path}` : "",
    "",
    "STRAND is part of TT Collective. Questions? info@teamtexture.co.uk",
    isMarketing && unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { html, text };
}
