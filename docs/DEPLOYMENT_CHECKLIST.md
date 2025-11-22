# Vercel Deployment Checklist

Follow these steps to deploy your AI Project Planner with MCP server to Vercel.

## ✅ Pre-Deployment

- [ ] All changes committed to git
- [ ] Local development working (`pnpm dev` runs without errors)
- [ ] Database migrations complete (or ready to run)

## 🔑 Step 1: Generate MCP API Key

```bash
node scripts/generate-mcp-key.js
```

**Copy the generated key** - you'll need it for Step 3!

## 🚀 Step 2: Deploy to Vercel

### Option A: Using Vercel CLI (Recommended)

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

### Option B: Using GitHub Integration

1. Push to GitHub: `git push origin Mission-control`
2. Go to https://vercel.com/new
3. Import your GitHub repository
4. Vercel will auto-deploy

## ⚙️ Step 3: Configure Environment Variables in Vercel

Go to your Vercel project dashboard → **Settings** → **Environment Variables**

Add these variables:

### Required:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql://...` | Copy from your `.env` file |
| `MCP_API_KEY` | Generated key from Step 1 | Keep this secret! |

### Optional:

| Variable | Value | Notes |
|----------|-------|-------|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token | For document uploads |

**Important:** Set for all environments (Production, Preview, Development)

## 🔄 Step 4: Redeploy

After adding environment variables:

```bash
vercel --prod
```

Or trigger redeploy from Vercel dashboard.

## 🔗 Step 5: Get Your App URL

After deployment, Vercel will give you a URL like:
```
https://ai-project-planner-xxx.vercel.app
```

Your MCP server endpoint is:
```
https://ai-project-planner-xxx.vercel.app/mcp
```

## 🤖 Step 6: Connect Claude Desktop

### macOS:
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Windows:
```bash
code %APPDATA%\Claude\claude_desktop_config.json
```

### Add Configuration:

```json
{
  "mcpServers": {
    "ai-project-planner": {
      "url": "https://your-app-name.vercel.app/mcp",
      "type": "http",
      "headers": {
        "x-api-key": "your-generated-api-key-here"
      }
    }
  }
}
```

Replace:
- `your-app-name.vercel.app` with your actual Vercel URL
- `your-generated-api-key-here` with the key from Step 1

## ✨ Step 7: Test Everything

### Test the Web App:
```
https://your-app-name.vercel.app
```

- [ ] Homepage loads
- [ ] Can create a new project
- [ ] Project list displays

### Test the MCP Server:

1. **Restart Claude Desktop** completely
2. Look for "ai-project-planner" connection indicator
3. Ask Claude:
   ```
   List all my projects
   ```

Should work! 🎉

### Test with cURL:

```bash
curl -H "x-api-key: YOUR-KEY-HERE" \
     -H "Content-Type: application/json" \
     -d '{"method":"tools/list"}' \
     https://your-app-name.vercel.app/mcp
```

## 🐛 Troubleshooting

### Build Failed

**Check:**
- TypeScript errors: `pnpm build` locally
- Missing environment variables in Vercel
- Node.js version (should be 18+)

**Fix:**
```bash
# Test build locally
pnpm build

# Check Vercel logs
vercel logs
```

### MCP Server Returns 401

**Check:**
- API key set in Vercel environment variables
- API key matches in Claude Desktop config
- Redeployed after adding environment variable

**Fix:**
```bash
# Verify environment variables
vercel env ls

# Redeploy
vercel --prod
```

### Database Errors

**Check:**
- DATABASE_URL is correct in Vercel
- Neon database is accessible
- Migrations have run

**Fix:**
Run migrations manually via Neon SQL Editor or:
```bash
# Connect to your database and run migrations
vercel env pull .env.production
npx dotenv -e .env.production -- pnpm db:migrate
```

## 🎯 Post-Deployment

- [ ] Save your Vercel URL somewhere safe
- [ ] Save your MCP API key in a password manager
- [ ] Test creating/viewing projects in production
- [ ] Test MCP server from Claude Desktop
- [ ] Set up custom domain (optional)

## 📊 Monitor Your Deployment

- **Vercel Dashboard:** https://vercel.com/dashboard
- **Function Logs:** Check for errors
- **Analytics:** Monitor usage

## 🔐 Security Reminders

1. ✅ MCP_API_KEY is set in production
2. ✅ API key is NOT committed to git
3. ✅ DATABASE_URL uses SSL (`sslmode=require`)
4. ✅ Environment variables are set for all environments

## 🚀 You're Live!

Your AI Project Planner is now:
- ✅ Deployed to Vercel
- ✅ Accessible via MCP server
- ✅ Connected to Claude Desktop
- ✅ Ready for automation agents

Next: Build your first automation agent! See `VERCEL_MCP_SETUP.md` for examples.
