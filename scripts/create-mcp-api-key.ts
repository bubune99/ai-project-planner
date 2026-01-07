/**
 * Script to create an MCP API key for a user
 *
 * Usage: npx tsx scripts/create-mcp-api-key.ts
 */

import { sql } from "@/lib/db/client";
import crypto from "crypto";

// Generate API key
function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(24);
  const base64url = randomBytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `aipp_${base64url}`;
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function main() {
  try {
    // First, list all users
    console.log("\n📋 Listing users in database...\n");
    const users = await sql`
      SELECT id, email, name, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 10
    `;

    if (users.length === 0) {
      console.log("❌ No users found in database!");
      process.exit(1);
    }

    console.log("Found users:");
    users.forEach((user, i) => {
      console.log(`  ${i + 1}. ${user.email} (${user.name}) - ID: ${user.id}`);
    });

    // Use the first user (most recent)
    const user = users[0];
    console.log(`\n🔑 Creating API key for: ${user.email}\n`);

    // Generate and store key
    const key = generateApiKey();
    const keyHash = hashApiKey(key);
    const keyPrefix = key.substring(0, 12);
    const name = "Claude Code MCP";
    const scopes = ["read", "write"];

    const result = await sql`
      INSERT INTO api_keys (
        user_id,
        key_hash,
        key_prefix,
        name,
        scopes,
        expires_at
      ) VALUES (
        ${user.id},
        ${keyHash},
        ${keyPrefix},
        ${name},
        ${JSON.stringify(scopes)},
        NULL
      )
      RETURNING id, key_prefix, name, created_at
    `;

    console.log("✅ API Key created successfully!\n");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("⚠️  SAVE THIS KEY - IT WILL NOT BE SHOWN AGAIN!");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`\n🔐 API Key: ${key}\n`);
    console.log("═══════════════════════════════════════════════════════════════\n");

    // Generate the Claude MCP config command
    const projectPath = process.cwd();
    const mcpCommand = {
      "ai-project-planner": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://ai-project-planner-nu.vercel.app/mcp"],
        "env": {
          "API_KEY": key
        }
      }
    };

    console.log("📎 Add this to your Claude Code MCP settings:\n");
    console.log("For local development (add to ~/.claude/settings.json under mcpServers):");
    console.log(JSON.stringify({
      "ai-project-planner-local": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "http://localhost:3000/mcp"],
        "env": {
          "API_KEY": key
        }
      }
    }, null, 2));

    console.log("\n\nFor production (Vercel deployment):");
    console.log(JSON.stringify({
      "ai-project-planner": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://ai-project-planner-nu.vercel.app/mcp"],
        "env": {
          "API_KEY": key
        }
      }
    }, null, 2));

    console.log("\n✨ Done!");

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
