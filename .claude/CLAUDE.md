# LMS Platform - Claude Development Guide

## Truth Seeker MCP Tools Available

**You have access to powerful validation tools!** See `TRUTH_SEEKER_INTEGRATION.md` for complete documentation.

### Quick Reference - When to Use Truth Seeker

| Situation | Tool to Use | Why |
|-----------|-------------|-----|
| 🚨 **Before ANY migration** | `mcp__truth-seeker__validate_migration_safety` | Prevents breaking production! |
| 🔍 Adding new env vars | `mcp__truth-seeker__validate_env_variables` | Ensures documentation & no secrets |
| 🏗️ After schema changes | `mcp__truth-seeker__validate_orm_model` | Verifies ORM matches database |
| 🔌 External API issues | `mcp__truth-seeker__validate_api_contract` | Validates API responses |
| 📝 Before deployment | `mcp__truth-seeker__validate_env_variables` + `.env` | Ensures all vars are set |

### Critical Safety Pattern

**NEVER run a migration without this check:**

```typescript
// ALWAYS do this before migrations!
const safetyCheck = await mcp__truth-seeker__validate_migration_safety({
  migrationSql: "YOUR SQL HERE",
  codebasePath: "app/"
});

if (!safetyCheck.safe) {
  console.error(`🚨 STOP! This will break ${safetyCheck.impact.filesAffected} files!`);
  // Update code FIRST, then run migration
}
```

### Example: Real Bug Caught

A recent validation prevented disaster:
```
Migration: DROP COLUMN instructor_id
Impact: 62 files, 125 references
Systems affected:
  - Stripe payment webhooks
  - Instructor earnings calculation
  - Course enrollment
  - Revenue sharing
Status: 🚨 BLOCKED - would have broken production
```

---

## Project Overview

This is a Next.js-based Learning Management System (LMS) with:
- Course creation and management
- Instructor earnings & revenue sharing
- Student enrollment & progress tracking
- Stripe payment integration
- AI-powered course generation
- Email notifications
- Blog system

## Key Technologies

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL (via Neon)
- **ORM**: Drizzle
- **Payments**: Stripe
- **Auth**: Custom session-based
- **Email**: Resend + React Email
- **AI**: OpenAI API
- **Storage**: Vercel Blob

## Database Schema

See `courses_schema_full.txt` for complete schema.

**Core tables**:
- `users` - User accounts and profiles
- `courses` - Course catalog
- `chapters` - Course structure
- `lessons` - Lesson content
- `enrollments` - Student enrollments
- `instructor_earnings` - Revenue tracking
- `stripe_*` - Payment tracking

---

## Development Patterns

### Environment Variables

**Use Truth Seeker to audit env vars:**
```typescript
mcp__truth-seeker__validate_env_variables({
  codebasePath: "app/",
  envExamplePath: ".env.email.example",
  checkHardcodedSecrets: true
})
```

**Current env vars in use** (from Truth Seeker scan):
- `DATABASE_URL` - PostgreSQL connection
- `STRIPE_SECRET_KEY` - Payment processing
- `OPENAI_API_KEY` - AI features
- `BLOB_READ_WRITE_TOKEN` - File storage
- `BETA_PASSWORD` - Beta access control
- `CRON_SECRET` - Scheduled jobs
- `NODE_ENV` - Environment mode
- Plus email vars from `.env.email.example`

### Database Migrations

**Location**: `lib/db/migrations/` (if exists) or manual SQL

**Safe migration workflow**:
1. Write migration SQL
2. **Validate safety** with Truth Seeker
3. Update code if needed
4. Run migration
5. **Verify ORM** with Truth Seeker

### API Routes

**Pattern**: `app/api/[resource]/route.ts`

Common patterns:
- GET - List/fetch resources
- POST - Create resources
- PATCH/PUT - Update resources
- DELETE - Remove resources

**Before changing API responses**, use:
```typescript
mcp__truth-seeker__validate_api_types({
  typeFilePath: "types/api.ts",
  typeName: "CourseResponse",
  apiUrl: "http://localhost:3000/api/courses/123",
  method: "GET"
})
```

---

## Common Tasks

### Adding a New Course Field

1. **Check migration safety**:
```typescript
mcp__truth-seeker__validate_migration_safety({
  migrationSql: "ALTER TABLE courses ADD COLUMN new_field TEXT;",
  codebasePath: "app/"
})
```

2. Run migration (if safe)
3. Update `lib/db/schema/courses.ts`
4. **Verify ORM**:
```typescript
mcp__truth-seeker__validate_orm_model({
  modelFilePath: "lib/db/schema/courses.ts",
  tableName: "courses"
})
```
5. Update UI components

### Debugging Stripe Webhooks

When webhooks fail, validate the contract:
```typescript
mcp__truth-seeker__validate_api_contract({
  url: "https://api.stripe.com/v1/...",
  method: "GET",
  headers: { "Authorization": "Bearer sk_..." },
  expectedResponseSchema: { /* your expected schema */ }
})
```

### Pre-Deployment Checklist

Run these validations:
```typescript
// 1. Environment vars
mcp__truth-seeker__validate_env_variables({
  codebasePath: "app/",
  envExamplePath: ".env.email.example",
  envPath: ".env"
})

// 2. Infrastructure
mcp__truth-seeker__audit_connectivity_batch({
  resources: [{ type: "db", connectionString: process.env.DATABASE_URL }]
})
```

---

## File Structure

```
app/
  ├── admin/           - Admin dashboard & management
  ├── instructor/      - Instructor tools & earnings
  ├── learn/           - Student course viewing
  ├── api/             - API routes
  │   ├── courses/     - Course CRUD
  │   ├── stripe/      - Payment webhooks
  │   └── instructor/  - Instructor APIs
  ├── blog/            - Blog system
  └── pricing/         - Pricing tiers

components/
  ├── instructor/      - Course builder & management
  ├── student/         - Learning interface
  └── layout/          - Shared layouts

lib/
  ├── db/              - Database schemas & queries
  ├── stripe/          - Payment integration
  └── ai/              - AI integrations
```

---

## Safety Rules

1. **NEVER drop columns without Truth Seeker validation**
2. **ALWAYS check env vars before adding new ones**
3. **VERIFY ORM models after schema changes**
4. **TEST payment webhooks in staging first**
5. **VALIDATE external API contracts regularly**

---

## Getting Started

1. Review `TRUTH_SEEKER_INTEGRATION.md` for validation tools
2. Check current schema: `courses_schema_full.txt`
3. Understand payment flow: `app/api/stripe/webhooks/route.ts`
4. See email templates: `emails/`

---

## Need Help?

- Truth Seeker tools: See `TRUTH_SEEKER_INTEGRATION.md`
- Email setup: See `EMAIL_SETUP_CHECKLIST.md`
- Blog workflow: See `BLOG_WORKFLOW.md`
- Migration guide: See `MIGRATION_STATUS.md`

**Most Important**: Use Truth Seeker proactively to prevent bugs, not just fix them!
