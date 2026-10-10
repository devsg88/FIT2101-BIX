import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import boardRoutes from './routes/boardRoutes.js';
import pbiRoutes from './routes/pbiRoutes.js';
import sprintRoutes from './routes/sprintRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import completedWorkRoutes from './routes/completedWorkRoutes.js';
import subTaskRoutes from './routes/subTaskRoutes.js';
import projectMembershipRoutes from './routes/projectMembershipRoutes.js';
import burndownRoutes from './routes/burndownRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/projects', projectRoutes);

// Project board, PBI, sprint, task, sub-task and membership routes all
// live under /api/projects/:projectId.
app.use('/api/projects', boardRoutes);
app.use('/api/projects', pbiRoutes);
app.use('/api/projects', sprintRoutes);
app.use('/api/projects', taskRoutes);
app.use('/api/projects', completedWorkRoutes);
app.use('/api/projects', subTaskRoutes);
app.use('/api/projects', projectMembershipRoutes);
app.use('/api/projects', burndownRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

export default app;
