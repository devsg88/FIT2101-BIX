import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import boardRoutes from './routes/boardRoutes.js';
import pbiRoutes from './routes/pbiRoutes.js';
import sprintRoutes from './routes/sprintRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/projects', projectRoutes);

// Project board, PBI and sprint routes all live under /api/projects/:projectId.
app.use('/api/projects', boardRoutes);
app.use('/api/projects', pbiRoutes);
app.use('/api/projects', sprintRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

export default app;
