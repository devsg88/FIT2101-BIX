// TODO (US-02 commit 5): return real org-wide / personal data once queries exist
export async function getDashboardController(req, res) {
  const { role } = req.user;

  if (role === 'admin') {
    return res.json({ role, data: {} });
  }

  return res.json({ role, data: {} });
}
