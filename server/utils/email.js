// Email sending utility
// Supports multiple email providers: Gmail SMTP, SendGrid, or console logging (development)

import nodemailer from 'nodemailer';

/**
 * Send password reset email
 * @param {string} to - Recipient email address
 * @param {string} resetLink - Password reset link
 * @returns {Promise<boolean>} - Returns true if email sent successfully
 */
export async function sendResetPasswordEmail(to, resetLink) {
  try {
    // Get email configuration from environment variables
    const emailProvider = process.env.EMAIL_PROVIDER || 'console'; // 'gmail', 'sendgrid', or 'console'
    
    // If console mode (development), just log the email
    if (emailProvider === 'console') {
      console.log('\n📧 ===== PASSWORD RESET EMAIL =====');
      console.log('To:', to);
      console.log('Subject: Reset Your Password - Synapse AI');
      console.log('Reset Link:', resetLink);
      console.log('=====================================\n');
      return true;
    }

    // Configure email transporter based on provider
    let transporter;

    if (emailProvider === 'gmail') {
      // Gmail SMTP configuration
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER, // Your Gmail address
          pass: process.env.EMAIL_PASSWORD, // Gmail App Password (not regular password)
        },
      });
    } else if (emailProvider === 'sendgrid') {
      // SendGrid SMTP configuration
      transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY,
        },
      });
    } else if (emailProvider === 'smtp') {
      // Custom SMTP configuration
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
    } else {
      console.warn(`Unknown email provider: ${emailProvider}. Falling back to console mode.`);
      console.log('📧 Password reset email would be sent to:', to);
      console.log('🔗 Reset link:', resetLink);
      return true;
    }

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@synapse.ai',
      to: to,
      subject: 'Reset Your Password - Synapse AI',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Synapse AI</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
            <h2 style="color: #111827; margin-top: 0;">Reset Your Password</h2>
            <p style="color: #6b7280;">You requested to reset your password. Click the button below to create a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" 
                 style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Reset Password
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
            <p style="color: #667eea; font-size: 12px; word-break: break-all; background: #f3f4f6; padding: 10px; border-radius: 4px;">${resetLink}</p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
              This link will expire in 15 minutes. If you didn't request this password reset, please ignore this email.
            </p>
          </div>
        </body>
        </html>
      `,
      text: `
        Reset Your Password - Synapse AI
        
        You requested to reset your password. Click the link below to create a new password:
        
        ${resetLink}
        
        This link will expire in 15 minutes. If you didn't request this password reset, please ignore this email.
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    // Don't throw error - we still want to return success to user (security)
    // But log it for debugging
    return false;
  }
}
