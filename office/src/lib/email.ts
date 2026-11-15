import nodemailer from "nodemailer";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Uint8Array }[];
}

export type SendResult =
  | { status: "sent"; provider: string; messageId: string | null }
  | { status: "failed" | "not_configured"; provider: string; error: string };

export interface EmailConfig {
  /** SMTP (e.g. Gmail: smtp.gmail.com, port 465, the Gmail address, and a Google "app password"). */
  smtp?: { host: string; port: number; user: string; password: string } | null;
  /** Resend (https://resend.com) API key; needs a verified sending domain. */
  resendApiKey?: string;
  from: string;
  replyTo?: string;
}

/** Reads email settings from the environment (server only). */
export function emailConfigFromEnv(): EmailConfig {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  return {
    smtp: host && user && password ? { host, port: Number(process.env.SMTP_PORT ?? 465), user, password } : null,
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    // With Gmail, mail must come from the Gmail account itself.
    from: process.env.EMAIL_FROM ?? (user ? `PetVax <${user}>` : "PetVax <certificates@petvax.org>"),
    replyTo: process.env.EMAIL_REPLY_TO ?? "",
  };
}

async function sendSmtp(msg: OutgoingEmail, cfg: EmailConfig): Promise<SendResult> {
  const smtp = cfg.smtp!;
  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.password },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const info = await transport.sendMail({
      from: cfg.from,
      to: msg.to,
      replyTo: cfg.replyTo || undefined,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content) })),
    });
    return { status: "sent", provider: "smtp", messageId: info.messageId ?? null };
  } catch (err) {
    return { status: "failed", provider: "smtp", error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendResend(msg: OutgoingEmail, cfg: EmailConfig): Promise<SendResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: cfg.from,
        to: [msg.to],
        reply_to: cfg.replyTo || undefined,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { status: "failed", provider: "resend", error: body.message ?? `HTTP ${res.status}` };
    return { status: "sent", provider: "resend", messageId: body.id ?? null };
  } catch (err) {
    return { status: "failed", provider: "resend", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Sends through Gmail/SMTP if configured, otherwise Resend, otherwise reports "not_configured". */
export async function sendEmail(msg: OutgoingEmail, cfg: EmailConfig = emailConfigFromEnv()): Promise<SendResult> {
  if (cfg.smtp) return sendSmtp(msg, cfg);
  if (cfg.resendApiKey) return sendResend(msg, cfg);
  return { status: "not_configured", provider: "none", error: "Email sending is not set up (add Gmail SMTP or a Resend key); nothing was sent." };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
