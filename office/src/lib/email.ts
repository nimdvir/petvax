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

/** Sends through Resend (https://resend.com) when RESEND_API_KEY is set. */
export async function sendEmail(msg: OutgoingEmail, cfg: { apiKey: string; from: string; replyTo?: string }): Promise<SendResult> {
  if (!cfg.apiKey) return { status: "not_configured", provider: "resend", error: "RESEND_API_KEY is not set; email was not sent." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
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

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
