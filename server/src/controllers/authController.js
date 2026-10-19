import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { findUserByEmail } from '../models/userModel.js';

// Configurable via .env (JWT_EXPIRES_IN); defaults to the 8h security
// baseline rather than being hardcoded here.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export async function loginController(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);

    if (!user || !user.password_hash) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      user: { id: user.id, name: user.name, role: user.role, token }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Login failed' });
  }
}
