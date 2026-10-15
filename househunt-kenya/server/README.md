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

For an end-to-end check, approve a property, create and approve a tenant booking,
then send an STK Push from the tenant booking screen using a Daraja-supported
sandbox phone number. The callback updates the payment automatically. The
tenant can also use **Check payment status** to query Daraja when a callback is
delayed; confirmed success or failure is reflected in the booking, while an
unfinished request remains pending.

## Tenancy completion

After a tenancy ends, either the tenant or landlord can request completion from
the approved booking. The other party must confirm before the booking becomes
`COMPLETED` and the property can become available for relisting. Either party
may withdraw their own unconfirmed request. A pending M-PESA payment blocks
completion, and new payments are blocked while a completion request is active.
Completing a booking does not change or refund payment records.

Endpoints are exposed under `/api/*`.

## Password recovery

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and
`FRONTEND_URL` in the server environment to enable email password recovery.
Set `SMTP_SECURE=true` for SMTP providers requiring implicit TLS (commonly port
465); use `false` for STARTTLS providers (commonly port 587). The reset link is
single-use and expires after 30 minutes. Reset requests always return a generic
response to avoid disclosing whether an email address has an account.
