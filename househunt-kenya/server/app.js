import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Middleware
app.use(cors({
	origin(origin, callback) {
		const allowedOrigins = String(globalThis.process?.env?.CORS_ORIGINS || 'http://localhost:5173')
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
		return callback(new Error('Origin not allowed by CORS'));
	},
}));
app.use(express.json());
app.use(morgan('dev'));

// API routes
app.use('/api', routes);

// 404
app.use((req, res) => res.status(404).json({ success: false, message: 'Not Found' }));

// Global error handler
app.use(errorHandler);

export default app;
