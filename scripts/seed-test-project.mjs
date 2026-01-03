import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(connectionString);

async function main() {
  console.log('Finding user...');
  
  const users = await sql.query(
    "SELECT id, email, name FROM users WHERE stack_auth_id != 'system' ORDER BY created_at DESC LIMIT 1"
  );
  
  if (users.length === 0) {
    console.error('No users found');
    process.exit(1);
  }
  
  const user = users[0];
  console.log('Found user:', user.email, '- ID:', user.id);
  
  console.log('\nCreating test project...');
  
  const metadata = JSON.stringify({
    techStack: ['Next.js', 'TypeScript', 'Tailwind CSS', 'PostgreSQL', 'OpenAI'],
    repository: 'https://github.com/example/ai-task-manager',
    estimatedCompletion: '2025-02-15'
  });
  
  const projects = await sql.query(
    `INSERT INTO projects (user_id, name, description, status, priority, progress, current_phase, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name`,
    [
      user.id,
      'AI-Powered Task Manager',
      'A modern task management application with AI-powered prioritization, smart scheduling, and natural language task creation.',
      'in-progress',
      'high',
      35,
      'development',
      metadata
    ]
  );
  
  const project = projects[0];
  console.log('Created project:', project.name, '- ID:', project.id);
  
  console.log('\nCreating project phases...');
  await sql.query(
    `INSERT INTO project_phases (project_id, phase_name, status, description, order_index) VALUES 
      ($1, 'ideation', 'completed', 'Initial brainstorming', 1),
      ($1, 'planning', 'completed', 'Architecture design', 2),
      ($1, 'development', 'active', 'Core implementation', 3),
      ($1, 'testing', 'pending', 'QA and bug fixes', 4),
      ($1, 'deployment', 'pending', 'Production deployment', 5)`,
    [project.id]
  );
  console.log('Created 5 phases');
  
  console.log('\nCreating project steps...');
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
      [project.id, ...step]
    );
  }
  console.log('Created 10 steps');
  
  console.log('\nCreating execution history...');
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
      [project.id, user.id, type, desc]
    );
  }
  console.log('Created history entries');
  
  console.log('\nTest project seeded successfully!');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
