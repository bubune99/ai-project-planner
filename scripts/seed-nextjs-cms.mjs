/**
 * Seed NextJS CMS Project
 * Creates the nextjs-cms project with full context for AI Project Planner
 *
 * Usage: node scripts/seed-nextjs-cms.mjs
 */

import { neon } from '@neondatabase/serverless'
import dotenv from 'dotenv'

dotenv.config()

const sql = neon(process.env.DATABASE_URL)

async function seedNextJSCMS() {
  console.log('🌱 Seeding NextJS CMS project...\n')

  try {
    // 0. Clean up any existing NextJS CMS project
    console.log('🧹 Cleaning up existing data...')
    const existing = await sql`SELECT id FROM projects WHERE name LIKE 'NextJS CMS%'`
    for (const p of existing) {
      await sql`DELETE FROM execution_history WHERE project_id = ${p.id}`
      await sql`DELETE FROM architecture_decisions WHERE project_id = ${p.id}`
      await sql`DELETE FROM step_dependencies WHERE step_id IN (SELECT id FROM project_steps WHERE project_id = ${p.id})`
      await sql`DELETE FROM project_steps WHERE project_id = ${p.id}`
      await sql`DELETE FROM project_phases WHERE project_id = ${p.id}`
      await sql`DELETE FROM tech_stack_items WHERE project_id = ${p.id}`
      await sql`DELETE FROM business_context WHERE project_id = ${p.id}`
      await sql`DELETE FROM projects WHERE id = ${p.id}`
      console.log(`   Deleted project: ${p.id}`)
    }
    if (existing.length === 0) console.log('   No existing data to clean')
    console.log('')

    // 1. Create Project
    console.log('📦 Creating project...')

    // Get the user account (Bubune Owusu)
    const [user] = await sql`SELECT id FROM users WHERE email = 'bubuneo99@gmail.com' LIMIT 1`
    if (!user) {
      throw new Error('User not found - please ensure you are logged in to the platform')
    }
    console.log(`   Assigning to user: ${user.id}`)

    const metadata = {
      package_name: '@cncpt/cms',
      editions: {
        CE: { status: 'COMPLETE', description: 'Community Edition - MVP Ready' },
        ME: { status: 'IN_PROGRESS', description: 'Managed Edition - Platform hosting' }
      },
      architecture: 'monorepo-package',
      exports: ['@cncpt/cms', '@cncpt/cms/admin', '@cncpt/cms/ui', '@cncpt/cms/hooks', '@cncpt/cms/lib', '@cncpt/cms/puck']
    }

    const [project] = await sql`
      INSERT INTO projects (
        user_id, name, description, status, priority,
        start_date, github_repo_url, metadata
      ) VALUES (
        ${user.id},
        'NextJS CMS (@cncpt/cms)',
        'Next.js 16 headless CMS with e-commerce, visual page builder (Puck), blog system, plugin architecture, and AI chat. Packaged as @cncpt/cms for reuse across projects.',
        'in-progress',
        'critical',
        '2024-12-01',
        'https://github.com/bubune99/nextjs-cms',
        ${JSON.stringify(metadata)}
      )
      RETURNING *
    `
    console.log(`✅ Project created: ${project.name} (${project.id})\n`)

    // 2. Create Business Context
    console.log('💼 Creating business context...')
    const successMetrics = [
      { metric: 'CE Completion', target: '100%', current: '100%' },
      { metric: 'ME Platform', target: '100%', current: '15%' },
      { metric: 'Package Exports', target: '6', current: '6' },
      { metric: 'CE Wiring Tasks', target: '3', current: '1' },
      { metric: 'Platform Adapters', target: '5', current: '0' }
    ]
    const riskAssessment = [
      { risk: 'Platform lock-in perception', impact: 'medium', mitigation: 'Open source CE, easy migration tools' },
      { risk: 'Competition from Shopify/WordPress', impact: 'high', mitigation: 'Puck migration funnel strategy - use Puck as Trojan horse' },
      { risk: 'VPS services sync complexity', impact: 'medium', mitigation: 'API-only integration, no admin UI duplication' }
    ]
    const stakeholders = [
      { name: 'bubun', role: 'Owner/Developer', priority: 'high' },
      { name: 'Agency Clients', role: 'End Users', priority: 'high' },
      { name: 'SMB Merchants', role: 'Target Market', priority: 'medium' }
    ]

    await sql`
      INSERT INTO business_context (
        project_id, vision, target_market, primary_use_case,
        revenue_model, competitive_advantage, success_metrics, risk_assessment, stakeholders
      ) VALUES (
        ${project.id},
        'Build a universal CMS engine that can be used as building blocks for any web project. Puck editor as Trojan horse - onboard clients from any platform, then migrate to full hosting.',
        'Web development agencies, freelancers building client sites, SMBs needing e-commerce with content management',
        'Agency toolkit - CMS used as starting point for client projects. Headful with Puck for client content editing. Plugin system for extensibility.',
        'Open Core model: CE (Community Edition) free and open source, ME (Managed Edition) SaaS at $15-20/mo flat rate. No hidden fees, no transaction percentages.',
        'Universal Puck editor works with any backend (Shopify, WordPress, etc.). Migration path to full platform. Package-based architecture for lightweight integration.',
        ${JSON.stringify(successMetrics)},
        ${JSON.stringify(riskAssessment)},
        ${JSON.stringify(stakeholders)}
      )
    `
    console.log('✅ Business context created\n')

    // 3. Create Tech Stack
    console.log('⚙️  Creating tech stack...')
    const techStack = [
      { name: 'Next.js 16', category: 'Framework', version: '16.x', rationale: 'App Router, React Server Components, optimal performance', documentation_url: 'https://nextjs.org/docs', order_index: 1 },
      { name: 'TypeScript', category: 'Language', version: '5.x', rationale: 'Type safety, better DX, catch bugs early', documentation_url: 'https://www.typescriptlang.org/docs/', order_index: 2 },
      { name: 'Puck Editor', category: 'Visual Builder', version: 'latest', rationale: 'Drag-and-drop page builder, works with any backend', documentation_url: 'https://puckeditor.com', order_index: 3 },
      { name: 'Prisma', category: 'ORM', version: '7.x', rationale: 'Type-safe database access, migrations, PostgreSQL support', documentation_url: 'https://www.prisma.io/docs', order_index: 4 },
      { name: 'PostgreSQL (Neon)', category: 'Database', version: '16', rationale: 'Serverless Postgres, branching for dev/preview', documentation_url: 'https://neon.tech/docs', order_index: 5 },
      { name: 'Stack Auth', category: 'Authentication', version: 'latest', rationale: 'Self-hostable auth, multi-tenant support', documentation_url: 'https://stack-auth.com/docs', order_index: 6 },
      { name: 'Stripe', category: 'Payments', version: 'latest', rationale: 'Payment processing, subscriptions, checkout', documentation_url: 'https://stripe.com/docs', order_index: 7 },
      { name: 'Shippo', category: 'Shipping', version: 'latest', rationale: 'Multi-carrier shipping rates and labels', documentation_url: 'https://goshippo.com/docs', order_index: 8 },
      { name: 'Cloudflare R2', category: 'Storage', version: 'latest', rationale: 'S3-compatible object storage, no egress fees', documentation_url: 'https://developers.cloudflare.com/r2/', order_index: 9 },
      { name: 'AI SDK (Vercel)', category: 'AI', version: '6.x', rationale: 'Multi-provider AI chat, streaming, tool use', documentation_url: 'https://sdk.vercel.ai/docs', order_index: 10 },
      { name: 'tsup', category: 'Build', version: 'latest', rationale: 'Package bundling for @cncpt/cms exports', documentation_url: 'https://tsup.egoist.dev', order_index: 11 },
    ]

    for (const tech of techStack) {
      await sql`
        INSERT INTO tech_stack_items (project_id, name, category, version, rationale, documentation_url, order_index)
        VALUES (${project.id}, ${tech.name}, ${tech.category}, ${tech.version}, ${tech.rationale}, ${tech.documentation_url}, ${tech.order_index})
      `
    }
    console.log(`✅ Tech stack created (${techStack.length} items)\n`)

    // 4. Create Project Phases
    console.log('📊 Creating project phases...')
    const phases = [
      { phase_name: 'ideation', status: 'completed', description: 'Initial CMS concept and architecture design' },
      { phase_name: 'architecture', status: 'completed', description: 'Database schema, API design, plugin system architecture' },
      { phase_name: 'construction', status: 'completed', description: 'Core CMS features, admin panel, e-commerce, AI chat' },
      { phase_name: 'testing', status: 'active', description: 'QA, bug fixes, wiring tasks, performance optimization' },
      { phase_name: 'deployment', status: 'active', description: 'Package refactor, ME platform integration' },
      { phase_name: 'maintenance', status: 'active', description: 'Ongoing: migrations, platform adapters, growth features' },
    ]

    for (const phase of phases) {
      await sql`
        INSERT INTO project_phases (project_id, phase_name, status, description, started_at)
        VALUES (${project.id}, ${phase.phase_name}, ${phase.status}, ${phase.description}, NOW())
      `
    }
    console.log(`✅ Phases created (${phases.length})\n`)

    // 5. Create Project Steps
    console.log('📋 Creating project steps...')
    const steps = [
      // Completed CE Features
      { title: 'Core Database Schema', description: 'Prisma schema with Products, Orders, Users, Pages, Blog, Plugins', status: 'completed', progress: 100, phase: 'CE Foundation', stage: 'Backend', estimated_hours: 24, actual_hours: 20, order_index: 1 },
      { title: 'Admin Dashboard', description: 'Full admin panel with all CRUD operations', status: 'completed', progress: 100, phase: 'CE Foundation', stage: 'Frontend', estimated_hours: 40, actual_hours: 45, order_index: 2 },
      { title: 'Puck Visual Editor', description: 'Page, Blog, and Email builders with Puck', status: 'completed', progress: 100, phase: 'CE Foundation', stage: 'Frontend', estimated_hours: 32, actual_hours: 30, order_index: 3 },
      { title: 'E-commerce System', description: 'Products, variants, cart, checkout, orders', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Full Stack', estimated_hours: 48, actual_hours: 50, order_index: 4 },
      { title: 'Stripe Integration', description: 'Payments, checkout, webhooks, product sync', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Backend', estimated_hours: 24, actual_hours: 22, order_index: 5 },
      { title: 'Shippo Integration', description: 'Shipping rates, labels, tracking', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Backend', estimated_hours: 16, actual_hours: 14, order_index: 6 },
      { title: 'Email Service', description: 'Multi-provider email (SMTP, SendGrid, Resend, etc.)', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Backend', estimated_hours: 20, actual_hours: 18, order_index: 7 },
      { title: 'Cart & Abandonment', description: 'Persistent cart, abandonment detection, recovery', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Full Stack', estimated_hours: 16, actual_hours: 15, order_index: 8 },
      { title: 'Discount System', description: 'Coupon codes, validation, Stripe sync', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Full Stack', estimated_hours: 12, actual_hours: 10, order_index: 9 },
      { title: 'AI Chat Assistant', description: 'Admin AI chat with context awareness, history', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Full Stack', estimated_hours: 24, actual_hours: 28, order_index: 10 },
      { title: 'Plugin System', description: 'Primitives, workflows, React Flow builder', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Full Stack', estimated_hours: 40, actual_hours: 45, order_index: 11 },
      { title: 'Media Library', description: 'R2/S3 storage, folders, tags, bulk operations', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Full Stack', estimated_hours: 20, actual_hours: 18, order_index: 12 },
      { title: 'RBAC System', description: 'Roles, permissions, role assignments, audit logging', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Backend', estimated_hours: 16, actual_hours: 14, order_index: 13 },
      { title: 'SEO Tools', description: 'JSON-LD structured data, meta tags, sitemap, robots.txt', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Frontend', estimated_hours: 8, actual_hours: 6, order_index: 14 },
      { title: 'Inventory Management', description: 'Stock alerts, back-in-stock notifications, reservations', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Full Stack', estimated_hours: 12, actual_hours: 10, order_index: 15 },
      { title: 'Reviews System', description: 'Product reviews, ratings, moderation', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Full Stack', estimated_hours: 10, actual_hours: 8, order_index: 16 },
      { title: 'Form Builder', description: 'Dynamic forms with validation and submission handling', status: 'completed', progress: 100, phase: 'CE Features', stage: 'Full Stack', estimated_hours: 14, actual_hours: 12, order_index: 17 },

      // Package Refactor
      { title: 'Package Refactor (@cncpt/cms)', description: 'Convert CMS to npm package with exports: main, admin, ui, hooks, lib, puck', status: 'completed', progress: 100, phase: 'Package', stage: 'Build', estimated_hours: 8, actual_hours: 6, order_index: 18 },

      // Wiring Tasks (from revised-status)
      { title: 'Cart Session Wiring', description: 'Connect cart to auth session for persistence', status: 'in-progress', progress: 50, phase: 'CE Wiring', stage: 'Backend', estimated_hours: 4, actual_hours: 2, order_index: 19 },
      { title: 'Form Email Integration', description: 'Wire form submissions to email service', status: 'pending', progress: 0, phase: 'CE Wiring', stage: 'Backend', estimated_hours: 4, actual_hours: 0, order_index: 20 },
      { title: 'Transactional Emails', description: 'Order events → email notifications (confirmation, shipping, etc.)', status: 'pending', progress: 0, phase: 'CE Wiring', stage: 'Backend', estimated_hours: 8, actual_hours: 0, order_index: 21 },

      // ME Platform - In Progress
      { title: 'Dokploy Integration', description: 'VPS frontend deployment via Dokploy API', status: 'completed', progress: 100, phase: 'ME Platform', stage: 'Backend', estimated_hours: 16, actual_hours: 14, order_index: 22 },
      { title: 'Stack Auth Self-Hosted', description: 'Configure self-hosted Stack Auth sync', status: 'in-progress', progress: 30, phase: 'ME Platform', stage: 'Backend', estimated_hours: 8, actual_hours: 2, order_index: 23 },
      { title: 'Stripe Billing Setup', description: 'Tenant subscription management', status: 'pending', progress: 0, phase: 'ME Platform', stage: 'Backend', estimated_hours: 16, actual_hours: 0, order_index: 24 },
      { title: 'Tenant Onboarding Flow', description: 'Signup, provisioning, initial setup wizard', status: 'pending', progress: 0, phase: 'ME Platform', stage: 'Full Stack', estimated_hours: 24, actual_hours: 0, order_index: 25 },
      { title: 'CMS Workspace Integration', description: 'Link @cncpt/cms as workspace dependency in cncpt-tenant', status: 'pending', progress: 0, phase: 'ME Platform', stage: 'Build', estimated_hours: 4, actual_hours: 0, order_index: 26 },

      // Admin Transformation (from admin-branch-plan)
      { title: 'Admin Branch Transformation', description: 'Transform admin for cncpt-tenant: Remove e-commerce, adapt Users→Tenants, Settings→Platform, add provisioning UI', status: 'pending', progress: 0, phase: 'ME Platform', stage: 'Full Stack', estimated_hours: 32, actual_hours: 0, order_index: 27 },

      // Future
      { title: 'Migrator MCP', description: 'AI-powered migration from Shopify/WordPress/WooCommerce/etc.', status: 'pending', progress: 0, phase: 'Growth', stage: 'Tool', estimated_hours: 40, actual_hours: 0, order_index: 28 },
      { title: 'Billing Wrapper Package', description: 'Reusable billing/tenant management subtree for any OSS→SaaS project', status: 'pending', progress: 0, phase: 'Growth', stage: 'Package', estimated_hours: 24, actual_hours: 0, order_index: 29 },
      { title: 'Platform Adapters', description: 'Puck adapters for Shopify, WordPress, WooCommerce backends', status: 'pending', progress: 0, phase: 'Growth', stage: 'Package', estimated_hours: 32, actual_hours: 0, order_index: 30 },
    ]

    for (const step of steps) {
      await sql`
        INSERT INTO project_steps (project_id, title, description, status, progress, phase, stage, estimated_hours, actual_hours, order_index, tasks)
        VALUES (${project.id}, ${step.title}, ${step.description}, ${step.status}, ${step.progress}, ${step.phase}, ${step.stage}, ${step.estimated_hours}, ${step.actual_hours}, ${step.order_index}, '[]')
      `
    }
    console.log(`✅ Created ${steps.length} steps\n`)

    // 6. Create Architecture Decisions
    console.log('🏛️  Creating architecture decisions...')
    const adrs = [
      {
        title: 'Package-based CMS Architecture',
        status: 'accepted',
        context: 'Need to reuse CMS components across multiple projects without carrying full codebase',
        decision: 'Convert CMS to @cncpt/cms npm package with granular exports (admin, ui, hooks, lib, puck)',
        consequences: 'Lighter projects, tree-shaking, clear API boundaries. Requires maintaining package exports.',
        tags: ['architecture', 'package', 'reusability']
      },
      {
        title: 'Workspace Link over Subtree',
        status: 'accepted',
        context: 'Both CMS and cncpt-tenant are in active MVP development, need fast iteration',
        decision: 'Use workspace link (file:../nextjs-cms) instead of git subtree for cncpt-tenant integration',
        consequences: 'Immediate changes reflected, easier development. Less isolation than subtree.',
        tags: ['architecture', 'monorepo', 'development']
      },
      {
        title: 'Puck Migration Funnel Strategy',
        status: 'accepted',
        context: 'Need to acquire clients from existing platforms (Shopify, WordPress) without friction',
        decision: 'Use Puck editor as universal frontend layer. Clients keep existing backend initially, migrate to full CMS later.',
        consequences: 'Lower barrier to entry, trust building period, natural upgrade path. Requires platform adapters.',
        tags: ['business', 'strategy', 'migration']
      },
      {
        title: 'VPS Services Architecture',
        status: 'accepted',
        context: 'ME platform needs auth, deployments, and other services without bloating control plane',
        decision: 'Host Stack Auth and Dokploy on VPS with their own admin UIs. Control plane (cncpt-tenant) connects via API only.',
        consequences: 'Clean separation, no bloat, services maintain their own admin. Requires API integration.',
        tags: ['architecture', 'infrastructure', 'saas']
      },
      {
        title: 'OSS to SaaS Pattern',
        status: 'accepted',
        context: 'Want reusable pattern for monetizing open source projects',
        decision: 'Subtree OSS project → Add billing wrapper (also reusable) → Connect to VPS services → Deploy',
        consequences: 'Repeatable pattern for any MIT project. Billing wrapper becomes its own reusable package.',
        tags: ['business', 'pattern', 'oss']
      },
      {
        title: 'Admin Branch Transformation',
        status: 'proposed',
        context: 'cncpt-tenant needs a super admin panel but CMS admin has e-commerce focus',
        decision: 'Create admin branch: remove Products/Orders/Blog/Shipping, adapt Users→Tenants, Settings→Platform, Analytics→Metrics, add tenant provisioning/billing/domain management UI',
        consequences: 'Clean platform admin without e-commerce bloat. Reuses shared components. Destination: merge into cncpt-tenant repo.',
        tags: ['architecture', 'admin', 'cncpt-tenant']
      },
      {
        title: 'Target Platform Priority',
        status: 'accepted',
        context: 'Need to prioritize which platforms to build Puck adapters and migrators for',
        decision: 'Priority order: 1) Shopify (huge market, expensive, clients want out), 2) WordPress (massive market, security/performance pain), 3) WooCommerce (same + e-commerce complexity), 4) Squarespace/Wix (clients outgrow them), 5) Custom legacy',
        consequences: 'Focus on highest-value migrations first. Build adapters incrementally.',
        tags: ['business', 'strategy', 'migration']
      }
    ]

    for (const adr of adrs) {
      await sql`
        INSERT INTO architecture_decisions (project_id, title, status, context, decision, consequences, tags, decided_at)
        VALUES (${project.id}, ${adr.title}, ${adr.status}, ${adr.context}, ${adr.decision}, ${adr.consequences}, ${adr.tags}, NOW())
      `
    }
    console.log(`✅ Created ${adrs.length} architecture decisions\n`)

    // 7. Create execution history
    console.log('📜 Creating execution history...')
    await sql`
      INSERT INTO execution_history (project_id, event_type, description)
      VALUES
        (${project.id}, 'project_created', 'NextJS CMS project initialized in AI Project Planner'),
        (${project.id}, 'status_changed', 'CE marked as complete - all core features implemented'),
        (${project.id}, 'ai_agent_action', 'Package refactor completed - @cncpt/cms exports ready'),
        (${project.id}, 'ai_agent_action', 'Seeded from agent-com: platform-status, roadmap-summary, revised-status'),
        (${project.id}, 'ai_agent_action', 'ADRs created from agent-com: oss-to-saas-pattern, puck-migration-funnel, package-refactor'),
        (${project.id}, 'ai_agent_action', 'Validated against agent-com: me-build-plan, admin-branch-plan, cncpt-tenant/planning'),
        (${project.id}, 'ai_agent_action', 'Added missing steps: RBAC, SEO, Inventory, Reviews, Forms, Wiring tasks, Platform adapters')
    `
    console.log('✅ Execution history created\n')

    // Summary
    console.log('='.repeat(60))
    console.log('✅ SUCCESS! NextJS CMS project seeded\n')
    console.log('📊 Summary:')
    console.log(`   Project ID: ${project.id}`)
    console.log(`   Name: ${project.name}`)
    console.log(`   Steps: ${steps.length}`)
    console.log(`   Tech Stack Items: ${techStack.length}`)
    console.log(`   Architecture Decisions: ${adrs.length}`)
    console.log(`   Phases: ${phases.length}`)
    console.log('\n📈 Progress:')
    const completedSteps = steps.filter(s => s.status === 'completed').length
    const totalSteps = steps.length
    console.log(`   Completed: ${completedSteps}/${totalSteps} (${Math.round(completedSteps/totalSteps*100)}%)`)
    console.log('\n🚀 View at: http://localhost:3000')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ Error seeding project:', error)
    throw error
  }
}

// Run
seedNextJSCMS()
  .then(() => {
    console.log('\n✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  })
