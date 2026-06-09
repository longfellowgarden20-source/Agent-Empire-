# Getting Started

## Step 1 — API Keys to get (all free tiers available)

| Service | Free Tier | Get it at |
|---|---|---|
| Tavily | 1,000 searches/mo | tavily.com |
| Perplexity | Check site | perplexity.ai/api |
| Langfuse | Free self-host or cloud | langfuse.com |
| E2B | Free tier | e2b.dev |
| Composio | Free tier | composio.dev |
| Anthropic | Pay per use (~$0.015/1k tokens) | console.anthropic.com |
| GitHub Token | Free | github.com/settings/tokens |

## Step 2 — Set up environment
```bash
cp .env.example .env
# Fill in your keys
```

## Step 3 — Run Supabase schema
```bash
# Paste supabase-empire.sql into your Supabase SQL editor
# Same project as stock-bot — shared database
```

## Step 4 — Install MCP servers
```bash
# Claude Code picks up .mcp.json automatically
# Just open this folder in Claude Code and the MCPs are available
```

## Step 5 — Install Python deps
```bash
pip install -r requirements.txt
```

## Step 6 — Start with Week 1 agents
Build in this order:
1. Oracle (intel layer — everything needs this)
2. Systems Monitor (watchdog — always on)
3. Idea Hunter + Market Validator (pipeline starts)
4. War Room dashboard (see everything)

## The Rule
**Always fetch before deciding. Use live_search() before any Groq call.**
