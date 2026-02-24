import transporter from "./nodemailer.js";
import { ENV } from "../utils/ENV.js";
import { StatusCodes } from "http-status-codes";
import ApiError from "./ApiError.js";
export const sendEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: ENV.GMAIL_EMAIL,
      to,
      subject,
      html,
    });

    return true;
  } catch (error) {
    console.log("We Couldn't Send Email", error.message);
    return new ApiError(StatusCodes.BAD_REQUEST, "We Couldn't Send Email");
  }
};
