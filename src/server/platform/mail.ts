import nodemailer from "nodemailer";
import { db } from "@/server/db";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/**
 * Delivery is invoked by the outbox worker. In sandbox mode messages are stored
 * in Postgres and shown at /dev/mailbox, so local setup needs no SMTP account.
 */
export async function deliverMail(message: MailMessage): Promise<void> {
  if (process.env.MAIL_TRANSPORT !== "smtp") {
    await db.sandboxEmail.create({ data: { to: message.to, subject: message.subject, text: message.text } });
    return;
  }
  const url = process.env.SMTP_URL;
  if (!url) throw new Error("SMTP_URL is required when MAIL_TRANSPORT=smtp");
  const transport = nodemailer.createTransport(url);
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? "Recurivo <no-reply@localhost>",
    to: message.to,
    subject: message.subject,
    text: message.text,
    attachments: message.attachments,
  });
}
