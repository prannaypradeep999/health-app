# Technology Stack

**Analysis Date:** 2026-06-07

## Languages

**Primary:**
- TypeScript 5.x - All application code (frontend, API routes, utilities)
- JavaScript - Configuration files (ESLint, PostCSS, Next.js config)

**Secondary:**
- SQL - Database queries via Prisma ORM

## Runtime

**Environment:**
- Node.js (server-side execution)
- Next.js runtime: `nodejs` (configured explicitly in API routes like `src/app/api/chat/route.ts`)

**Package Manager:**
- npm (version locked via `package-lock.json`)
- Lockfile: Present

## Frameworks

**Core:**
- Next.js 16.1.0 - Full-stack React framework with API routes
- React 19.1.0 - UI library
- React DOM 19.1.0 - DOM rendering

**UI Components & Styling:**
- Tailwind CSS 4.1.12 - Utility-first CSS framework
- Radix UI (v1.1-2.2) - Headless component library (`@radix-ui/*` packages)
- Lucide React 0.540.0 - Icon library
- Phosphor Icons React 2.1.10 - Additional icon library
- Framer Motion 12.24.0 - Animation library

**Forms & Input:**
- React Hook Form 7.66.0 - Form state management
- Input OTP 1.4.2 - OTP input component
- Zod 3.25.76 - Schema validation (used in `src/lib/schemas.ts`)

**Data Display:**
- Recharts 3.3.0 - Chart and graph library
- React Day Picker 9.13.0 - Date picker component
- Embla Carousel React 8.6.0 - Carousel/slider component

**Content & Layout:**
- React Markdown 10.1.0 - Markdown rendering
- React Resizable Panels 3.0.6 - Resizable panel layouts
- Sonner 2.0.7 - Toast notification library
- Vaul 1.1.2 - Drawer/sheet component

**Utilities:**
- CLSX 2.1.1 - Class name utility
- Class Variance Authority 0.7.1 - CSS-in-JS variant helper
- Tailwind Merge 3.3.1 - Tailwind class merging
- cmdk 1.1.1 - Command/command palette component
- nanoid 5.1.5 - ID generation

**Development Tools:**
- Tailwind CSS 4 - CSS framework with PostCSS integration
- ESLint 9 with Next.js config - Linting
- TypeScript compiler (5.x) - Type checking
- LightningCSS 1.32.0 and Darwin ARM64 variant - CSS processing

## Key Dependencies

**Critical:**
- @prisma/client 6.13.0 - Database ORM (schema in `prisma/schema.prisma`)
- jose 6.0.13 - JWT token handling for authentication

**AI & API Integration:**
- openai 5.15.0 - OpenAI GPT API client (used in `src/app/api/chat/route.ts` with model `gpt-4o-mini`)
- @anthropic-ai/sdk 0.102.0 - Anthropic Claude API (installed but not currently used in source)
- @anthropic-ai/claude-code 1.0.113 - Claude Code integration (installed but not actively used)
- tavily 1.0.2 - Tavily search API (installed but not actively used)

**Authentication & Security:**
- bcryptjs 3.0.2 - Password hashing
- dotenv 17.2.4 - Environment variable loading

**Email:**
- nodemailer 8.0.1 - SMTP email sending (configured in `src/lib/email.ts`)
- @types/nodemailer 7.0.9 - TypeScript types

**Theming:**
- next-themes 0.4.6 - Dark mode and theme management

## Configuration

**Environment:**
- Environment variables via `.env` file (not committed)
- Uses `NEXT_PUBLIC_*` prefix for client-side exposed vars
- Critical server vars: `DATABASE_URL`, `GPT_KEY`, `PERPLEXITY_API_KEY`, `PEXELS_API_KEY`, `GOOGLE_PLACES`, SMTP credentials, Airtable API key

**Build:**
- `next.config.ts` - Next.js configuration (TypeScript)
  - Image optimization: Remote patterns for Unsplash (`images.unsplash.com`)
  - ESLint and TypeScript errors ignored during build (see config at `src/app/api/chat/route.ts`)
- `tsconfig.json` - TypeScript compiler options
  - Path alias: `@/*` maps to `./src/*`
  - Strict mode enabled
  - No emit (relies on Next.js build)
- `tailwind.config.ts` - Tailwind customization
  - Brand colors (FYTR blue #4338CA, red #DC2626)
  - Custom gradients: `fytr-gradient`, `fytr-gradient-reverse`
  - Custom animations (fadeIn)
- `postcss.config.mjs` - PostCSS configuration with Tailwind CSS plugin
- `eslint.config.mjs` - ESLint flat config extending Next.js core-web-vitals and TypeScript

## Platform Requirements

**Development:**
- Node.js runtime (version not specified in package.json, uses latest LTS convention)
- Turbopack enabled for faster dev builds (`npm run dev` uses `--turbopack` flag)

**Production:**
- PostgreSQL database (specified in `prisma/schema.prisma`)
- Vercel or Node.js server (Next.js can run on Vercel or self-hosted Node)
- Environment variables must be configured

**Build Commands:**
- `npm run dev` - Development with Turbopack
- `npm run build` - Production build (runs `prisma generate` then `next build`)
- `npm run postinstall` - Auto-generates Prisma client after install
- `npm start` - Production server
- `npm run lint` - ESLint linting

---

*Stack analysis: 2026-06-07*
