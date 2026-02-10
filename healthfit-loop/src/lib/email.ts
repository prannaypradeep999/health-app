import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  try {
    const info = await transporter.sendMail({
      from: `"fytr.ai" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });

    console.log('[Email] ✅ Sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('[Email] ❌ Failed to send:', error);
    return false;
  }
}

export function generateDashboardReadyEmail(firstName: string, surveyId: string): { subject: string; html: string } {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?token=${surveyId}`;

  const subject = "Your personalized health plan is ready! 🎉";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0; padding: 0;">
        <tr>
          <td style="padding: 40px 20px;">
            <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-collapse: collapse;">
              <!-- Header -->
              <tr>
                <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                    fytr.ai
                  </h1>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 40px;">
                  <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 24px; font-weight: 600; line-height: 1.3;">
                    Hi ${firstName}! 👋
                  </h2>

                  <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
                    Great news! Your personalized health and fitness plan is ready. Based on your goals and preferences, we've created custom meal and workout plans just for you.
                  </p>

                  <p style="margin: 0 0 32px; color: #475569; font-size: 16px; line-height: 1.6;">
                    Your dashboard includes:
                  </p>

                  <ul style="margin: 0 0 32px; padding-left: 20px; color: #475569; font-size: 16px; line-height: 1.6;">
                    <li style="margin-bottom: 8px;">🍽️ Personalized meal plans with restaurant and home cooking options</li>
                    <li style="margin-bottom: 8px;">💪 Custom workout routines tailored to your fitness level</li>
                    <li style="margin-bottom: 8px;">📊 Progress tracking and analytics</li>
                    <li style="margin-bottom: 8px;">🛒 Smart grocery lists based on your meal plans</li>
                  </ul>

                  <!-- CTA Button -->
                  <table role="presentation" style="margin: 0 auto; border-collapse: collapse;">
                    <tr>
                      <td style="text-align: center;">
                        <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">
                          View My Dashboard
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin: 32px 0 0; color: #64748b; font-size: 14px; line-height: 1.5; text-align: center;">
                    This link will work from any device and browser. Save it for easy access to your personalized plan.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">
                    Questions? Just reply to this email · <a href="https://fytr.ai" style="color: #667eea; text-decoration: none;">fytr.ai</a>
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

  return { subject, html };
}