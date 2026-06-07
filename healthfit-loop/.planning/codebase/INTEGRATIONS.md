# External Integrations

**Analysis Date:** 2026-06-07

## APIs & External Services

**AI & Generative:**
- OpenAI GPT - Meal/workout plan generation and chat interface
  - SDK/Client: `openai` (5.15.0)
  - Auth: `GPT_KEY` environment variable
  - Model: `gpt-4o-mini` (used in `src/app/api/chat/route.ts`)
  - Tool functions: Retrieves meal plans, workout plans, nutrition data, consumption logs

- Perplexity AI - Restaurant menu extraction and grocery price searching
  - SDK/Client: Custom client `src/lib/external/perplexity-client.ts`
  - Auth: `PERPLEXITY_API_KEY` environment variable
  - Endpoints: `https://api.perplexity.ai/chat/completions`
  - Purpose: Search for restaurant menus, dietary info, and grocery store prices

- Anthropic Claude (installed but not integrated)
  - SDK/Client: `@anthropic-ai/sdk` (0.102.0)
  - Status: Dependency present but not used in active codebase

**Search & Location:**
- Google Places API - Restaurant discovery and location geocoding
  - SDK/Client: Custom client `src/lib/external/places-client.ts`
  - Auth: `GOOGLE_PLACES` environment variable
  - Endpoints: 
    - `https://maps.googleapis.com/maps/api/place/*` - Places API
    - `https://maps.googleapis.com/maps/api/geocode/json` - Geocoding
  - Purpose: Search restaurants by cuisine/location, geocode addresses, get restaurant details

**Image Management:**
- Pexels API - Food and exercise imagery
  - SDK/Client: Custom client `src/lib/external/pexels-client.ts` with retry logic
  - Auth: `PEXELS_API_KEY` environment variable
  - Endpoints: `https://api.pexels.com/v1/search`
  - Purpose: Search and cache food dish images and workout exercise images
  - Caching: Local database cache to reduce API calls (tables: `FoodImage`, `WorkoutImage`)

**Search (Installed, unused):**
- Tavily Search - Web search capability
  - SDK/Client: `tavily` (1.0.2)
  - Status: Dependency installed but not integrated in source code

**Waitlist Management:**
- Airtable - Email waitlist storage
  - Auth: `AIRTABLE_API_KEY` environment variable
  - Base ID: `AIRTABLE_BASE_ID` environment variable
  - Table ID: `AIRTABLE_WAITLIST_TABLE_ID` environment variable
  - Endpoint: `https://api.airtable.com/v0/{BASE_ID}/{TABLE_ID}`
  - Used in: `src/app/api/waitlist/route.ts`

## Data Storage

**Databases:**
- PostgreSQL (primary)
  - Connection: `DATABASE_URL` environment variable
  - Client: Prisma ORM (`@prisma/client` 6.13.0)
  - Schema: `prisma/schema.prisma`
  - Tables: User profiles, survey responses, meal plans, workout plans, exercise library, consumption logs, feedback, etc.

**File Storage:**
- Local filesystem only
- Remote images served via Next.js image optimization from `images.unsplash.com`

**Caching:**
- In-database caching tables:
  - `RestaurantCache` - Restaurant search results with expiry
  - `MenuCache` - Restaurant menu data with expiry
  - `FoodImage` - Cached food images with hit count and last used timestamp
  - `WorkoutImage` - Cached exercise images with hit count and last used timestamp
  - `Recipe` - Cached recipe data with usage tracking
- No external cache service (Redis/Memcached) detected

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based authentication
  - Implementation: `src/lib/auth.ts` handles JWT token generation and validation
  - Token handling: `jose` library (6.0.13) for JWT creation/verification
  - User sessions: `UserSession` table in PostgreSQL

**Session Management:**
- Cookies-based session tracking
  - `user_id` - Authenticated user identifier
  - `guest_session` - Anonymous session ID
  - `survey_id` - Current survey response identifier
  - `meal_plan_id` - Current meal plan ID
  - `workout_plan_id` - Current workout plan ID

**Password Management:**
- bcryptjs (3.0.2) for password hashing
- Password reset tokens with expiry (`passwordResetToken`, `passwordResetExpiry` in User model)
- Email verification tokens (`verificationToken` in User model)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Datadog, etc.)

**Logs:**
- Console logging throughout codebase
- Prisma logging: `warn` and `error` levels configured in `src/lib/db.ts`
- Service-specific logging prefixes: `[PERPLEXITY]`, `[PEXELS]`, `[Email]`, `[GooglePlaces]`, etc.

## CI/CD & Deployment

**Hosting:**
- Vercel (inferred from `next.config.ts` and deployment patterns)
- Environment variable: `VERCEL_URL` available at runtime

**Build Process:**
- `npm run build` - Compiles TypeScript, generates Prisma client, builds Next.js
- `npm run postinstall` - Auto-generation of Prisma client types

**Development:**
- Turbopack-enabled dev server for faster rebuilds

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string
- `GPT_KEY` - OpenAI API key
- `PERPLEXITY_API_KEY` - Perplexity API key
- `PEXELS_API_KEY` - Pexels image API key
- `GOOGLE_PLACES` - Google Places API key
- `AIRTABLE_API_KEY` - Airtable API token
- `AIRTABLE_BASE_ID` - Airtable base identifier
- `AIRTABLE_WAITLIST_TABLE_ID` - Airtable waitlist table ID
- `SMTP_HOST` - Email server hostname (default: `smtp.gmail.com`)
- `SMTP_PORT` - Email server port (default: `587`)
- `SMTP_USER` - Email account username
- `SMTP_PASSWORD` - Email account password
- `NEXT_PUBLIC_APP_URL` - Public application URL (exposed to client)
- `NODE_ENV` - Runtime environment (`development` or `production`)

**Optional env vars:**
- `VERCEL_URL` - Vercel deployment URL (auto-set by Vercel)

**Secrets location:**
- `.env` file (Git-ignored, not committed)
- In production: Environment variables configured in hosting platform (Vercel dashboard, Docker env, etc.)

## Webhooks & Callbacks

**Incoming:**
- Dashboard ready email callback - Triggered when survey completion generates meal/workout plans
  - Route: `src/app/api/email/dashboard-ready/route.ts`
  - Sends formatted HTML email with dashboard link

**Outgoing:**
- No detected outgoing webhooks to external services
- Internal fetch-based tool calls in OpenAI function calling (within `src/app/api/chat/route.ts`)

---

*Integration audit: 2026-06-07*
