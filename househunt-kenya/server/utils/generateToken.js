import jwt from 'jsonwebtoken';

export function generateToken(user) {
  const env = globalThis.process?.env || {};
  const secret = env.JWT_SECRET;
  const expiresIn = env.JWT_EXPIRES_IN || '7d';

  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign(
    {
      id: user._id?.toString?.() || user.id,
      role: user.role,
      email: user.email,
    },
    secret,
    { expiresIn }
  );
}
