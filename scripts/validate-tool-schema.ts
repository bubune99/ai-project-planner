/**
 * Truth Seeker: Validate AI Tool Schemas for Anthropic API compatibility
 *
 * This script validates that all tool schemas have the required `type: 'object'`
 * field that Anthropic's API requires.
 */

import { allTools } from '../lib/ai/tools';

interface ValidationResult {
  toolName: string;
  valid: boolean;
  hasType: boolean;
  schemaType: string | undefined;
  error?: string;
}

async function validateToolSchemas(): Promise<void> {
  console.log('🔍 Truth Seeker: Validating AI Tool Schemas\n');
  console.log('=' .repeat(60));

  const results: ValidationResult[] = [];
  let invalidCount = 0;

  for (const [toolName, tool] of Object.entries(allTools)) {
    try {
      // Access the tool's parameters schema
      const params = (tool as any).parameters;

      if (!params) {
        results.push({
          toolName,
          valid: false,
          hasType: false,
          schemaType: undefined,
          error: 'No parameters defined'
        });
        invalidCount++;
        continue;
      }

      // Convert Zod schema to JSON Schema (similar to what AI SDK does)
      const jsonSchema = params._def;
      const typeName = jsonSchema?.typeName;

      // Check if it's a ZodObject
      const isObject = typeName === 'ZodObject';

      // For Anthropic, we need the schema to be an object type
      const result: ValidationResult = {
        toolName,
        valid: isObject,
        hasType: isObject,
        schemaType: typeName,
      };

      if (!isObject) {
        result.error = `Expected ZodObject, got ${typeName}`;
        invalidCount++;
      }

      results.push(result);
    } catch (error: any) {
      results.push({
        toolName,
        valid: false,
        hasType: false,
        schemaType: undefined,
        error: error.message
      });
      invalidCount++;
    }
  }

  // Print results
  console.log('\n📊 Validation Results:\n');

  for (const result of results) {
    const icon = result.valid ? '✅' : '❌';
    console.log(`${icon} ${result.toolName}`);
    console.log(`   Type: ${result.schemaType || 'unknown'}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log('');
  }

  console.log('=' .repeat(60));
  console.log(`\n📈 Summary:`);
  console.log(`   Total tools: ${results.length}`);
  console.log(`   Valid: ${results.length - invalidCount}`);
  console.log(`   Invalid: ${invalidCount}`);

  if (invalidCount > 0) {
    console.log('\n⚠️  Some tools have invalid schemas!');
    process.exit(1);
  } else {
    console.log('\n✅ All tool schemas are valid!');
  }
}

validateToolSchemas().catch(console.error);
