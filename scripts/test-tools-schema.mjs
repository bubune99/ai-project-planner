import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

// Test each tool schema
const toolSchemas = {
  navigateToView: z.object({
    view: z.enum(["dashboard", "tree", "gantt", "kanban", "flow", "docs"]).describe("The view to navigate to"),
    reason: z.string().optional().describe("Brief explanation of why navigating (shown to user)"),
  }),
  openDocumentBrowser: z.object({
    filter: z.string().default("").describe("Optional filter/search term for documents"),
  }),
  closeDocumentBrowser: z.object({
    confirm: z.boolean().default(false).describe("Confirmation flag"),
  }),
  listProjects: z.object({
    status: z.enum(["all", "planning", "in-progress", "completed", "on-hold"])
      .default("all")
      .describe("Filter by project status"),
  }),
};

for (const [name, schema] of Object.entries(toolSchemas)) {
  const jsonSchema = zodToJsonSchema(schema, { target: 'openApi3' });
  console.log(`\n${name}:`);
  console.log(JSON.stringify(jsonSchema, null, 2));
  const hasType = jsonSchema.type === 'object';
  console.log(`Has type:object = ${hasType}`);
}
