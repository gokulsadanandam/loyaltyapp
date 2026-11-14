import "server-only";

import type { ServerEnv } from "@/lib/server-env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface NotificationEmailInput {
  firstName: string | null;
  title: string;
  body: string;
  link: string | null;
  siteUrl: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

/** Plain, accessible email. Every interpolated value is escaped. */
export function renderNotificationEmail(input: NotificationEmailInput): Omit<EmailMessage, "to"> {
  const greeting = input.firstName ? `Hi ${input.firstName},` : "Hi,";
  // link is a same-origin path (DB CHECK); build the absolute URL from our own origin.
  const url = input.link ? `${input.siteUrl}${input.link}` : input.siteUrl;
  const footer =
    "You're receiving this because you're a Loyalty Demo Store member. Turn off emails on your notifications page.";

  const text = `${greeting}\n\n${input.body}\n\n${url}\n\n${footer}\n`;
  const html = `<!doctype html><html lang="en"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>${escapeHtml(greeting)}</p>
<h1 style="font-size:20px">${escapeHtml(input.title)}</h1>
<p>${escapeHtml(input.body)}</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open your account</a></p>
<p style="color:#666;font-size:12px">${escapeHtml(footer)}</p>
</body></html>`;
  return { subject: input.title, text, html };
}

/** Parses `Name <addr>` or a bare address. */
function parseFrom(from: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return match?.[2]
    ? { ...(match[1] ? { name: match[1] } : {}), email: match[2] }
    : { email: from.trim() };
}

/** Resend in production; Mailpit's HTTP API locally. Throws on any non-2xx. */
export async function sendEmail(message: EmailMessage, env: ServerEnv): Promise<void> {
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`resend ${String(res.status)}`);
    return;
  }

  if (env.MAILPIT_URL) {
    const from = parseFrom(env.EMAIL_FROM);
    const res = await fetch(`${env.MAILPIT_URL}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: from.email, ...(from.name ? { Name: from.name } : {}) },
        To: [{ Email: message.to }],
        Subject: message.subject,
        Text: message.text,
        HTML: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`mailpit ${String(res.status)}`);
    return;
  }

  throw new Error("no email transport configured");
}
