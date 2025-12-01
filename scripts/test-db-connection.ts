import 'dotenv/config';
import { sql } from '../lib/db/client';
import * as fs from 'fs';
import 'dotenv/config';
import { sql } from '../lib/db/client';
import * as fs from 'fs';
import * as path from 'path';

async function testConnection() {
    try {
        console.log('Testing database connection...');

        const allViewProjects = await sql`SELECT id FROM project_overview`;
        const targetId = '141e3599-c29d-40d3-a651-cc67e68695fb';
        const found = allViewProjects.find(p => p.id === targetId);

        console.log(`Target ID ${targetId} found in view:`, !!found);
        console.log('Total projects in view:', allViewProjects.length);
        if (!found) {
            console.log('IDs in view:', allViewProjects.map(p => p.id));
        }
    } catch (error) {
        console.error('Database connection error:', error);
    }
}

testConnection();
