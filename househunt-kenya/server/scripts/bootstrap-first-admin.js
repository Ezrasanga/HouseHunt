import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import User from '../models/User.js';

const serverDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(serverDirectory, '.env') });

const lockId = 'first-admin';
const lockCollectionName = 'adminBootstrapLocks';

async function promptLine(message) {
  const input = createInterface({ input: stdin, output: stdout });
  try {
    return await input.question(message);
  } finally {
    input.close();
  }
}

function promptHidden(message) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Run this command from an interactive terminal so the password can be hidden.');
  }

  emitKeypressEvents(stdin);
  stdout.write(message);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolvePrompt, rejectPrompt) => {
    let value = '';

    const cleanup = () => {
      stdin.off('keypress', onKeypress);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };

    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        rejectPrompt(new Error('Password entry cancelled.'));
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolvePrompt(value);
        return;
      }

      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }

      if (character && !key.ctrl && !key.meta) {
        value += character;
      }
    };

    stdin.on('keypress', onKeypress);
  });
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('Run this command directly in an interactive PowerShell or terminal window; piped/task input cannot confirm the database.');
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI must be configured in the server environment.');
  }

  const nodeEnvironment = (process.env.NODE_ENV || 'development').toLowerCase();
  if (!['development', 'test'].includes(nodeEnvironment)) {
    throw new Error('Admin bootstrap is restricted to development and test environments.');
  }

  let lockAcquired = false;
  let adminCreated = false;

  try {
    await mongoose.connect(mongoUri);
    const databaseName = mongoose.connection.name;
    console.log(`Connected database: ${databaseName}`);

    const confirmation = await promptLine(
      `Type "I CONFIRM NON-PRODUCTION ${databaseName}" only if this is your test/development database: `,
    );
    if (confirmation !== `I CONFIRM NON-PRODUCTION ${databaseName}`) {
      throw new Error('Database confirmation did not match; no admin was created.');
    }

    if (await User.exists({ role: 'ADMIN' })) {
      throw new Error('An admin already exists. Use the authorized admin-management process instead.');
    }

    const locks = mongoose.connection.collection(lockCollectionName);
    try {
      await locks.insertOne({ _id: lockId, startedAt: new Date() });
      lockAcquired = true;
    } catch (error) {
      if (error?.code === 11000) {
        throw new Error('The first-admin bootstrap is already running or was interrupted; investigate before retrying.');
      }
      throw error;
    }

    if (await User.exists({ role: 'ADMIN' })) {
      throw new Error('An admin was created by another process; no additional admin was created.');
    }

    const firstName = (await promptLine('Admin first name: ')).trim();
    const lastName = (await promptLine('Admin last name: ')).trim();
    const email = (await promptLine('Admin email: ')).trim().toLowerCase();

    if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error('A first name, last name, and valid email address are required.');
    }

    if (await User.exists({ email })) {
      throw new Error('That email already belongs to an account; existing accounts are never promoted by this script.');
    }

    const password = await promptHidden('Admin password (hidden): ');
    const passwordConfirmation = await promptHidden('Confirm admin password (hidden): ');

    if (password !== passwordConfirmation) {
      throw new Error('Passwords do not match.');
    }
    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error('Use a password between 12 and 72 UTF-8 bytes.');
    }

    const admin = await User.create({
      firstName,
      lastName,
      email,
      password,
      role: 'ADMIN',
    });
    adminCreated = true;
    console.log(`First admin created successfully (user id: ${String(admin._id)}).`);
  } finally {
    try {
      if (lockAcquired && !adminCreated) {
        await mongoose.connection.collection(lockCollectionName).deleteOne({ _id: lockId });
      }
    } finally {
      await mongoose.disconnect();
    }
  }
}

main().catch((error) => {
  console.error(`Admin bootstrap failed: ${error.message}`);
  process.exitCode = 1;
});
