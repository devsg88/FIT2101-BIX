export async function loginController(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  // TODO (US-01 commit 4): look up user in PostgreSQL
  // TODO (US-01 commit 5): compare password with bcrypt, issue JWT
  return res.status(501).json({ message: 'Not implemented yet' });
}
