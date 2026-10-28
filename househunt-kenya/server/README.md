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

## Property photos and videos

Landlords upload JPEG, PNG, WebP, or AVIF photos and MP4, WebM, or MOV videos
through `POST /api/uploads/property-media`. Uploads require an authenticated
landlord account, are limited to 50 MB per file, and are stored in the
`househunt/properties/<landlord-id>` Cloudinary folder. The server verifies the
file signature and returns optimized delivery URLs: photos are limited to
1920 × 1440, videos to 1280 × 720, and Cloudinary selects efficient formats
and quality for delivery. A listing can reference up to 20 media files.

Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
`CLOUDINARY_API_SECRET` in the backend environment. Keep the API secret on the
server and never expose it to the frontend. Existing image-only listings
continue to display; new media references are stored with the listing.

## Tenancy completion

After a tenancy ends, either the tenant or landlord can request completion from
the approved booking. The other party must confirm before the booking becomes
`COMPLETED`; when no other active confirmed booking remains, the listing becomes
available again. Standard completion is available only after the agreed lease
term ends; an earlier end must use the early termination process. Either party
may withdraw their own unconfirmed request.
For an early end, only the landlord can submit a reasoned request through
`PATCH /api/bookings/:id/termination`. The tenant can agree, dispute, or wait;
agreement ends the tenancy, while a dispute keeps it active for admin review.
Each request and response is retained in the booking's termination history.
An admin resolves a disputed request with `END_TENANCY` or `KEEP_ACTIVE` through
`PATCH /api/bookings/:id/termination/admin-resolve`. The reason, response, and
resolution are retained on the booking and actions are written to the audit log.
Open requests and disputes are shown in both parties' booking views; there is no
separate email or push-notification delivery.
Booking approval marks a listing taken only after the landlord confirms the
arrangement with the tenant. A pending tenant request does not reserve the
property. For an arrangement made outside HouseHunt, the landlord must record
the tenant name, move-in date, and lease duration when marking an available
listing taken with `PATCH /api/properties/:id/status`. The details are retained
in the property's external tenancy history and are not exposed in public listing
responses. After the recorded lease term ends, the landlord must explicitly
confirm the property is vacant before marking it available. Active HouseHunt
bookings and external tenancies cannot be bypassed by a direct status change.
Admins can take listings offline, but availability must be resolved through
the active booking or external tenancy; corrections to legacy occupancy require
an explicit admin vacancy confirmation. Admins can resolve disputed active
bookings through `PATCH /api/bookings/:id/admin-resolve`, with an audit entry.

Landlords can reconfirm an approved available listing with
`POST /api/properties/:id/confirm-availability`. The confirmation timestamp is
shown on listing cards and property details so tenants can assess how recently
availability was checked. Listings that have not been confirmed show that
status explicitly; booking completion or admin status changes do not count as a
landlord confirmation.

Tenants signed in to HouseHunt can report an approved listing that is still
shown as available but may no longer be available. Reports are submitted with
`POST /api/availability-reports/properties/:propertyId`, and an admin can
review the queue with `GET /api/availability-reports` and close a report with
`PATCH /api/availability-reports/:id` using `status: "RESOLVED"` or
`"DISMISSED"` and an optional `resolutionNote`. Duplicate open reports from
the same tenant for the same listing are blocked. Reports are recorded for
admin review and never change a property's availability automatically.

Tenants and landlords coordinate tenancy arrangements directly with each
other. HouseHunt records interest and listing status; it does not verify
arrangements, collect landlord payments, or provide refunds.

## Listing quality review

Admins can review advisory listing-quality signals at
`GET /api/properties/quality-review` and dismiss a false positive with
`PATCH /api/properties/:id/quality-review/dismiss`. Signals cover short
descriptions, missing photos or estate/neighbourhood, exact potential
duplicates by landlord and property details, and strong price outliers when
there are at least three other approved, available comparable listings in the
same town and property type; the listing being reviewed is excluded from the
comparison median. These checks are not proof of misconduct and never automatically hide
or reject a listing. Admins may separately take a listing offline through the
existing status controls. Editing a listing clears any prior dismissal so it
can be assessed again.

Endpoints are exposed under `/api/*`.

## Authentication sessions

Browser sign-in and registration use a seven-day JWT in the HttpOnly
`househunt_session` cookie; the token is not returned in the JSON response or
stored in browser storage. The browser sends credentials and the
`X-HouseHunt-Request: 1` header with API requests. Cookie-authenticated
state-changing requests are rejected without that header, and credentialed
CORS accepts only the configured frontend origins.

`POST /api/auth/logout` invalidates the current token version and clears the
cookie. Token-version revocation signs the account out on all devices.
Changing a password increments the token version and issues a replacement
cookie for the current browser. Password reset continues to invalidate all
existing sessions. HTTPS deployments must preserve the request's HTTPS
protocol through the reverse proxy so the cookie is marked Secure; the cookie
uses SameSite=None for secure requests and SameSite=Lax for local HTTP.

## Property discovery filters

`GET /api/properties` supports `county`, `town`, `bedrooms`, and a comma-separated
`amenities` list (`wifi`, `parking`, `water`, `electricity`, `security`,
`balcony`, `furnished`, `petFriendly`). Multiple amenities are combined with
AND matching. Use `sort=featured` (default), `sort=newest`, or
`sort=recently-confirmed`; the last places available listings first and orders
them by the latest landlord availability confirmation. Existing `page` and
`limit` parameters continue to paginate the filtered results.

## Saved homes

Signed-in users can view saved listing IDs with `GET /api/users/saved-homes`,
save a listing with `POST /api/users/saved-homes/:propertyId`, or remove it with
`DELETE /api/users/saved-homes/:propertyId`. Saved listing references are
stored on the authenticated account and load across devices. Saved homes are
not available while signed out and are never written to browser storage.

Landlords can save their primary phone, WhatsApp number, and social usernames
in the Contact & Social Media section of their profile. These details are
returned with a property only when its contact information is unlocked by the
tenant, or when viewed by the listing owner or an admin.

## Password recovery

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and
`FRONTEND_URL` in the server environment to enable email password recovery.
Set `SMTP_SECURE=true` for SMTP providers requiring implicit TLS (commonly port
465); use `false` for STARTTLS providers (commonly port 587). The reset link is
single-use and expires after 30 minutes. Reset requests always return a generic
response to avoid disclosing whether an email address has an account.
