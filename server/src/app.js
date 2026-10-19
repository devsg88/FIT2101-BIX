import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import analyticsRoutes from './routes/analyticsRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

// Sets the standard set of defensive response headers (X-Content-Type-
// Options, X-Frame-Options, etc.) that a hand-rolled Express app otherwise
// sends none of.
app.use(helmet());

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
app.use('/api/projects', analyticsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// NFR-01 added the first safety net here: an inline error handler so that
// Express's default HTML error page - full stack trace and absolute server
// paths, reachable on /api/auth/login with just a malformed JSON body - could
// never reach a client. NFR-03 (middleware/errorHandler.js) extends and
// replaces it: a JSON 404 for unmatched routes, the request's own 4xx status
// kept (with a clear message for malformed or oversized bodies), unexpected
// errors answered as a generic 500 rather than a 400, and redacted
// server-side logging of those 500s.
//
// These two must stay last: notFoundHandler answers any request no route
// matched; errorHandler only sees errors no route answered itself.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
