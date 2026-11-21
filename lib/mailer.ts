import nodemailer from "nodemailer";

interface SendPasswordResetEmailParams {
  to: string;
  name: string;
  resetUrl: string;
}

/**
 * Creates a reusable nodemailer transporter based on environment variables.
 * Falls back to console logging in development if SMTP credentials are not configured.
 */
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  return null;
}

/**
 * Sends a password reset email to the user with a secure reset link.
 */
export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
}: SendPasswordResetEmailParams): Promise<{ success: boolean; error?: string }> {
  const from =
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    "VoiceReminder <noreply@voicereminder.app>";

  const transporter = getTransporter();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - VoiceReminder</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0c0d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0c0d16; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #161726; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 32px 24px; text-align: center;">
              <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 14px; background: rgba(255, 255, 255, 0.2); font-size: 24px; color: #ffffff;">
                🔐
              </div>
              <h1 style="margin: 16px 0 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">
                VoiceReminder
              </h1>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <h2 style="margin: 0 0 12px; color: #ffffff; font-size: 18px; font-weight: 700;">
                Password Reset Request
              </h2>
              <p style="margin: 0 0 20px; color: #a1a1aa; font-size: 14px; line-height: 1.6;">
                Hello <strong style="color: #ffffff;">${name || "there"}</strong>, we received a request to reset your password for your VoiceReminder account. Click the button below to choose a new password:
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px auto;">
                <tr>
                  <td align="center" style="border-radius: 12px; background: linear-gradient(135deg, #7c3aed, #6366f1); box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 12px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry & Security Notes -->
              <div style="background-color: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px; margin: 24px 0 0;">
                <p style="margin: 0 0 8px; font-size: 12px; color: #d4d4d8; font-weight: 600;">
                  ⏳ This link is valid for <strong>1 hour</strong> and can only be used once.
                </p>
                <p style="margin: 0; font-size: 12px; color: #71717a;">
                  If you did not request a password reset, you can safely ignore this email. Your account remains completely secure.
                </p>
              </div>

              <!-- Fallback plain text URL -->
              <p style="margin: 24px 0 0; color: #71717a; font-size: 11px; line-height: 1.5; word-break: break-all;">
                Or copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color: #a78bfa; text-decoration: underline;">${resetUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding: 20px 24px; text-align: center; background-color: #12131f;">
              <p style="margin: 0; font-size: 11px; color: #52525b;">
                &copy; ${new Date().getFullYear()} VoiceReminder. All rights reserved.
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

  const textContent = `
VoiceReminder - Password Reset Request

Hello ${name || "there"},

We received a request to reset your password for your VoiceReminder account. Use the link below to set a new password:

${resetUrl}

This link is valid for 1 hour and can only be used once.

If you did not request this, you can safely ignore this email.
`;

  try {
    if (transporter) {
      await transporter.sendMail({
        from,
        to,
        subject: "Reset your VoiceReminder password",
        text: textContent,
        html: htmlContent,
      });
      return { success: true };
    } else {
      // In development or when SMTP is not configured, log link to console
      console.log("\n==================================================");
      console.log("📧 [PASSWORD RESET EMAIL]");
      console.log(`To: ${to}`);
      console.log(`Reset URL: ${resetUrl}`);
      console.log("==================================================\n");
      return { success: true };
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[mailer] Error sending password reset email:", errorMsg);
    return { success: false, error: errorMsg };
  }
}
