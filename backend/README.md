# Campus Market Backend

## What you have (secure foundation)
- **Express + TypeScript** API
- **MongoDB (Mongoose)** connection
- **Security middleware**: Helmet, CORS allowlist, global rate limit, NoSQL input sanitization
- **Auth**:
  - Register (bcrypt salt rounds **12**)
  - Email verification token (10 min expiry)
  - Login (requires verified email)
  - Access JWT (short-lived) + **rotating refresh tokens** (stored hashed in DB)
  - Logout (revokes refresh)
  - Forgot/reset password (10 min expiry, revokes refresh tokens)
- **Payments**:
  - **Paystack**: initialize transaction + redirect; webhook verifies HMAC and marks orders `paid` (GHS, pesewas)
  - **Stripe** (optional): Checkout Session + webhook (legacy)

## Quick start
1. Copy env file:

```bash
cd backend
copy .env.example .env
```

2. Fill in **at least**:
- `MONGODB_URI`
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (use long random strings, 32+ chars)
- `APP_ORIGIN` (your frontend URL)

3. Run:

```bash
npm run dev
```

Health check: `GET /health`

## API routes
### Auth (`/api/auth`)
- `POST /register` { email, password, role }
- `POST /verify-email` { token }
- `POST /login` { email, password }
- `POST /refresh` { refreshToken? } (or uses `refreshToken` httpOnly cookie)
- `POST /logout`
- `POST /forgot-password` { email }
- `POST /reset-password` { token, newPassword }

### Payments (`/api/payments`)
- `POST /paystack/initialize` { orderId } → `{ authorizationUrl, reference }` (requires Bearer; set `PAYSTACK_SECRET_KEY`)
- `POST /paystack/webhook` (Paystack dashboard → this URL; raw JSON body for signature verification)
- `POST /create-checkout-session` (Stripe; optional)
- `POST /stripe/webhook` (Stripe; optional)

