import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const projectId = 'ec80d040-82fe-4848-8b79-ee1e205abca4';
const userId = '33f24019-a9e8-45af-a2f8-493ba45531fd';

async function main() {
  console.log('Adding steps to project...');
  
  const steps = [
    ['Set up Next.js project', 'Initialize with Next.js 14, TypeScript, Tailwind', 'completed', 100, 'planning', 'setup', 4, 3, 1],
    ['Design database schema', 'Create PostgreSQL schema for tasks and users', 'completed', 100, 'planning', 'design', 8, 10, 2],
    ['Implement authentication', 'Set up Stack Auth', 'completed', 100, 'development', 'backend', 6, 5, 3],
    ['Build task CRUD API', 'REST API endpoints for task management', 'completed', 100, 'development', 'backend', 12, 14, 4],
    ['Integrate OpenAI', 'AI-powered task prioritization', 'in-progress', 60, 'development', 'ai', 16, 10, 5],
    ['Create task list UI', 'Responsive task list with filtering', 'in-progress', 40, 'development', 'frontend', 10, 4, 6],
    ['Natural language tasks', 'Create tasks using NLP', 'pending', 0, 'development', 'ai', 12, 0, 7],
    ['Smart scheduling', 'AI deadline suggestions', 'pending', 0, 'development', 'ai', 14, 0, 8],
    ['Write unit tests', 'Test coverage for core features', 'pending', 0, 'testing', 'qa', 10, 0, 9],
    ['Deploy to Vercel', 'Production deployment', 'pending', 0, 'deployment', 'ops', 4, 0, 10]
  ];
  
  for (const step of steps) {
    await sql.query(
      `INSERT INTO project_steps (project_id, title, description, status, progress, phase, stage, estimated_hours, actual_hours, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [projectId, ...step]
    );
    console.log('Added:', step[0]);
  }
  
  console.log('\nAdding execution history...');
  const events = [
    ['project_created', 'Project initialized'],
    ['step_completed', 'Completed: Set up Next.js project'],
    ['step_completed', 'Completed: Design database schema'],
    ['step_completed', 'Completed: Implement authentication'],
    ['step_started', 'Started: Integrate OpenAI']
  ];
  
  for (const [type, desc] of events) {
    await sql.query(
      `INSERT INTO execution_history (project_id, user_id, event_type, description) VALUES ($1, $2, $3, $4)`,
      [projectId, userId, type, desc]
    );
  }
  
  console.log('\nDone! Project has 10 steps and execution history.');
}

main().catch(e => console.error(e));
