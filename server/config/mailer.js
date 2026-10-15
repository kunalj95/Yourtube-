
import "dotenv/config";

import nodemailer from "nodemailer";

// -----------------------------------------
// CREATE MAIL TRANSPORTER
// -----------------------------------------

const transporter =
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,

    port: Number(process.env.SMTP_PORT || 465),

    secure: process.env.SMTP_SECURE === "true",

    family: 4,

    auth: {
      user: process.env.SMTP_USER,

      pass: process.env.SMTP_PASS,
    },
  });

export default transporter;
