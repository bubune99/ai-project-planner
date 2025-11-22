/**
 * Seed Example Project for MCP Testing
 * Creates a sample e-commerce project with all data structures
 *
 * Usage: tsx scripts/seed-example-project.ts
 */

import { sql } from '../lib/db/client'
import type {
  ProjectInsert,
  ProjectStepInsert,
  StepDependencyInsert,
  TechStackItemInsert,
  BusinessContextInsert,
} from '../lib/db/schema'

async function seedExampleProject() {
  console.log('🌱 Seeding example project...\n')

  try {
    // 1. Create Project
    console.log('📦 Creating project...')
    const [project] = await sql`
      INSERT INTO projects (
        name, description, status, priority,
        start_date, due_date, github_repo_url
      ) VALUES (
        'E-commerce Platform',
        'Full-stack web application with payment integration, user authentication, and admin dashboard',
        'in-progress',
        'high',
        '2024-01-01',
        '2024-03-31',
        'https://github.com/example/ecommerce-platform'
      )
      RETURNING *
    `
    console.log(`✅ Project created: ${project.name} (${project.id})\n`)

    // 2. Create Business Context
    console.log('💼 Creating business context...')
    await sql`
      INSERT INTO business_context (
        project_id, vision, target_market, primary_use_case,
        revenue_model, competitive_advantage
      ) VALUES (
        ${project.id},
        'Build a modern, AI-powered e-commerce platform that helps small businesses compete with Amazon',
        'Small to medium-sized online retailers (1-50 employees) looking to establish or improve their online presence',
        'Enable SMBs to quickly launch professional online stores with AI-powered product recommendations and inventory management',
        'SaaS subscription model: $99/month basic, $299/month pro, $999/month enterprise. Plus 1.5% transaction fee.',
        'AI-powered features, white-label capability, 10x faster setup than competitors, built-in marketing tools'
      )
    `
    console.log('✅ Business context created\n')

    // 3. Create Tech Stack
    console.log('⚙️  Creating tech stack...')
    const techStack: Omit<TechStackItemInsert, 'project_id'>[] = [
      {
        name: 'Next.js 14',
        category: 'Frontend',
        version: '14.2.16',
        rationale: 'App Router for optimal performance, server components, and SEO',
        documentation_url: 'https://nextjs.org/docs',
        order_index: 1,
      },
      {
        name: 'TypeScript',
        category: 'Frontend',
        version: '5.0',
        rationale: 'Type safety, better developer experience, catch bugs early',
        documentation_url: 'https://www.typescriptlang.org/docs/',
        order_index: 2,
      },
      {
        name: 'Tailwind CSS',
        category: 'Frontend',
        version: '4.0',
        rationale: 'Utility-first, rapid development, consistent design',
        documentation_url: 'https://tailwindcss.com/docs',
        order_index: 3,
      },
      {
        name: 'PostgreSQL (Neon)',
        category: 'Database',
        version: '16',
        rationale: 'Serverless Postgres, autoscaling, excellent for SaaS',
        documentation_url: 'https://neon.tech/docs',
        order_index: 4,
      },
      {
        name: 'Stripe',
        category: 'Payments',
        version: 'latest',
        rationale: 'Industry-standard payment processing, excellent docs, global support',
        documentation_url: 'https://stripe.com/docs',
        order_index: 5,
      },
      {
        name: 'NextAuth.js',
        category: 'Authentication',
        version: '5.0',
        rationale: 'Built for Next.js, supports multiple providers, secure',
        documentation_url: 'https://next-auth.js.org/',
        order_index: 6,
      },
      {
        name: 'Vercel',
        category: 'Deployment',
        version: null,
        rationale: 'Seamless Next.js deployment, edge functions, automatic HTTPS',
        documentation_url: 'https://vercel.com/docs',
        order_index: 7,
      },
    ]

    for (const tech of techStack) {
      await sql`
        INSERT INTO tech_stack_items
        ${sql({ ...tech, project_id: project.id })}
      `
    }
    console.log(`✅ Tech stack created (${techStack.length} items)\n`)

    // 4. Create Project Steps with Dependencies
    console.log('📋 Creating project steps...')

    const steps: Array<{
      step: Omit<ProjectStepInsert, 'project_id'>
      dependencies: string[]
    }> = [
      {
        step: {
          title: 'Database Schema Design',
          description: 'Design and implement PostgreSQL schema for products, users, orders',
          status: 'completed',
          progress: 100,
          phase: 'Foundation',
          stage: 'Backend',
          estimated_hours: 8,
          actual_hours: 6,
          order_index: 1,
          tasks: JSON.stringify([
            'Design ERD for all tables',
            'Create migration files',
            'Add indexes for performance',
            'Setup connection pooling',
          ]),
        },
        dependencies: [],
      },
      {
        step: {
          title: 'Authentication System',
          description: 'Implement user registration, login, and session management with NextAuth',
          status: 'completed',
          progress: 100,
          phase: 'Foundation',
          stage: 'Backend',
          estimated_hours: 12,
          actual_hours: 14,
          order_index: 2,
          tasks: JSON.stringify([
            'Setup NextAuth configuration',
            'Create user database tables',
            'Implement email/password auth',
            'Add OAuth providers (Google, GitHub)',
            'Protected route middleware',
          ]),
        },
        dependencies: ['Database Schema Design'],
      },
      {
        step: {
          title: 'Product Management API',
          description: 'Build REST API for CRUD operations on products',
          status: 'in-progress',
          progress: 60,
          phase: 'Core Features',
          stage: 'Backend',
          estimated_hours: 16,
          actual_hours: 10,
          order_index: 3,
          tasks: JSON.stringify([
            'GET /api/products - list with pagination',
            'GET /api/products/:id - single product',
            'POST /api/products - create (admin only)',
            'PUT /api/products/:id - update (admin only)',
            'DELETE /api/products/:id - soft delete',
            'Add image upload to S3',
          ]),
        },
        dependencies: ['Database Schema Design', 'Authentication System'],
      },
      {
        step: {
          title: 'Product Catalog UI',
          description: 'Build responsive product listing and detail pages',
          status: 'pending',
          progress: 0,
          phase: 'Core Features',
          stage: 'Frontend',
          estimated_hours: 20,
          actual_hours: 0,
          order_index: 4,
          tasks: JSON.stringify([
            'Product grid with filtering',
            'Product detail page',
            'Image gallery component',
            'Search functionality',
            'Category navigation',
            'Responsive design',
          ]),
        },
        dependencies: ['Product Management API'],
      },
      {
        step: {
          title: 'Shopping Cart',
          description: 'Implement shopping cart with local storage and database sync',
          status: 'pending',
          progress: 0,
          phase: 'Core Features',
          stage: 'Full Stack',
          estimated_hours: 16,
          actual_hours: 0,
          order_index: 5,
          tasks: JSON.stringify([
            'Cart state management',
            'Add/remove items',
            'Update quantities',
            'Persist to database for logged-in users',
            'Cart summary component',
            'Mini cart in header',
          ]),
        },
        dependencies: ['Product Catalog UI', 'Authentication System'],
      },
      {
        step: {
          title: 'Stripe Payment Integration',
          description: 'Integrate Stripe for secure payment processing',
          status: 'pending',
          progress: 0,
          phase: 'Core Features',
          stage: 'Backend',
          estimated_hours: 24,
          actual_hours: 0,
          order_index: 6,
          tasks: JSON.stringify([
            'Setup Stripe account and keys',
            'Create Stripe Checkout session',
            'Webhook handling for payment events',
            'Order creation on successful payment',
            'Email confirmation',
            'Refund handling',
          ]),
        },
        dependencies: ['Shopping Cart'],
      },
      {
        step: {
          title: 'Admin Dashboard',
          description: 'Build admin interface for managing products and orders',
          status: 'pending',
          progress: 0,
          phase: 'Admin Features',
          stage: 'Full Stack',
          estimated_hours: 32,
          actual_hours: 0,
          order_index: 7,
          tasks: JSON.stringify([
            'Admin authentication and authorization',
            'Product management interface',
            'Order management',
            'Analytics dashboard',
            'User management',
            'Settings page',
          ]),
        },
        dependencies: ['Authentication System', 'Product Management API'],
      },
      {
        step: {
          title: 'Testing & QA',
          description: 'Write tests and perform quality assurance',
          status: 'pending',
          progress: 0,
          phase: 'Quality',
          stage: 'Testing',
          estimated_hours: 40,
          actual_hours: 0,
          order_index: 8,
          tasks: JSON.stringify([
            'Unit tests for API routes',
            'Integration tests for critical flows',
            'E2E tests with Playwright',
            'Performance testing',
            'Security audit',
            'Cross-browser testing',
          ]),
        },
        dependencies: [
          'Product Catalog UI',
          'Shopping Cart',
          'Stripe Payment Integration',
          'Admin Dashboard',
        ],
      },
    ]

    const stepIdMap: Record<string, string> = {}

    for (const { step, dependencies } of steps) {
      const [createdStep] = await sql`
        INSERT INTO project_steps
        ${sql({ ...step, project_id: project.id })}
        RETURNING id, title
      `
      stepIdMap[createdStep.title] = createdStep.id
      console.log(`   ✓ ${createdStep.title}`)
    }

    console.log(`✅ Created ${steps.length} steps\n`)

    // 5. Create Dependencies
    console.log('🔗 Creating dependencies...')
    let depCount = 0
    for (const { step, dependencies } of steps) {
      const stepId = stepIdMap[step.title]
      for (const depTitle of dependencies) {
        const dependsOnId = stepIdMap[depTitle]
        if (dependsOnId) {
          await sql`
            INSERT INTO step_dependencies (step_id, depends_on_step_id, dependency_type)
            VALUES (${stepId}, ${dependsOnId}, 'hard')
          `
          depCount++
        }
      }
    }
    console.log(`✅ Created ${depCount} dependencies\n`)

    // 6. Add some execution history
    console.log('📜 Creating execution history...')
    await sql`
      INSERT INTO execution_history (project_id, event_type, description)
      VALUES
        (${project.id}, 'project_created', 'Project initialized with full architecture'),
        (${project.id}, 'ai_agent_action', 'Seeded example project data for MCP testing')
    `
    console.log('✅ Execution history created\n')

    console.log('=' .repeat(60))
    console.log('✅ SUCCESS! Example project seeded\n')
    console.log('📊 Summary:')
    console.log(`   Project ID: ${project.id}`)
    console.log(`   Name: ${project.name}`)
    console.log(`   Steps: ${steps.length}`)
    console.log(`   Tech Stack Items: ${techStack.length}`)
    console.log(`   Dependencies: ${depCount}`)
    console.log('\n🚀 Next steps:')
    console.log('   1. View in UI: http://localhost:3000')
    console.log('   2. Test MCP: node scripts/test-mcp-client.mjs http://localhost:3000')
    console.log(`   3. Use Project ID in AI agents: ${project.id}`)
    console.log('=' .repeat(60))
  } catch (error) {
    console.error('❌ Error seeding project:', error)
    throw error
  }
}

// Run the seed
seedExampleProject()
  .then(() => {
    console.log('\n✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  })
