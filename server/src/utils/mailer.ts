import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

let transporter: Transporter | null = null;

export interface Mail { to: string; subject: string; text: string; html?: string }

/**
 * Sends an email through SMTP when SMTP_HOST is configured. Without SMTP the
 * mail is printed to the server log instead (handy for local development),
 * and `sent: false` lets callers show the link to the user.
 */
export async function sendMail(mail: Mail): Promise<{ sent: boolean }> {
  const smtp = env.smtp;
  if (!smtp) {
    console.info(`[mail not sent — SMTP_HOST not set] To: ${mail.to}\nSubject: ${mail.subject}\n${mail.text}\n`);
    return { sent: false };
  }
  transporter ??= nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  try {
    await transporter.sendMail({ from: env.mailFrom, ...mail });
    return { sent: true };
  } catch (err) {
    console.error(`Failed to send mail to ${mail.to}:`, (err as Error).message);
    return { sent: false };
  }
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
