// Transactional email through Resend's HTTP API (no SMTP server or extra dependency needed).
const RESEND_URL = "https://api.resend.com/emails";

function isMailerConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || "").trim() && String(process.env.MAIL_FROM || "").trim());
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (!isMailerConfigured()) {
    throw new Error("Email is not configured (RESEND_API_KEY and MAIL_FROM)");
  }

  const greeting = name ? `Hi ${name},` : "Hi,";
  const response = await fetch(String(process.env.RESEND_API_URL || RESEND_URL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${String(process.env.RESEND_API_KEY).trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: String(process.env.MAIL_FROM).trim(),
      to: [to],
      subject: "Reset your Greenhouse IQ password",
      text: [
        greeting,
        "",
        "We received a request to reset your Greenhouse IQ password.",
        `Open this link within 30 minutes to choose a new password:\n${resetUrl}`,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend rejected the email (${response.status}): ${detail.slice(0, 200)}`);
  }
}

module.exports = {
  isMailerConfigured,
  sendPasswordResetEmail,
};
