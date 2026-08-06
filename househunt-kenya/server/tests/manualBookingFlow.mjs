import assert from 'node:assert/strict';

const base = 'http://localhost:5001';
const suffix = Date.now();

function makeEmail(prefix) {
  return `${prefix}${suffix}@example.com`;
}

async function request(path, options = {}) {
  const res = await fetch(base + path, options);
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
}

async function login(email, password) {
  const res = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.token;
}

async function main() {
  const tenantAEmail = makeEmail('tenantA_');
  const tenantBEmail = makeEmail('tenantB_');
  const landlordAEmail = makeEmail('landlordA_');
  const landlordBEmail = makeEmail('landlordB_');
  const adminEmail = makeEmail('admin_');
  const password = 'Password123';

  const users = [];
  for (const [role, email] of [
    ['TENANT', tenantAEmail],
    ['TENANT', tenantBEmail],
    ['LANDLORD', landlordAEmail],
    ['LANDLORD', landlordBEmail],
    ['ADMIN', adminEmail],
  ]) {
    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: role,
        lastName: 'User',
        email,
        password,
        role,
      }),
    });
    users.push({ role, email, status: res.status, body: res.body });
  }

  const tenantAToken = await login(tenantAEmail, password);
  const tenantBToken = await login(tenantBEmail, password);
  const landlordAToken = await login(landlordAEmail, password);
  const landlordBToken = await login(landlordBEmail, password);
  const adminToken = await login(adminEmail, password);

  const landlordAPropertyRes = await request('/api/properties', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${landlordAToken}`,
    },
    body: JSON.stringify({
      title: 'Cozy Apartment A',
      description: 'Bright and spacious apartment for rent in Nairobi West with amazing views.',
      price: 25000,
      propertyType: 'Apartment',
      location: { county: 'Nairobi', town: 'Westlands', estate: 'Kilimani', street: '4th Street' },
      bedrooms: 2,
      bathrooms: 2,
      amenities: { wifi: true, parking: true },
      images: ['a.jpg'],
      coverImage: 'a.jpg',
    }),
  });
  const landlordAProperty = landlordAPropertyRes.body.data.property;
  assert.equal(landlordAPropertyRes.status, 201, 'landlordA property create should succeed');

  const landlordBPropertyRes = await request('/api/properties', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${landlordBToken}`,
    },
    body: JSON.stringify({
      title: 'Private House B',
      description: 'Quiet private house perfect for families in Karen with secure surroundings.',
      price: 45000,
      propertyType: 'Maisonette',
      location: { county: 'Nairobi', town: 'Karen', estate: 'Karen', street: 'Main Road' },
      bedrooms: 4,
      bathrooms: 3,
      amenities: { wifi: true, security: true },
      images: ['b.jpg'],
      coverImage: 'b.jpg',
    }),
  });
  const landlordBProperty = landlordBPropertyRes.body.data.property;
  assert.equal(landlordBPropertyRes.status, 201, 'landlordB property create should succeed');

  const approvePropertyARes = await request(`/api/properties/${landlordAProperty.id}/approve`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ isApproved: true }),
  });
  const approvePropertyBRes = await request(`/api/properties/${landlordBProperty.id}/approve`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ isApproved: true }),
  });
  assert.equal(approvePropertyARes.status, 200, 'approve property A should succeed');
  assert.equal(approvePropertyBRes.status, 200, 'approve property B should succeed');

  const tenantABookingRes = await request('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tenantAToken}` },
    body: JSON.stringify({ propertyId: landlordAProperty.id, moveInDate: '2026-09-01', leaseMonths: 6, notes: 'Looking forward to moving in.' }),
  });
  const tenantABooking = tenantABookingRes.body.data.booking;
  assert.equal(tenantABookingRes.status, 201, 'tenantA create booking on property A should succeed');

  const tenantBBookingRes = await request('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tenantBToken}` },
    body: JSON.stringify({ propertyId: landlordBProperty.id, moveInDate: '2026-10-01', leaseMonths: 3, notes: 'Need a short stay.' }),
  });
  const tenantBBooking = tenantBBookingRes.body.data.booking;
  assert.equal(tenantBBookingRes.status, 201, 'tenantB create booking on property B should succeed');

  const tenantAViewTenantBBookingRes = await request(`/api/bookings/${tenantBBooking.id}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${tenantAToken}` },
  });
  console.log('1 tenant create booking for approved property', tenantABookingRes.status, tenantABookingRes.body.message);
  console.log('2 tenant book unapproved property', 'n/a (not executed in this script)');
  console.log('3 tenantA access tenantB booking', tenantAViewTenantBBookingRes.status, tenantAViewTenantBBookingRes.body.message);

  const tenantACancelRes = await request('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tenantAToken}` },
    body: JSON.stringify({ propertyId: landlordBProperty.id, moveInDate: '2026-11-01', leaseMonths: 2, notes: 'Second booking for cancellation test.' }),
  });
  const cancelBooking = tenantACancelRes.body.data.booking;
  const tenantACancelBookingRes = await request(`/api/bookings/${cancelBooking.id}/cancel`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tenantAToken}` },
  });
  console.log('4 tenant cancel own booking', tenantACancelBookingRes.status, tenantACancelBookingRes.body.message);

  const landlordAListRes = await request('/api/bookings/landlord', {
    method: 'GET',
    headers: { Authorization: `Bearer ${landlordAToken}` },
  });
  console.log('5 landlordA view own property bookings', landlordAListRes.status, landlordAListRes.body.message);

  const landlordAApproveOtherRes = await request(`/api/bookings/${tenantBBooking.id}/approve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${landlordAToken}` },
  });
  console.log('6 landlordA manage landlordB booking', landlordAApproveOtherRes.status, landlordAApproveOtherRes.body.message);

  const landlordAApproveOwnRes = await request(`/api/bookings/${tenantABooking.id}/approve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${landlordAToken}` },
  });
  console.log('7 landlord approve own property booking', landlordAApproveOwnRes.status, landlordAApproveOwnRes.body.message);

  const landlordAApproveOtherAgainRes = await request(`/api/bookings/${tenantBBooking.id}/approve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${landlordAToken}` },
  });
  console.log('8 landlord approve another landlord booking', landlordAApproveOtherAgainRes.status, landlordAApproveOtherAgainRes.body.message);

  const adminListRes = await request('/api/bookings/admin', {
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log('9 admin view all bookings', adminListRes.status, adminListRes.body.message);

  const unauthRes = await request('/api/bookings');
  console.log('10 unauthenticated protected booking request', unauthRes.status, unauthRes.body.message);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
