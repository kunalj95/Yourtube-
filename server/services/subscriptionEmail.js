import transporter from "../config/mailer.js";

// =====================================================
// SEND SUBSCRIPTION CONFIRMATION EMAIL
// =====================================================

export const sendSubscriptionConfirmationEmail =
  async ({
    email,
    name,
    plan,
    billingCycle,
    amount,
    currency,
    paymentId,
    orderId,
    invoiceNumber,
    paymentStatus,
    startDate,
    expiryDate,
    supportEmail,
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
      // Format dates
      // -----------------------------------------

      const formattedStartDate =
        startDate
          ? new Date(
              startDate
            ).toLocaleDateString(
              "en-IN",
              {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }
            )
          : "Not available";


      const formattedExpiryDate =
        expiryDate
          ? new Date(
              expiryDate
            ).toLocaleDateString(
              "en-IN",
              {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }
            )
          : "Not available";


      // -----------------------------------------
      // Email subject
      // -----------------------------------------

      const subject =
        `YourTube ${plan} Subscription Confirmed`;


      // -----------------------------------------
      // Plain text email
      // -----------------------------------------

      const text = `
Hello ${name || "User"},

Your YourTube subscription has been successfully activated.

Subscription Details
--------------------

Plan: ${plan}
Billing Cycle: ${billingCycle}
Amount: ${currency} ${amount}
Payment Status: ${paymentStatus}

Payment ID: ${paymentId || "Not available"}
Order ID: ${orderId || "Not available"}
Invoice Number: ${invoiceNumber || "Not available"}

Subscription Start Date: ${formattedStartDate}
Subscription Expiry Date: ${formattedExpiryDate}

Thank you for subscribing to YourTube.

For support, contact:
${supportEmail || "support@yourtube.com"}

Regards,
YourTube Team
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
            YourTube Subscription Confirmed
          </h2>

          <p>
            Hello ${name || "User"},
          </p>

          <p>
            Your YourTube subscription has been
            successfully activated.
          </p>


          <div
            style="
              border: 1px solid #ddd;
              border-radius: 8px;
              padding: 20px;
              margin-top: 20px;
            "
          >

            <h3>
              Subscription Details
            </h3>

            <p>
              <strong>Plan:</strong>
              ${plan}
            </p>

            <p>
              <strong>Billing Cycle:</strong>
              ${billingCycle}
            </p>

            <p>
              <strong>Amount:</strong>
              ${currency} ${amount}
            </p>

            <p>
              <strong>Payment Status:</strong>
              ${paymentStatus}
            </p>

            <p>
              <strong>Payment ID:</strong>
              ${paymentId || "Not available"}
            </p>

            <p>
              <strong>Order ID:</strong>
              ${orderId || "Not available"}
            </p>

            <p>
              <strong>Invoice Number:</strong>
              ${invoiceNumber || "Not available"}
            </p>

            <p>
              <strong>Subscription Start:</strong>
              ${formattedStartDate}
            </p>

            <p>
              <strong>Subscription Expiry:</strong>
              ${formattedExpiryDate}
            </p>

          </div>


          <p style="margin-top: 25px;">
            Thank you for subscribing to YourTube.
          </p>

          <p>
            For support, contact:
            <strong>
              ${supportEmail || "support@yourtube.com"}
            </strong>
          </p>

          <p>
            Regards,<br />
            <strong>YourTube Team</strong>
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
        "Subscription confirmation email sent:",
        info.messageId
      );


      return {
        success: true,
        messageId:
          info.messageId,
      };

    } catch (error) {

      console.error(
        "Subscription confirmation email error:",
        error
      );

      throw error;
    }
  };