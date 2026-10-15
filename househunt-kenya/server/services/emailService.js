import nodemailer from 'nodemailer';

function getMailConfig() {
  const env = globalThis.process?.env || {};
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'FRONTEND_URL'];
  const missing = required.filter(key => !env[key]);
  if (missing.length) {
    const error = new Error(`Password reset email is not configured. Missing: ${missing.join(', ')}`);
    error.status = 503;
    throw error;
  }

  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('SMTP_PORT must be a valid port number');
    error.status = 503;
    throw error;
  }

  let frontendUrl;
  try {
    frontendUrl = new URL(env.FRONTEND_URL);
  } catch {
    const error = new Error('FRONTEND_URL must be an absolute HTTP or HTTPS URL');
    error.status = 503;
    throw error;
  }
  if (!['http:', 'https:'].includes(frontendUrl.protocol)) {
    const error = new Error('FRONTEND_URL must be an absolute HTTP or HTTPS URL');
    error.status = 503;
    throw error;
  }

  return {
    host: env.SMTP_HOST,
    port,
    secure: String(env.SMTP_SECURE || '').toLowerCase() === 'true',
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
    frontendUrl: frontendUrl.href,
  };
}

export async function sendPasswordResetEmail({ user, token }) {
  const config = getMailConfig();
  const resetUrl = new URL(
    'reset-password',
    config.frontendUrl.endsWith('/') ? config.frontendUrl : `${config.frontendUrl}/`
  );
  resetUrl.searchParams.set('token', token);

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  await transporter.sendMail({
    from: config.from,
    to: user.email,
    subject: 'Reset your HouseHunt Kenya password',
    text: `Use this link to reset your HouseHunt Kenya password. It expires in 30 minutes: ${resetUrl.href}`,
    html: `<p>Hello,</p><p>Use the link below to reset your HouseHunt Kenya password. This link expires in 30 minutes and can only be used once.</p><p><a href="${resetUrl.href}">Reset password</a></p><p>If you did not request a password reset, you can ignore this email.</p>`,
  });
}

export function assertPasswordResetEmailConfigured() {
  getMailConfig();
}
