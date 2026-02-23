import nodemailer from "nodemailer";
import { ENV } from "../utils/ENV.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: ENV.GMAIL_EMAIL,
    pass: ENV.GMAIL_PASSWORD,
  },
});

export default transporter;
