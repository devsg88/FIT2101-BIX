import bcrypt from 'bcrypt';
import { findUserByEmail } from '../models/userModel.js';

export async function loginController(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // TODO (US-01 commit 5): sign JWT with role in payload and return it
    return res.status(501).json({ message: 'Not implemented yet' });
  } catch (err) {
    return res.status(500).json({ message: 'Login failed' });
  }
}
