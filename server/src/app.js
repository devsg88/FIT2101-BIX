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

// Restricts which frontend origins may call this API. The client's own dev
// server (client/vite.config.js) runs on 5173 and proxies /api requests
// server-side, so the browser never actually crosses origins in dev - this
// default only covers opening the API directly (e.g. Postman-less manual
// testing against port 5173). CORS_ORIGIN overrides it with a comma-
// separated list of allowed origins once a production frontend URL exists.
const allowedOrigins = (process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim())) ?? [
  'http://localhost:5173'
];

app.use(cors({ origin: allowedOrigins }));
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

// NFR-01: a safety net for any error that never reached a route's own
// try/catch - most prominently express.json() throwing a SyntaxError on a
// malformed request body, which Express would otherwise hand to its own
// default error handler. That default handler responds with an HTML page
// containing the full stack trace AND the server's absolute filesystem path
// (every node_modules frame), reachable by anyone on the unauthenticated
// /api/auth/login endpoint with nothing but a broken JSON body - exactly the
// "must not expose... stack traces... or other internal information" this
// NFR exists to prevent. This must be the last app.use(): Express only
// treats a 4-arg function as an error handler, and only calls it for errors
// from middleware/routes registered before it.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 400;
  res.status(status).json({ message: 'The request could not be processed' });
});

export default app;
