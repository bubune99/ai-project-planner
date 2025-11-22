#!/usr/bin/env node

/**
 * Generate a secure API key for MCP server authentication
 */

const crypto = require('crypto')

const apiKey = crypto.randomBytes(32).toString('hex')

console.log('\n🔐 Generated MCP API Key:\n')
console.log(apiKey)
console.log('\n📝 Add this to your Vercel environment variables:')
console.log('   Name: MCP_API_KEY')
console.log('   Value:', apiKey)
console.log('\n📋 Also add to your .env file for local development:')
console.log(`   MCP_API_KEY=${apiKey}`)
console.log('\n⚠️  Keep this key secret! Don\'t commit it to git.\n')
