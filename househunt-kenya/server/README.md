# HouseHunt Kenya - Backend (scaffold)

This folder contains a minimal Express + Mongoose backend scaffold.

To run:

```bash
cd server
npm install
cp .env.example .env
# edit .env if needed, then:
npm run dev
```

To run the backend tests:

```bash
npm test
```

## Daraja M-PESA sandbox

Configure `MPESA_ENV=sandbox`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`,
`MPESA_SHORTCODE`, and `MPESA_PASSKEY` in the server environment. Set
`MPESA_CALLBACK_URL` to the public HTTPS endpoint
`https://<public-host>/api/payments/mpesa/callback`; a local-only URL cannot
receive Daraja callbacks. Keep credentials out of source control and restart
the backend after changing its environment.

## Property contact unlocks and listing boosts

Property payments use the same server-initiated Daraja STK Push flow. Tenants
can unlock a property's full street address and landlord contact details;
landlords can boost their own approved, available listing for 30 days. The
benefit is granted only after Daraja confirms the payment by callback or STK
query. Prices are server-controlled using `PROPERTY_UNLOCK_FEE_KES` (default
`100`) and `PROPERTY_BOOST_FEE_KES` (default `200`). Set these values in the
server environment, not in the browser. Live collections require Safaricom
production credentials and approval; sandbox credentials are for testing only.
The application does not collect rent, deposits, or booking payments. Legacy
booking-payment records are retained for history only. There are no booking
payment creation, listing, or STK API endpoints; legacy callbacks may update a
payment's transaction record but do not update a booking's payment or
availability state.

For a sandbox end-to-end check, configure the Daraja environment and public
HTTPS callback, then unlock an approved listing as a tenant using a
Daraja-supported sandbox phone number. Approve the STK prompt; the callback or
the in-app status query should grant access only after Daraja confirms success.
Landlords can use the same flow to boost their own approved available listings.

## Tenancy completion

After a tenancy ends, either the tenant or landlord can request completion from
the approved booking. The other party must confirm before the booking becomes
`COMPLETED`; when no other active confirmed booking remains, the listing becomes
available again. Either party may withdraw their own unconfirmed request.
Booking approval marks a listing taken only after the landlord confirms the
arrangement with the tenant. A pending tenant request does not reserve the
property. Landlords can also update availability for arrangements made outside
HouseHunt with `PATCH /api/properties/:id/status`; only the owner of an
approved listing can make that change, and active confirmed bookings prevent
marking it available. Admins can explicitly resolve disputed active bookings
through `PATCH /api/bookings/:id/admin-resolve`, with an audit entry.

Landlords can reconfirm an approved available listing with
`POST /api/properties/:id/confirm-availability`. The confirmation timestamp is
shown on listing cards and property details so tenants can assess how recently
availability was checked. Listings that have not been confirmed show that
status explicitly; booking completion or admin status changes do not count as a
landlord confirmation.

Tenants and landlords coordinate tenancy arrangements directly with each
other. HouseHunt records interest and listing status; it does not verify
arrangements, collect landlord payments, or provide refunds.

Endpoints are exposed under `/api/*`.

## Property discovery filters

`GET /api/properties` supports `county`, `town`, `bedrooms`, and a comma-separated
`amenities` list (`wifi`, `parking`, `water`, `electricity`, `security`,
`balcony`, `furnished`, `petFriendly`). Multiple amenities are combined with
AND matching. Use `sort=featured` (default), `sort=newest`, or
`sort=recently-confirmed`; the last places available listings first and orders
them by the latest landlord availability confirmation. Existing `page` and
`limit` parameters continue to paginate the filtered results.

## Password recovery

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and
`FRONTEND_URL` in the server environment to enable email password recovery.
Set `SMTP_SECURE=true` for SMTP providers requiring implicit TLS (commonly port
465); use `false` for STARTTLS providers (commonly port 587). The reset link is
single-use and expires after 30 minutes. Reset requests always return a generic
response to avoid disclosing whether an email address has an account.
