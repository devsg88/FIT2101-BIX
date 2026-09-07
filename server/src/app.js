import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

export default app;
