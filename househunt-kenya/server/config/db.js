import mongoose from 'mongoose';

export async function connectDB(uri) {
  if (!uri) {
    throw new Error('MONGO_URI not provided');
  }
  mongoose.set('strictQuery', false);
  await mongoose.connect(uri, {
    // useNewUrlParser and useUnifiedTopology are defaults in mongoose 7+
  });
  console.log('MongoDB connected');
}
