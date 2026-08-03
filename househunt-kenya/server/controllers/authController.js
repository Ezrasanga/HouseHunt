import jwt from 'jsonwebtoken';
import User from '../models/User.js';

function generateToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  return jwt.sign({ id: user._id, role: user.role }, secret, {
    expiresIn: '7d',
  });
}

export async function login(req, res, next) {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (role && user.role !== role) {
      return res.status(401).json({ success: false, message: 'Invalid login role for this account' });
    }

    const passwordMatches = await user.comparePassword(password);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.banned) {
      return res.status(403).json({ success: false, message: 'This account is suspended' });
    }

    const token = generateToken(user);
    res.json({ success: true, token, user: user.toObject() });
  } catch (err) {
    next(err);
  }
}

export async function register(req, res, next) {
  try {
    const { name, email, password, role = 'tenant', phone = '', whatsapp = '', ig = '', fb = '', tt = '', tw = '' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'A user with that email already exists' });
    }

    const user = new User({
      name,
      email,
      password,
      role,
      phone,
      whatsapp,
      ig,
      fb,
      tt,
      tw,
    });

    await user.save();

    const token = generateToken(user);
    res.status(201).json({ success: true, token, user: user.toObject() });
  } catch (err) {
    next(err);
  }
}

export async function profile(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: user.toObject() });
  } catch (err) {
    next(err);
  }
}
