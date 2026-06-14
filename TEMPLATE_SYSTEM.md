# Template Generation System — 10/day to Gumroad + TikTok

## Overview

Two new agents automate template creation and TikTok marketing:

1. **`template_generator`** (runs daily at 8am ET)
   - Scouts trending Notion/Figma/Canva/prompt templates
   - Creates products on Gumroad ($15-50)
   - Queues 3 TikTok hooks per template

2. **`tiktok_hooks`** (runs every 6 hours)
   - Pulls queued tasks from `task_queue`
   - Generates viral 15-30s TikTok scripts
   - Stores scripts in `tiktok_hooks` table (ready for manual posting or API upload)

---

## Setup (4 steps)

### 1. Add API keys to `.env.local`

```bash
# These are already in .env.local, just fill them in:
GUMROAD_API_TOKEN=           # Get from gumroad.com/settings/api
NOTION_API_KEY=              # Get from notion.so/integrations
FIGMA_API_KEY=               # (Optional) from figma.com/api/token
TIKTOK_API_TOKEN=            # (Optional) if you set up Business account
```

**⚠️ Important:** All keys are stored in `.env.local` which is `.gitignored`. Never commit these.

### 2. Run the migration

```sql
-- Run this in Supabase SQL editor:
-- Creates `templates` and `tiktok_hooks` tables
-- See: /migrations/add_template_tables.sql
```

### 3. Get API tokens

**Gumroad:**
- Go to [gumroad.com/settings/api](https://gumroad.com/settings/api)
- Click "Generate access token"
- Copy and paste into `.env.local`

**Notion:**
- Go to [notion.so/integrations](https://notion.so/integrations)
- Create new integration
- Copy the API key to `.env.local`

**Figma (optional):**
- https://figma.com/settings/tokens
- Create personal access token

---

## How It Works

### Daily Loop (8am ET)

```
template_generator runs
  ↓
Groq generates 10 trending templates
  ↓
For each template:
  - Create Gumroad product with description
  - Insert into `templates` table
  - Queue 3 TikTok hooks in `task_queue`
  ↓
Logs: "Created 10 templates, queued 30 hooks"
```

### Hook Generation (every 6 hours)

```
tiktok_hooks runs
  ↓
Pulls all pending "tiktok_hooks" tasks from task_queue
  ↓
For each hook task:
  - Groq generates 15-30s viral script
  - Store in `tiktok_hooks` table with status=draft
  - Mark task as done
  ↓
Logs: "Generated 30 hooks"
```

---

## Gumroad Products Created Daily

### Example templates generated:
1. **Notion productivity dashboard** ($29) — "AI researcher's wiki"
2. **Canva social media pack** ($19) — "SaaS founder meme templates"
3. **Figma design system** ($49) — "AI app UI kit"
4. **Prompt pack** ($15) — "100 ChatGPT prompts for founders"
5. **Notion financial tracker** ($29) — "AI startup P&L tracker"
6. **Canva presentation deck** ($24) — "Pitch deck template for AI tools"
7. **Google Sheets template** ($19) — "AI freelancer income tracker"
8. **Notion CRM** ($34) — "Sales pipeline for AI agencies"
9. **Figma components** ($49) — "AI chatbot UI components"
10. **Email templates** ($15) — "Cold email templates that convert"

Each gets 3 TikTok hooks:
- Hook 1: "This $29 template saved me 10 hours..."
- Hook 2: "POV: You found the only X you'll ever need..."
- Hook 3: "I'm selling this for $X and people are buying it..."

---

## TikTok Scripts (Ready to Post)

All generated hooks go to `tiktok_hooks` table with `status=draft`. 

You can:
1. **Review manually** → Post to TikTok manually (copy/paste script)
2. **Post via API** → Set up TikTok Business account + `TIKTOK_API_TOKEN` (future)
3. **Batch export** → Query all `status=draft` and post in bulk

Example query:
```sql
SELECT product_id, script, angle FROM tiktok_hooks WHERE status='draft' ORDER BY created_at DESC LIMIT 30;
```

---

## Database Schema

### `templates` table
```
id (uuid)
name (text) — product name
category (text) — notion | figma | canva | prompts
gumroad_product_id (text) — Gumroad ID
gumroad_url (text) — https://[you].gumroad.com/l/[slug]
price_cents (int) — $X in cents
description (text) — marketing copy
target_customer (text) — who buys this
status (text) — draft | live | archived
created_at, updated_at
```

### `tiktok_hooks` table
```
id (uuid)
product_id (uuid) — reference to templates
script (text) — the TikTok script (15-30s)
angle (text) — viral angle used
status (text) — draft | queued | posted | archived
video_url (text) — TikTok video URL (after posting)
views (int) — TikTok views
engagement (int) — likes + comments + shares
created_at, posted_at
```

---

## Expected Daily Output

- **10 Gumroad products live** ($15-50 each, ~$250-300 baseline revenue if 1-2 sales/day each)
- **30 TikTok hooks drafted** (ready to post, ~3-5 per product for A/B testing)
- **Cost:** ~0.15 Groq API (one call per template + hooks = ~$0.05 Groq per product)

---

## Monitoring

Check agent status in Control Panel:

```
template_generator  | Last run: 8:02am | Status: ✅ Success | 10 templates
tiktok_hooks        | Last run: 2:04pm | Status: ✅ Success | 30 hooks
```

View all generated templates:
```sql
SELECT name, category, price_cents, status, gumroad_url FROM templates ORDER BY created_at DESC LIMIT 20;
```

View draft TikTok scripts:
```sql
SELECT product_id, script, angle FROM tiktok_hooks WHERE status='draft' ORDER BY created_at DESC;
```

---

## Troubleshooting

### "Missing GUMROAD_API_TOKEN"
- Check `.env.local` exists and has `GUMROAD_API_TOKEN=...` (not empty)
- Reload worker (Railway)

### "Gumroad product creation failed"
- Check token is valid (go to API page, regenerate if needed)
- Check Gumroad account is active + not suspended

### "No pending hooks"
- template_generator may have errored or not run yet
- Check `task_queue` table for pending "tiktok_hooks" tasks
- Manually trigger template_generator from Control Panel

### TikTok scripts look generic
- They are — Groq fast mode prioritizes speed over creativity
- You can review + rewrite manually, or edit the prompt in `tiktok_hooks.py`

---

## Next Steps

1. Add the 3 API keys to `.env.local`
2. Run the SQL migration in Supabase
3. Hit "Run" on `template_generator` in Control Panel tomorrow at 8am ET
4. Check `templates` table — should see 10 products
5. Check `tiktok_hooks` table — should see 30 draft scripts
6. Post hooks to TikTok (manually or via API once set up)

That's it. Everything else runs on schedule.
