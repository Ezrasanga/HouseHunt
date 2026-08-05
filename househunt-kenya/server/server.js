import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import app from './app.js';
import { connectDB } from './config/db.js';

const env = globalThis.process?.env || {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '.env') });

const PORT = env.PORT || 5001;

async function start() {
  try {
    await connectDB(env.MONGO_URI);
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (${env.NODE_ENV || 'development'})`);
    });

    globalThis.process?.on('SIGTERM', () => {
      console.log('SIGTERM received, closing server');
      server.close(() => globalThis.process?.exit(0));
    });
  } catch (err) {
    console.error('Failed to start server', err);
    globalThis.process?.exit(1);
  }
}

start();
