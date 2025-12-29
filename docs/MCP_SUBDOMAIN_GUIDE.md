# MCP Subdomain Setup: Do You Need It?

## TL;DR: **No, You DON'T Need an MCP Subdomain** ❌

Your MCP server works perfectly at `https://yourdomain.com/mcp` - a subdomain is unnecessary complexity for 99% of use cases.

## Current Setup (Recommended) ✅

Your AI Project Planner already has the **recommended** MCP architecture:

```
Main App:     https://your-app.vercel.app
MCP Server:   https://your-app.vercel.app/mcp  ← This is perfect!
API Routes:   https://your-app.vercel.app/api
```

**Location in code:** `app/mcp/route.ts`

This is the **standard Next.js pattern** and what most MCP servers use.

## Why People Sometimes Use Subdomains

Some projects create `mcp.yourdomain.com` for these reasons:

### 1. **Separate Deployment** (Rare)
- If MCP server is a completely different app/language
- Example: Main app in Python, MCP server in Node.js
- **Your case:** ❌ Not needed - it's the same Next.js app

### 2. **Rate Limiting Separation** (Rare)
- Different rate limits for web users vs AI agents
- **Your case:** ❌ Not needed - handle with middleware

### 3. **Marketing/Branding** (Cosmetic)
- Looks "professional" to have `mcp.company.com`
- **Your case:** ❌ Not needed - adds zero value

### 4. **Legacy Infrastructure** (Technical Debt)
- Organizations with complex proxy setups
- **Your case:** ❌ Not needed - Vercel handles everything

## The Problems with MCP Subdomains ⚠️

### 1. **Additional DNS Configuration**
```bash
# You'd need to add:
mcp.yourdomain.com  →  CNAME  →  cname.vercel-dns.com
```

### 2. **SSL Certificate Management**
- Need SSL cert for subdomain
- Vercel handles this BUT it's extra configuration

### 3. **CORS Issues**
- Cross-origin requests between main app and MCP server
- Need to configure CORS headers properly

### 4. **Deployment Complexity**
- Need to deploy MCP route separately
- Or use Vercel rewrites (which is just extra config)

### 5. **No Real Benefits**
- Same Vercel limits apply
- Same authentication required
- Same codebase anyway

## What You SHOULD Do Instead ✅

### Option 1: Keep Current Setup (Recommended)
```
https://your-app.vercel.app/mcp
```

**Pros:**
- ✅ Zero extra configuration
- ✅ Same SSL certificate
- ✅ No CORS issues
- ✅ Easy to maintain
- ✅ Standard Next.js pattern

**Cons:**
- None!

### Option 2: API Route Pattern (Alternative)
If you prefer `/api` prefix for consistency:

```
https://your-app.vercel.app/api/mcp
```

Move `app/mcp/route.ts` to `app/api/mcp/route.ts`

**When to use:** If all your external-facing endpoints are under `/api`

### Option 3: Custom Domain Root (If You Have Custom Domain)
```
Main App: https://app.yourdomain.com
MCP:      https://app.yourdomain.com/mcp
```

OR

```
Main App: https://yourdomain.com
MCP:      https://yourdomain.com/mcp
```

**When to use:** When you have a custom domain configured

## Production Deployment Checklist ✅

Your app is **production-ready** when:

### 1. Environment Variables Set in Vercel
- [x] `DATABASE_URL` ← You have this
- [x] `MCP_API_KEY` ← You have this
- [x] `BLOB_READ_WRITE_TOKEN` ← You have this
- [x] `NEXT_PUBLIC_STACK_*` ← You have this (for auth)

### 2. MCP Server Works Locally
```bash
# Test it:
curl http://localhost:3000/mcp
```

Expected: Connection or auth error (not 404)

### 3. Database Migrations Complete
```bash
npx dotenv -e .env -- tsx scripts/run-migrations.ts
```

Expected: "✓ Database is up to date"

### 4. Build Succeeds
```bash
pnpm build
```

Expected: No errors

## Deployment to Vercel (No Subdomain Needed)

### Step 1: Deploy
```bash
vercel --prod
```

### Step 2: Your URLs
```
Main App:  https://ai-project-planner.vercel.app
MCP:       https://ai-project-planner.vercel.app/mcp
```

### Step 3: Connect Claude Desktop
```json
{
  "mcpServers": {
    "ai-project-planner": {
      "url": "https://ai-project-planner.vercel.app/mcp",
      "type": "http",
      "headers": {
        "x-api-key": "your-mcp-api-key-here"
      }
    }
  }
}
```

**File location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

## If You REALLY Want a Subdomain (Not Recommended)

If you absolutely insist, here's how:

### 1. Update vercel.json
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/:path*",
      "destination": "/mcp/:path*",
      "has": [
        {
          "type": "host",
          "value": "mcp.yourdomain.com"
        }
      ]
    }
  ],
  "functions": {
    "app/mcp/route.ts": {
      "maxDuration": 60
    }
  }
}
```

### 2. Add DNS Record
```
Type: CNAME
Name: mcp
Value: cname.vercel-dns.com
```

### 3. Configure in Vercel Dashboard
- Go to Settings → Domains
- Add `mcp.yourdomain.com`
- Verify DNS

### 4. Test
```bash
curl https://mcp.yourdomain.com
```

**But seriously:** This adds complexity with zero benefits. Don't do it.

## Real-World Examples

### Anthropic's Pattern (Claude Desktop)
- Uses simple paths: `/mcp`, `/api/mcp`
- No subdomains

### Vercel's MCP Examples
- GitHub: `vercel-labs/mcp-for-next.js`
- Pattern: `/mcp` route
- No subdomains

### OpenAI's API Pattern
- `https://api.openai.com/v1/...`
- Subdomain for API, but different service
- Your MCP is part of same app ≠ different service

## Summary

| Approach | Complexity | Benefits | Recommended |
|----------|-----------|----------|-------------|
| `/mcp` route | ⭐ Low | ✅ Standard pattern | ✅ **YES** |
| `/api/mcp` route | ⭐ Low | ✅ API consistency | ✅ OK |
| `mcp.domain.com` | ⭐⭐⭐ High | ❌ None for your use case | ❌ **NO** |

## Your Next Steps

1. ✅ **Keep current `/mcp` route** (already done!)
2. ✅ **Deploy to Vercel**
   ```bash
   vercel --prod
   ```
3. ✅ **Configure Claude Desktop** with:
   ```
   https://your-app.vercel.app/mcp
   ```
4. ✅ **Test MCP tools** from Claude Desktop

## Need Help?

See complete deployment guide: `docs/DEPLOYMENT_CHECKLIST.md`

---

**Bottom Line:** Your MCP server at `/mcp` is the industry-standard pattern. Using a subdomain would add complexity without any benefits. Stick with what you have! 🎯
