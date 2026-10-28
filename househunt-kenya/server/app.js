import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Middleware
app.use(cors({
	credentials: true,
	allowedHeaders: ['Content-Type', 'X-HouseHunt-Request'],
	origin(origin, callback) {
		const env = globalThis.process?.env || {};
		const allowedOrigins = String(env.CORS_ORIGINS || 'http://localhost:5174,http://127.0.0.1:5174')
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		if (env.FRONTEND_URL) {
			let frontendOrigin;
			try {
				frontendOrigin = new URL(env.FRONTEND_URL).origin;
			} catch {
				return callback(new Error('FRONTEND_URL must be an absolute HTTP or HTTPS URL'));
			}
			if (!allowedOrigins.includes(frontendOrigin)) allowedOrigins.push(frontendOrigin);
		}
		if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
		return callback(new Error('Origin not allowed by CORS'));
	},
}));
app.use(cookieParser());
app.use(express.json());
app.use(morgan('dev'));

// API routes
app.use('/api', routes);

// 404
app.use((req, res) => res.status(404).json({ success: false, message: 'Not Found' }));

// Global error handler
app.use(errorHandler);

export default app;
