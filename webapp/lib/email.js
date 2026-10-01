// email.js — sends the approval-request email via Gmail SMTP (nodemailer).
// Requires SMTP_USER (a Gmail address) + SMTP_PASS (a Gmail App Password, not
// the normal password) and APPROVER_EMAIL (the recipient/approver) in .env.

import nodemailer from "nodemailer";

export function emailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS && process.env.APPROVER_EMAIL);
}

export function approverEmail() {
  return process.env.APPROVER_EMAIL || "";
}

function transport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export async function verifyEmail() {
  if (!emailConfigured()) return { ok: false, reason: "not configured" };
  try {
    await transport().verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export async function sendApprovalEmail({ title, imageUrl, reviewUrl, excerpt, date }) {
  const to = process.env.APPROVER_EMAIL;
  const html = `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;color:#1a2433">
    <div style="background:#0e1b2a;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">
      <div style="letter-spacing:2px;font-weight:700">AUGMONT <span style="color:#d4af37">Daily Report</span></div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:22px">
      <p style="margin:0 0 6px;color:#64748b;font-size:13px">A report is awaiting your approval${date ? ` — ${date}` : ""}:</p>
      <h2 style="margin:0 0 14px;font-size:18px">${escapeHtml(title)}</h2>
      ${excerpt ? `<p style="color:#475569;font-size:14px;line-height:1.5">${escapeHtml(excerpt)}</p>` : ""}
      <img src="${imageUrl}" alt="Report preview" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;margin:14px 0" />
      <a href="${reviewUrl}" style="display:inline-block;background:#d4af37;color:#1a1a1a;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px">Review &amp; approve →</a>
      <p style="color:#94a3b8;font-size:12px;margin-top:18px">Approving from this link publishes the report live on insights.augmont.com. If you didn't expect this, ignore the email.</p>
    </div>
  </div>`;

  await transport().sendMail({
    from: `"Augmont Daily Report" <${process.env.SMTP_USER}>`,
    to,
    subject: `Approval needed: ${title}`,
    html,
  });
  return { to };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
