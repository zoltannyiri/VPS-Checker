
import nodemailer, { type Transporter } from "nodemailer";
import { lookup } from "node:dns/promises";
import "dotenv/config";

interface SendMailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  from?: string;
}

const smtpPort = Number(process.env.SMTP_PORT || 465);

const smtpSecure =
  String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";

const defaultFrom =
  process.env.EMAIL_FROM;

let transporter: Transporter | undefined;

async function getTransporter(): Promise<Transporter> {
  if (transporter) {
    return transporter;
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error("SMTP nincs beállítva.");
  }

  const { address } = await lookup(smtpHost, {
    family: 4,
  });

  transporter = nodemailer.createTransport({
    host: address,
    port: smtpPort,
    secure: smtpSecure,

    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,

    tls: {
      servername: smtpHost,
    },

    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  return transporter;
}

export async function sendMail({
  to,
  subject,
  html,
  text,
  replyTo,
  from,
}: SendMailParams) {
  const mailTransporter = await getTransporter();

  return mailTransporter.sendMail({
    from: from || defaultFrom,
    to,
    subject,
    html,
    text,
    ...(replyTo ? { replyTo } : {}),
  });
}
