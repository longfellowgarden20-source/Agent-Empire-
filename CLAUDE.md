# CLAUDE.md — Agent Empire

## Vision
A fully autonomous AI holding company. 20+ businesses running simultaneously, each operated by a team of specialized AI agents. The user is the Chairman — reviews a 5-minute morning brief and makes 2-3 decisions per day. Everything else is autonomous.

**This is not a side project. This is a company.**

---

## The User
- Experienced builder — already built a 20-worker AI stock intelligence platform
- Knows: Next.js, Python FastAPI, Supabase, Railway, Vercel, Groq API
- Wants: maximum autonomy, minimum daily input, self-improving systems
- Style: dark terminal UI (Bloomberg aesthetic), fast, no fluff
- Budget: one Groq paid subscription + free tiers across multiple accounts

---

## Stack (Current — June 2026)

| Layer | Tech | Notes |
|---|---|---|
| Agent orchestration | CrewAI 0.105+ | Business team agents |
| War Room logic | LangGraph 0.4+ | Stateful, branching, looping |
| Live internet | Tavily API | Real-time web search, 180ms latency |
| Deep research | Perplexity Sonar API | 200B+ page index, citations |
| Observability | Langfuse (open source) | Every agent call traced + scored |
| Code execution | E2B sandbox | Safe agent code running |
| App integrations | Composio MCP | 250+ apps: Gmail, Stripe, GitHub, Vercel |
| Fast LLM | Groq llama-3.3-70b-versatile | Trading, quick decisions |
| Judgment LLM | Claude Opus (API) | Complex reasoning, architecture |
| Agentic LLM | Hermes-3-70b | Multi-step tasks, persona-holding |
| Memory | Supabase (Postgres) | Shared across all agents |
| Frontend | Next.js 15 App Router | War Room dashboard |
| Workers | Python FastAPI on Railway | Background agents |
| Deploy | Vercel (frontend) + Railway (workers) | Already familiar |

---

## MCP Servers (Pre-configured — see .mcp.json)

These are installed and ready. Every agent has access to these tools:

| MCP Server | What agents use it for |
|---|---|
| `@modelcontextprotocol/server-github` | Read/write code, open PRs, manage repos |
| `@modelcontextprotocol/server-filesystem` | Read/write local files |
| `@tavily/mcp-server` | Live web search — EVERY agent should use this |
| `@composio/mcp` | 250+ app integrations |
| `mcp-server-supabase` | Direct DB read/write |
| `@playwright/mcp` | Browse websites, scrape, fill forms |
| `@e2b/mcp-server` | Run code safely in sandbox |
| `context7` | Always-current library docs |
| `mcp-server-langfuse` | Log traces directly from agents |

**Rule: Always use Tavily before making any decision. Never rely on training data alone.**

---

## 47 Agents — Full Roster

See `AGENTS.md` for complete specs. Summary by tier:

- **Tier 1 — Gods (5):** Chairman, War Room Judge, Architect, Oracle, Capital Allocator
- **Tier 2 — Builders (6):** Idea Hunter, Market Validator, Coder, Deployer, Tester, Skill Builder
- **Tier 3 — Revenue (7):** Prospector, Researcher, Copywriter, Outreach, Deal Closer, Upsell, Retention
- **Tier 4 — Market (6):** Stock Intelligence, Crypto Watcher, Real Estate Scout, Trend Surfer, Competitor Tracker, Macro Watcher
- **Tier 5 — Content (6):** Content Strategist, Writer, Social Agent, Video Scripter, SEO Agent, Email Marketer
- **Tier 6 — Ecommerce (6):** Product Scout, Listing Agent, Pricing Agent, Ad Agent, Inventory Agent, Support Agent
- **Tier 7 — Intelligence (4):** Web Crawler, News Aggregator, Data Scientist, Memory Keeper
- **Tier 8 — Watchdogs (5):** Systems Monitor, Quality Inspector, Finance Tracker, Compliance Agent, Security Agent
- **Tier 9 — Meta (2):** Prompt Engineer, Evolution Agent

