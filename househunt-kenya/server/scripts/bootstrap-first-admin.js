import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Buffer } from 'node:buffer';
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import process, { stdin, stdout } from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import User from '../models/User.js';

const serverDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(serverDirectory, '.env') });

const lockId = 'first-admin';
const lockCollectionName = 'adminBootstrapLocks';

async function promptLine(message, inputStream = stdin, outputStream = stdout) {
  const lineInterface = createInterface({ input: inputStream, output: outputStream });
  try {
    return await lineInterface.question(message);
  } finally {
    lineInterface.close();
  }
}

function promptHidden(message, inputStream = stdin, outputStream = stdout) {
  if (!inputStream.isTTY || typeof inputStream.setRawMode !== 'function') {
    throw new Error('Run this command from an interactive terminal so the password can be hidden.');
  }

  emitKeypressEvents(inputStream);
  outputStream.write(message);
  inputStream.setRawMode(true);
  inputStream.resume();

  return new Promise((resolvePrompt, rejectPrompt) => {
    let value = '';

    const cleanup = () => {
      inputStream.off('keypress', onKeypress);
      inputStream.setRawMode(false);
      inputStream.pause();
      outputStream.write('\n');
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

    inputStream.on('keypress', onKeypress);
  });
}

export async function main({
  database = mongoose,
  userModel = User,
  environment = process.env,
  input = stdin,
  output = stdout,
  logger = console,
  readLine = promptLine,
  readPassword = promptHidden,
} = {}) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('Run this command directly in an interactive PowerShell or terminal window; piped/task input cannot confirm the database.');
  }

  const mongoUri = environment.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI must be configured in the server environment.');
  }

  const nodeEnvironment = (environment.NODE_ENV || 'development').toLowerCase();
  if (!['development', 'test'].includes(nodeEnvironment)) {
    throw new Error('Admin bootstrap is restricted to development and test environments.');
  }

  let lockAcquired = false;
  let adminCreated = false;

  try {
    await database.connect(mongoUri);
    const databaseName = database.connection.name;
    logger.log(`Connected database: ${databaseName}`);

    const confirmation = await readLine(
      `Type "I CONFIRM NON-PRODUCTION ${databaseName}" only if this is your test/development database: `,
      input,
      output,
    );
    if (confirmation !== `I CONFIRM NON-PRODUCTION ${databaseName}`) {
      throw new Error('Database confirmation did not match; no admin was created.');
    }

    if (await userModel.exists({ role: 'ADMIN' })) {
      throw new Error('An admin already exists. Use the authorized admin-management process instead.');
    }

    const locks = database.connection.collection(lockCollectionName);
    try {
      await locks.insertOne({ _id: lockId, startedAt: new Date() });
      lockAcquired = true;
    } catch (error) {
      if (error?.code === 11000) {
        throw new Error(
          'The first-admin bootstrap is already running or was interrupted; investigate before retrying.',
          { cause: error },
        );
      }
      throw error;
    }

    if (await userModel.exists({ role: 'ADMIN' })) {
      throw new Error('An admin was created by another process; no additional admin was created.');
    }

    const firstName = (await readLine('Admin first name: ', input, output)).trim();
    const lastName = (await readLine('Admin last name: ', input, output)).trim();
    const email = (await readLine('Admin email: ', input, output)).trim().toLowerCase();

    if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error('A first name, last name, and valid email address are required.');
    }

    if (await userModel.exists({ email })) {
      throw new Error('That email already belongs to an account; existing accounts are never promoted by this script.');
    }

    const password = await readPassword('Admin password (hidden): ', input, output);
    const passwordConfirmation = await readPassword('Confirm admin password (hidden): ', input, output);

    if (password !== passwordConfirmation) {
      throw new Error('Passwords do not match.');
    }
    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error('Use a password between 12 and 72 UTF-8 bytes.');
    }

    const admin = await userModel.create({
      firstName,
      lastName,
      email,
      password,
      role: 'ADMIN',
    });
    adminCreated = true;
    logger.log(`First admin created successfully (user id: ${String(admin._id)}).`);
  } finally {
    try {
      if (lockAcquired && !adminCreated) {
        await database.connection.collection(lockCollectionName).deleteOne({ _id: lockId });
      }
    } finally {
      await database.disconnect();
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Admin bootstrap failed: ${error.message}`);
    process.exitCode = 1;
  });
}
