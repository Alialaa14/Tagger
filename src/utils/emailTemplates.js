export const forgetPasswordTemp = ({ otp, name }) => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your OTP Code</title>
  </head>

  <body
    style="
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      background-color: #f4f6f8;
    "
  >
    <!-- Main Wrapper -->
    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      style="padding: 40px 0"
    >
      <tr>
        <td align="center">
          <!-- Email Container -->
          <table
            width="600"
            cellpadding="0"
            cellspacing="0"
            style="
              background: #ffffff;
              border-radius: 14px;
              overflow: hidden;
              box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
            "
          >
            <!-- Header -->
            <tr>
              <td
                style="
                  background: linear-gradient(90deg, #6a11cb, #2575fc);
                  padding: 25px;
                  text-align: center;
                  color: white;
                "
              >
                <h1 style="margin: 0; font-size: 22px">
                  Verify Your Account
                </h1>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 35px">
                <h2 style="margin-top: 0; color: #222; font-size: 20px">
                  Hello 👋 ${name}
                </h2>

                <p style="color: #555; font-size: 15px; line-height: 1.6">
                  We received a request to verify your email address.
                  Please use the following One-Time Password (OTP) to continue:
                </p>

                <!-- OTP Box -->
                <div
                  style="
                    margin: 30px auto;
                    text-align: center;
                    padding: 18px;
                    font-size: 32px;
                    font-weight: bold;
                    letter-spacing: 10px;
                    background: #f4f6ff;
                    border-radius: 12px;
                    color: #2575fc;
                    width: fit-content;
                  "
                >
                  ${otp}
                </div>

                <p style="color: #555; font-size: 14px; line-height: 1.6">
                  This code will expire in
                  <strong>10 minutes</strong>.
                </p>

                <p style="color: #888; font-size: 13px; line-height: 1.6">
                  If you did not request this, you can safely ignore this email.
                </p>

                <!-- Divider -->
                <hr style="border: none; border-top: 1px solid #eee" />

                <!-- Footer -->
                <p
                  style="
                    text-align: center;
                    font-size: 12px;
                    color: #aaa;
                    margin-top: 20px;
                  "
                >
                  © 2026 Your Company • All rights reserved
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
};
