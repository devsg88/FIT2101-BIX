import { getSprintAnalytics } from '../models/analyticsModel.js';

export async function getSprintAnalyticsController(req, res) {
  const projectId = Number(req.params.projectId);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'A valid projectId is required' });
  }
  try {
    const analytics = await getSprintAnalytics(projectId);
    return res.json({ project_id: String(projectId), ...analytics });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load Sprint analytics' });
  }
}
