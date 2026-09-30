import { prisma } from "@/lib/db";
import { isTestMode, recordTestEmail } from "./test-outbox";

export type EmailMessage = {
  toUserId: string;
  subject: string;
  textBody: string;
};

export interface EmailTransport {
  send(msg: EmailMessage): Promise<{ ok: boolean; transportId: string }>;
  sendByEmail(
    toEmail: string,
    subject: string,
    textBody: string,
  ): Promise<{ ok: boolean; transportId: string }>;
}

export class ConsoleEmailTransport implements EmailTransport {
  async send(msg: EmailMessage) {
    const user = await prisma.user.findUnique({
      where: { id: msg.toUserId },
      select: { email: true },
    });
    console.info("[email:stub]", {
      to: user?.email ?? "<unknown>",
      subject: msg.subject,
      bodyPreview: msg.textBody.slice(0, 200),
    });
    if (isTestMode()) {
      recordTestEmail({
        to: user?.email ?? "<unknown>",
        subject: msg.subject,
        body: msg.textBody,
      });
    }
    return { ok: true as const, transportId: "console" as const };
  }

  async sendByEmail(toEmail: string, subject: string, textBody: string) {
    console.info("[email:stub]", {
      to: toEmail,
      subject,
      bodyPreview: textBody.slice(0, 200),
    });
    if (isTestMode()) {
      recordTestEmail({ to: toEmail, subject, body: textBody });
    }
    return { ok: true as const, transportId: "console" as const };
  }
}

export const emailTransport: EmailTransport = new ConsoleEmailTransport();