---

## Agent Design Principles

Every agent must follow these rules:

### 1. Always fetch before reasoning
```python
# WRONG — relying on training data
analysis = groq.analyze("What are NVDA's recent signals?")

# RIGHT — fetch first, then reason
fresh_data = tavily.search("NVDA news today site:reuters.com OR site:bloomberg.com")
analysis = groq.analyze(fresh_data)
```

### 2. One job, one agent
Never give an agent two jobs. A Prospector finds leads. A Copywriter writes emails. Never combine them — specialization wins.

### 3. Fail loudly, not silently
```python
# WRONG
except Exception:
    pass

# RIGHT
except Exception as e:
    log.error(f"[AgentName] failed: {e}")
    supabase.insert_to_dlq(task, error=str(e))
    notify_war_room(f"Agent X failed: {e}")
```

### 4. Every decision logged
Every Groq/Claude call → Langfuse trace. No exceptions. The War Room needs this data.

### 5. Agents pass tasks, not data
```python
# WRONG — passing raw data between agents
writer.run(data={"article_content": "..."})

# RIGHT — passing task references
task_queue.add({
    "task": "write_article",
    "input_id": research_result_id,  # reference to DB row
    "assigned_to": "writer_agent",
    "priority": 8
})
```

---

## Company Pattern (Template for All Businesses)

Every company follows this exact structure:

```
companies/[company-name]/
├── README.md          # What this company does, revenue model, status
├── agents/            # Agent configs for this company's team
│   ├── agent1.py
│   └── agent2.py
├── workers/           # FastAPI workers deployed to Railway
│   └── main.py
├── prompts/           # Versioned prompts for each agent
│   └── v1/
└── metrics/           # What KPIs this company tracks
    └── kpis.md
```

---

## Skills Library (use these, don't reinvent)

Located in `shared/skills/`. Import and use:

### Agent Skills
- `live_search(query)` → Tavily search, returns structured content
- `deep_research(query)` → Perplexity Sonar, returns cited answer
- `run_code_safely(code)` → E2B sandbox execution
- `deploy_to_vercel(repo)` → Composio Vercel MCP
- `push_to_github(changes)` → Composio GitHub MCP
- `log_trace(agent, input, output, cost)` → Langfuse
- `score_output(output, criteria)` → Quality scoring
- `notify_chairman(message, priority)` → Morning brief queue

### LLM Skills
- `fast_llm(prompt)` → Groq llama-3.3-70b (speed priority)
- `smart_llm(prompt)` → Claude Opus (quality priority)
- `agent_llm(prompt)` → Hermes-3 (multi-step tasks)
- `cheap_llm(prompt)` → Groq llama-3.1-8b (cost priority)

### Data Skills
- `save_to_memory(agent, key, value)` → Supabase
- `get_from_memory(agent, key)` → Supabase
- `add_to_task_queue(task)` → Inter-agent communication
- `get_next_task(agent_name)` → Pull next task

### Business Skills
- `score_business(company_id)` → War Room scoring
- `score_lead(prospect_data)` → Lead quality 1-10
- `score_content(content)` → Content quality 1-10
- `route_to_agent(task, context)` → Smart task routing

---

## Mistakes To Never Repeat (Hard Won Lessons)

### From building the stock-bot:

**❌ MISTAKE 1: Truthy check on numeric values**
```python
# BUG — 0 is falsy, but 0 is a valid value
if volume:
    process(volume)

# FIX — always explicit
if volume is not None:
    process(volume)
```

