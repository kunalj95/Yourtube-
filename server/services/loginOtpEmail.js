import transporter from "../config/mailer.js";

// =====================================================
// SEND LOGIN OTP EMAIL
// =====================================================

export const sendLoginOtpEmail = async ({
  email,
  name,
  otp,
  expiresInMinutes,
  browserName,
  deviceType,
  city,
  state,
}) => {
  try {
    // -----------------------------------------
    // Validate recipient
    // -----------------------------------------

    if (!email) {
      throw new Error(
        "Recipient email is required."
      );
    }

    // -----------------------------------------
    // Subject
    // -----------------------------------------

    const subject =
      "YourTube Security Verification Code";

    // -----------------------------------------
    // Plain text email
    // -----------------------------------------

    const text = `
Hello ${name || "User"},

We detected a login to your YourTube account from a new environment.

Your verification code is:

${otp}

This code expires in ${expiresInMinutes} minutes.

Login information
-----------------
Browser: ${browserName || "Unknown"}
Device: ${deviceType || "Unknown"}
City: ${city || "Unknown"}
State: ${state || "Unknown"}

If this login was not initiated by you, do not share this code with anyone.

Regards,
YourTube Security Team
`;

    // -----------------------------------------
    // HTML email
    // -----------------------------------------

    const html = `
      <div
        style="
          font-family: Arial, sans-serif;
          max-width: 650px;
          margin: 0 auto;
          padding: 20px;
          color: #222;
        "
      >

        <h2>
          YourTube Security Verification
        </h2>

        <p>
          Hello ${name || "User"},
        </p>

        <p>
          We detected a login to your
          YourTube account from a new environment.
        </p>

        <div
          style="
            margin: 25px 0;
            padding: 20px;
            text-align: center;
            background: #f5f5f5;
            border-radius: 10px;
          "
        >
          <p
            style="
              margin: 0 0 10px;
              font-size: 14px;
              color: #666;
            "
          >
            Your verification code
          </p>

          <div
            style="
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 8px;
            "
          >
            ${otp}
          </div>
        </div>

        <p>
          This code expires in
          <strong>
            ${expiresInMinutes} minutes
          </strong>.
        </p>

        <div
          style="
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 18px;
            margin-top: 20px;
          "
        >

          <h3>
            Login Information
          </h3>

          <p>
            <strong>Browser:</strong>
            ${browserName || "Unknown"}
          </p>

          <p>
            <strong>Device:</strong>
            ${deviceType || "Unknown"}
          </p>

          <p>
            <strong>City:</strong>
            ${city || "Unknown"}
          </p>

          <p>
            <strong>State:</strong>
            ${state || "Unknown"}
          </p>

        </div>

        <p
          style="
            margin-top: 25px;
            color: #b00020;
          "
        >
          If you did not initiate this login,
          do not share this code with anyone.
        </p>

        <p>
          Regards,<br />
          <strong>YourTube Security Team</strong>
        </p>

      </div>
    `;

    // -----------------------------------------
    // Send email
    // -----------------------------------------

    const info =
      await transporter.sendMail({
        from:
          process.env.SMTP_FROM,

        to:
          email,

        subject,

        text,

        html,
      });

    console.log(
      "Login OTP email sent:",
      info.messageId
    );

    return {
      success: true,
      messageId:
        info.messageId,
    };

  } catch (error) {
    console.error(
      "Login OTP email error:",
      error
    );

    throw error;
  }
};