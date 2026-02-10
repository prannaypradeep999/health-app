const nodemailer = require('nodemailer');
require('dotenv').config(); // Load .env file

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'support@fytr.ai',
    pass: process.env.SMTP_PASSWORD || 'PASTE_YOUR_APP_PASSWORD_HERE',
  },
});

async function sendTestEmail() {
  try {
    console.log('📧 Attempting to send test email...');
    console.log('SMTP User:', process.env.SMTP_USER || 'support@fytr.ai');
    console.log('SMTP Password:', process.env.SMTP_PASSWORD ? '[SET]' : '[NOT SET]');

    const info = await transporter.sendMail({
      from: '"fytr.ai" <support@fytr.ai>',
      to: 'prannay.pradeep@gmail.com',  // <-- Change this to your email
      subject: 'FYTR Test Email',
      html: '<h1>It works!</h1><p>If you see this, email sending is configured correctly.</p><p>Sent at: ' + new Date().toISOString() + '</p>',
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
  } catch (error) {
    console.error('❌ Failed to send email:');
    console.error('Error message:', error.message);
    console.error('Full error:', error);
  }
}

sendTestEmail();