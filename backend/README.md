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
- **Payments skeleton**:
  - Create Stripe Checkout Session (server-side)
  - Stripe webhook endpoint with signature verification (raw body)

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
- `POST /create-checkout-session` (requires `Authorization: Bearer <accessToken>`)
- `POST /stripe/webhook` (Stripe calls this)

