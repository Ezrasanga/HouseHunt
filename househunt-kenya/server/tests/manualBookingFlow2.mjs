import mongoose from 'mongoose';
import User from '../models/User.js';

const base = 'http://127.0.0.1:5001';
const suffix = Date.now();
const password = 'Password123';

async function request(path, options = {}) {
  const res = await fetch(base + path, options);
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
}

async function register(role, email) {
  return request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: role, lastName: 'User', email, password, role }),
  });
}

async function login(email) {
  const res = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.body?.data?.token || null;
}

async function createProperty(token, title, description, price, propertyType, location) {
  const res = await request('/api/properties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title,
      description,
      price,
      propertyType,
      location,
      bedrooms: 2,
      bathrooms: 2,
      amenities: { wifi: true, parking: true },
      images: ['img.jpg'],
      coverImage: 'img.jpg',
    }),
  });
  return res;
}

async function main() {
  const tenantAEmail = `tenantA_${suffix}@example.com`;
  const tenantBEmail = `tenantB_${suffix}@example.com`;
  const landlordAEmail = `landlordA_${suffix}@example.com`;
  const landlordBEmail = `landlordB_${suffix}@example.com`;
  const adminEmail = `admin_${suffix}@example.com`;

  await register('TENANT', tenantAEmail);
  await register('TENANT', tenantBEmail);
  await register('LANDLORD', landlordAEmail);
  await register('LANDLORD', landlordBEmail);

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/househunt');
  await User.create({
    firstName: 'Admin',
    lastName: 'User',
    email: adminEmail,
    password,
    role: 'ADMIN',
    isVerified: true,
    isActive: true,
  });
  await mongoose.disconnect();

  const tenantAToken = await login(tenantAEmail);
  const tenantBToken = await login(tenantBEmail);
  const landlordAToken = await login(landlordAEmail);
  const landlordBToken = await login(landlordBEmail);
  const adminToken = await login(adminEmail);

  const approvedLocation = {
    county: 'Nairobi',
    town: 'Westlands',
    estate: 'Kilimani',
    street: '4th Street',
    coordinates: { type: 'Point', coordinates: [36.8219, -1.2921] },
  };
  const unapprovedLocation = {
    county: 'Nairobi',
    town: 'Karen',
    estate: 'Karen',
    street: 'Main Road',
    coordinates: { type: 'Point', coordinates: [36.8219, -1.2921] },
  };

  const approvedPropertyRes = await createProperty(landlordAToken, 'Approved Studio', 'A bright and spacious studio apartment in a prime area with excellent amenities and easy access.', 26000, 'Studio', approvedLocation);
  const approvedProperty = approvedPropertyRes.body?.data?.property;

  const unapprovedPropertyRes = await createProperty(landlordBToken, 'Pending House', 'A large family house that is still awaiting admin approval and public availability.', 40000, 'Maisonette', unapprovedLocation);
  const unapprovedProperty = unapprovedPropertyRes.body?.data?.property;

  const approvePropertyRes = await request(`/api/properties/${approvedProperty._id}/approve`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ isApproved: true }),
  });

  const results = {};

  const createApprovedBookingRes = await request('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tenantAToken}` },
    body: JSON.stringify({ propertyId: approvedProperty._id, moveInDate: '2026-09-01', leaseMonths: 6, notes: 'Ready to move in.' }),
  });
  results['1'] = { name: 'Tenant create booking for approved property', status: createApprovedBookingRes.status, message: createApprovedBookingRes.body?.message, body: createApprovedBookingRes.body };

  const createUnapprovedBookingRes = await request('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tenantBToken}` },
    body: JSON.stringify({ propertyId: unapprovedProperty._id, moveInDate: '2026-10-01', leaseMonths: 3, notes: 'Should fail.' }),
  });
  results['2'] = { name: 'Tenant book unapproved property', status: createUnapprovedBookingRes.status, message: createUnapprovedBookingRes.body?.message, body: createUnapprovedBookingRes.body };

  const bookingForTenantA = createApprovedBookingRes.body?.data?.booking || createApprovedBookingRes.body?.booking;
  const bookingForTenantB = createUnapprovedBookingRes.body?.data?.booking || createUnapprovedBookingRes.body?.booking;

  const createApprovedBookingForTenantBRes = await request('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tenantBToken}` },
    body: JSON.stringify({ propertyId: approvedProperty._id, moveInDate: '2026-10-01', leaseMonths: 3, notes: 'Need a short stay.' }),
  });
  const bookingForTenantBSecond = createApprovedBookingForTenantBRes.body?.data?.booking || createApprovedBookingForTenantBRes.body?.booking;

  const tenantAccessOtherRes = await request(`/api/bookings/${bookingForTenantBSecond?.id || 'missing'}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${tenantBToken}` },
  });
  results['3'] = { name: 'Tenant A access Tenant B booking', status: tenantAccessOtherRes.status, message: tenantAccessOtherRes.body?.message, body: tenantAccessOtherRes.body };

  const cancelOwnBookingRes = await request(`/api/bookings/${bookingForTenantA?.id || 'missing'}/cancel`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tenantAToken}` },
  });
  results['4'] = { name: 'Tenant cancel own booking', status: cancelOwnBookingRes.status, message: cancelOwnBookingRes.body?.message, body: cancelOwnBookingRes.body };

  const landlordViewOwnRes = await request('/api/bookings/landlord', {
    method: 'GET',
    headers: { Authorization: `Bearer ${landlordAToken}` },
  });
  results['5'] = { name: 'Landlord view bookings for own property', status: landlordViewOwnRes.status, message: landlordViewOwnRes.body?.message, body: landlordViewOwnRes.body };

  const landlordManageOtherRes = await request(`/api/bookings/${bookingForTenantBSecond?.id || 'missing'}/approve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${landlordBToken}` },
  });
  results['6'] = { name: 'Landlord manage another landlord booking', status: landlordManageOtherRes.status, message: landlordManageOtherRes.body?.message, body: landlordManageOtherRes.body };

  const landlordApproveOwnRes = await request(`/api/bookings/${bookingForTenantA?.id || 'missing'}/approve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${landlordAToken}` },
  });
  results['7'] = { name: 'Landlord approve own property booking', status: landlordApproveOwnRes.status, message: landlordApproveOwnRes.body?.message, body: landlordApproveOwnRes.body };

  const landlordApproveOtherLandlordRes = await request(`/api/bookings/${bookingForTenantA?.id || 'missing'}/approve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${landlordBToken}` },
  });
  results['8'] = { name: 'Landlord approve another landlord booking', status: landlordApproveOtherLandlordRes.status, message: landlordApproveOtherLandlordRes.body?.message, body: landlordApproveOtherLandlordRes.body };

  const adminListRes = await request('/api/bookings/admin', {
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  results['9'] = { name: 'Admin view all bookings', status: adminListRes.status, message: adminListRes.body?.message, body: adminListRes.body };

  const unauthRes = await request('/api/bookings');
  results['10'] = { name: 'Unauthenticated protected booking request', status: unauthRes.status, message: unauthRes.body?.message, body: unauthRes.body };

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