**❌ MISTAKE 2: Dynamic Tailwind classes**
```tsx
// BUG — Tailwind never sees this, no styles generated
className={`bg-[#22c55e]/${Math.round(intensity * 30)}`}

// FIX — always use inline styles for dynamic values
style={{ background: `rgba(34,197,94,${opacity})` }}
```

**❌ MISTAKE 3: Declaring variables after the effects that use them**
```tsx
// BUG — TDZ issue, fragile even if not a crash
useEffect(() => {
    doSomethingWith(starting)  // uses variable declared below
}, [deps])
const starting = account?.starting_balance ?? 50000  // declared here

// FIX — declare derived values before effects
const starting = account?.starting_balance ?? 50000
useEffect(() => {
    doSomethingWith(starting)
}, [deps])
```

**❌ MISTAKE 4: Defining React components inside parent components**
```tsx
// BUG — recreated every render, remounts, kills state
function Parent() {
    function ChildButton() { return <button>...</button> }
    return <ChildButton />
}

// FIX — always hoist to module scope
function ChildButton() { return <button>...</button> }
function Parent() { return <ChildButton /> }
```

**❌ MISTAKE 5: Prompts that tell LLMs to always contradict the user**
```
// BUG — "Don't just agree with the trader" made Groq always disagree
// regardless of what the data showed

// FIX — tell the LLM to follow the DATA, not to oppose the user
"Recommend whatever the data supports. Confirm the user's direction
if signals back it. Only contradict if data clearly says otherwise."
```

**❌ MISTAKE 6: Entry window too narrow (9:30am-12:30pm only)**
```python
# BUG — cut off entire afternoon session silently
in_entry_window = (hour == 9 and minute >= 30) or (9 < hour < 12)

# FIX — full trading day
in_entry_window = (hour == 9 and minute >= 30) or (10 <= hour <= 14) or (hour == 15 and minute <= 50)
```

**❌ MISTAKE 7: Stagger logic that silently blocked entries**
```python
# BUG — only 1 ticker allowed at 9:30am, slowly unlocking more
# looked like it was working but wasn't entering trades
if ticker_idx > stagger_slot:
    continue  # silently skipped, no log entry

# FIX — remove stagger, let all tickers be evaluated
# Add logging to every skip so nothing is invisible
```

**❌ MISTAKE 8: Daily loss limit using columns that don't exist**
```python
# BUG — current_price doesn't exist in sandbox_trades
# Every position appeared as a full loss, blocked all entries
unrealized = position.get("current_price", 0) - position.get("entry_price", 0)

# FIX — only use columns that actually exist in the schema
# When in doubt, check the schema before writing the query
```

**❌ MISTAKE 9: Force-close not updating all account stats**
```typescript
// BUG — only updated balance, not peak/total_trades/win_rate
await supabase.from('sandbox_account').update({ balance: newBalance })

// FIX — always mirror the worker's full accounting
await supabase.from('sandbox_account').update({
    balance: newBalance,
    peak_balance: Math.max(existing.peak_balance, newBalance),
    total_trades: existing.total_trades + 1,
    winning_trades: existing.winning_trades + (pnl > 0 ? 1 : 0),
    losing_trades: existing.losing_trades + (pnl < 0 ? 1 : 0),
})
```

**❌ MISTAKE 10: Overconfidence check blocking opposite-direction trades**
```python
# BUG — 3 consecutive long wins blocked ALL directions including shorts
if three_wins:
    return True  # blocked everything

# FIX — only block same direction
if three_wins and proposed_direction == win_direction:
    return True  # only block same direction
```

**❌ MISTAKE 11: MAE formula subtracting unrelated values**
```tsx
// BUG — subtracting stop distance from worst P&L (wrong formula)
return s + Math.min(0, t.pnl_pct ?? 0) - entryStop

// FIX — MAE is simply the worst drawdown reached
return s + Math.min(0, t.pnl_pct ?? 0)
```

**❌ MISTAKE 12: Worktree left from previous session doubling lint output**
```bash
# Always clean up old worktrees
git worktree list
git worktree remove <path> --force
git worktree prune
```

**❌ MISTAKE 13: Thinking it's a different day/time without checking**
```bash
# ALWAYS check actual ET time before making time-based assumptions
python3 -c "from datetime import datetime; import zoneinfo; et = datetime.now(zoneinfo.ZoneInfo('America/New_York')); print(et.strftime('%A %I:%M %p ET'))"
```

---

## War Room Scoring System

Every business scored weekly on 4 dimensions (100 points total):

| Dimension | Weight | What it measures |
|---|---|---|
| Revenue | 40pts | Actual $ in vs target |
| Growth | 25pts | Week over week trend |
| Agent Health | 20pts | % of agents running correctly |
| Market | 15pts | Is the market still growing? |

**< 40/100 → Flag for review**
**< 20/100 → Recommend shutdown**
**> 80/100 → Scale up resources**

---

## Daily Chairman Brief Format

Every morning at 7am, the Chairman agent sends exactly this:

```
EMPIRE BRIEF — [Day] [Date]

💰 REVENUE LAST 24H: $X,XXX
   [Company]: $X ↑/↓
   [Company]: $X ↑/↓

🤖 AGENT ACTIVITY
   X tasks completed | X leads found | X articles published

⚠️ NEEDS YOUR ATTENTION (max 3 items)
   1. [Action required — one sentence]
   2. [Action required — one sentence]

✅ EVERYTHING ELSE RUNNING FINE
```

**Hard rule: never more than 3 items requiring attention. If there are 10 problems, the War Room handles 7 of them autonomously. Only the ones that genuinely need a human come to the Chairman.**

---

## Environment Variables (All Projects)

```bash
# LLMs
GROQ_API_KEY=
GROQ_API_KEY_2=
GROQ_API_KEY_3=
ANTHROPIC_API_KEY=        # Claude Opus for judgment calls

# Live Internet
TAVILY_API_KEY=            # Real-time web search
PERPLEXITY_API_KEY=        # Deep research

# Observability
LANGFUSE_SECRET_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com

# Code Execution
E2B_API_KEY=               # Safe code sandbox

# App Integrations
COMPOSIO_API_KEY=          # 250+ app integrations

# Infrastructure (already have these)
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
POLYGON_API_KEY=
WORKER_SERVICE_URL=        # Railway worker URL
```

---

## Build Order

### Week 1 — Foundation
1. Wire Tavily into stock-bot workers (live internet NOW)
2. Add Langfuse to stock-bot (observability NOW)
3. Build War Room dashboard page in existing Next.js
4. Build shared task queue in Supabase

### Week 2 — First New Company
5. Lead Gen Agency (CrewAI: Prospector + Researcher + Copywriter + Outreach + Deal Closer)
6. Connect Composio for email sending
7. First external revenue

### Week 3 — Builder Agent
8. Coder Agent (Claude API)
9. Tester Agent (E2B sandbox)
10. Deployer Agent (Composio Vercel + GitHub MCPs)
11. After this: describe a business, it exists by morning

### Month 2 — Content + Intelligence
12. Content Empire (6 agents)
13. Oracle + Trend Surfer (live intelligence)
14. Idea Hunter + Market Validator

### Month 3 — Ecommerce + Self-Improvement
15. Ecommerce Operators (6 agents)
16. Skill Builder + Prompt Engineer
17. Evolution Agent

### Month 4 — Full Autonomy
18. All 47 agents running
19. War Room making kill/scale decisions
20. You review 5-minute brief, make 1-3 calls per week

---

## File Naming Conventions

- Agent files: `agents/tier[N]-[name]/[agent_name].py`
- Prompts: `shared/prompts/[agent_name]/v[N].md` (versioned)
- Company workers: `companies/[name]/workers/[worker_name].py`
- Skills: `shared/skills/[category]_skills.py`
- Dashboard pages: `dashboard/app/[feature]/page.tsx`

---

## Key Rule

**Never build something an MCP server already does.**
Before writing any code to connect to an external service, check if Composio or another MCP server already handles it. Composio alone covers 250+ apps — GitHub, Vercel, Gmail, Stripe, HubSpot, Notion, Slack, and more.
