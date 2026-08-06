import mongoose from 'mongoose';
import { approveBooking } from '../services/bookingService.js';
import Booking from '../models/Booking.js';
import Property from '../models/Property.js';
import User from '../models/User.js';

const uri = 'mongodb://127.0.0.1:27017/househunt';
await mongoose.connect(uri);
const booking = await Booking.findOne({ status: 'PENDING' }).sort('-createdAt');
const landlord = await User.findById(booking.landlord).lean();
const property = await Property.findById(booking.property).lean();
console.log(JSON.stringify({
  bookingId: String(booking._id),
  status: booking.status,
  propertyId: String(booking.property),
  propertyStatus: property.status,
  propertyApproved: property.isApproved,
  ownerId: String(property.owner),
  actorId: String(landlord._id),
}, null, 2));
try {
  const res = await approveBooking(String(booking._id), { id: String(landlord._id), role: 'LANDLORD' });
  console.log('approve ok', JSON.stringify(res, null, 2));
} catch (err) {
  console.log('approve err', err.status, err.message);
}
await mongoose.disconnect();
