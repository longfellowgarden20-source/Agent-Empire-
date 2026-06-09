# AGENTS.md — Full Roster

47 agents across 9 tiers. Each has one job. One model. One schedule.

---

## TIER 1 — THE GODS
*Run everything. Nothing bypasses these.*

### 1. Chairman
- **Job:** Synthesize everything happening across all companies into a 5-minute morning brief. Maximum 3 items requiring human attention.
- **Model:** Claude Opus
- **Schedule:** Daily 7:00am ET
- **Reads from:** All company metrics, War Room scores, agent alerts
- **Writes to:** `chairman_briefs` table, push notification to user
- **File:** `agents/tier1-gods/chairman.py`

### 2. War Room Judge
- **Job:** Score every business 0-100 every Sunday. Kill < 20. Flag < 40. Scale > 80. No emotion.
- **Model:** Claude Opus
- **Schedule:** Sunday 8:00pm ET
- **Reads from:** All company revenue data, agent performance scores, market data
- **Writes to:** `business_scores` table, Chairman queue
- **File:** `agents/tier1-gods/war_room_judge.py`

### 3. Architect
- **Job:** Design new companies from scratch. Takes a validated idea → produces complete tech spec, agent roster, revenue model, and build plan.
- **Model:** Claude Opus
- **Schedule:** On-demand (triggered by War Room)
- **Reads from:** `validated_ideas` table, existing company patterns
- **Writes to:** `company_specs` table
- **File:** `agents/tier1-gods/architect.py`

### 4. Oracle
- **Job:** Read everything happening in the world right now — markets, news, regulation, competitor moves. Feed intelligence to all other agents.
- **Model:** Groq llama-3.3-70b + Tavily + Perplexity
- **Schedule:** Every 30 minutes during market hours, every 2 hours otherwise
- **Tools:** Tavily (live search), Perplexity Sonar (deep research)
- **Writes to:** `oracle_intelligence` table (all agents read from here)
- **File:** `agents/tier1-gods/oracle.py`

### 5. Capital Allocator
- **Job:** Watch spend vs revenue across all companies. Shift budget toward highest ROI. Tell Chairman exactly where to invest next dollar.
- **Model:** Claude Opus
- **Schedule:** Daily 6:00am ET
- **Reads from:** All company financials, API costs, Langfuse spend data
- **Writes to:** `capital_recommendations` table
- **File:** `agents/tier1-gods/capital_allocator.py`

---

## TIER 2 — THE BUILDERS
*Create new things without human coding.*

### 6. Idea Hunter
- **Job:** Find real problems people are paying to solve RIGHT NOW. Score every idea 1-10. Only surface 8+.
- **Model:** Groq + Tavily + Perplexity
- **Schedule:** Daily 6:30am ET
- **Tools:** Tavily (Reddit, Twitter, forums), Google Trends API
- **Writes to:** `raw_ideas` table
- **File:** `agents/tier2-builders/idea_hunter.py`

### 7. Market Validator
- **Job:** Stress-test every idea from Idea Hunter. Is anyone paying? How big is the market? Who are the competitors? Kill bad ideas fast.
- **Model:** Claude Opus + Tavily
- **Schedule:** Triggered by Idea Hunter
- **Writes to:** `validated_ideas` table (score + reasoning)
- **File:** `agents/tier2-builders/market_validator.py`

### 8. Coder
- **Job:** Write complete production codebases. Full Next.js frontends + Python workers + DB schemas. Output: working deployable code.
- **Model:** Claude Opus (200k context)
- **Schedule:** On-demand (triggered by Architect)
- **Tools:** E2B sandbox (test code before shipping), GitHub MCP, Context7 (live docs)
- **Writes to:** GitHub repo via MCP
- **File:** `agents/tier2-builders/coder.py`

### 9. Tester
- **Job:** QA everything Coder produces. Run tests in E2B sandbox. Find bugs before they go live. Block Deployer if tests fail.
- **Model:** Claude Sonnet + E2B
- **Schedule:** Triggered by Coder finishing
- **Tools:** E2B (run code), GitHub MCP (read code)
- **Writes to:** `test_results` table
- **File:** `agents/tier2-builders/tester.py`

### 10. Deployer
- **Job:** Deploy tested code to Vercel, set up Railway workers, configure env vars, register new business in War Room.
- **Model:** Groq (fast, deterministic tasks)
- **Schedule:** Triggered by Tester passing
- **Tools:** Composio Vercel MCP, Composio GitHub MCP
- **Writes to:** `deployed_companies` table, War Room
- **File:** `agents/tier2-builders/deployer.py`

### 11. Skill Builder
- **Job:** Every week, read ALL agent outputs. Find bottom 20% performers. Rewrite their prompts. A/B test. Keep winners. System improves automatically.
- **Model:** Claude Opus
- **Schedule:** Every Sunday 9:00pm ET
- **Reads from:** Langfuse traces, agent output quality scores
- **Writes to:** `agent_prompts` table (versioned), Langfuse
- **File:** `agents/tier2-builders/skill_builder.py`

---

## TIER 3 — REVENUE HUNTERS
*Every agent here exists to bring in money.*

### 12. Prospector
- **Job:** Find 50 qualified potential clients every day. Score each 1-10. Only pass 7+ forward.
- **Model:** Groq + Tavily + Playwright
- **Schedule:** Daily 9:00am ET weekdays
- **Tools:** Tavily (find businesses), Playwright (scrape their sites)
- **Writes to:** `prospects` table
- **File:** `agents/tier3-revenue/prospector.py`

### 13. Researcher
- **Job:** Deep intel file on each qualified prospect. Their pain points, decision makers, budget signals, recent news.
- **Model:** Claude Sonnet + Tavily + Perplexity
- **Schedule:** Triggered by Prospector
- **Writes to:** `prospect_intel` table
- **File:** `agents/tier3-revenue/researcher.py`

### 14. Copywriter
- **Job:** Write personalized cold outreach for each prospect using their intel file. Never generic. One email per prospect.
- **Model:** Hermes-3 (follows style guide, persona-holding)
- **Schedule:** Triggered by Researcher
- **Writes to:** `outreach_queue` table
- **File:** `agents/tier3-revenue/copywriter.py`

### 15. Outreach Agent
- **Job:** Send emails on schedule. Manage timing. Follow up at day 3 and day 7. Track opens via Composio.
- **Model:** Groq (deterministic sending logic)
- **Schedule:** Weekdays 10:00am ET + follow-up checks
- **Tools:** Composio Gmail MCP
- **Writes to:** `outreach_log` table
- **File:** `agents/tier3-revenue/outreach_agent.py`

### 16. Deal Closer
- **Job:** Monitor all inbound replies. Draft responses. Book calendar meetings. Handle objections. Escalate only when it needs a human voice.
- **Model:** Claude Opus (high-stakes communication)
- **Schedule:** Check every 2 hours during business hours
- **Tools:** Composio Gmail MCP, Composio Calendar MCP
- **Writes to:** `deals_pipeline` table, Chairman queue (if needs human)
- **File:** `agents/tier3-revenue/deal_closer.py`

### 17. Upsell Agent
- **Job:** Watch existing clients for growth signals. Draft expansion proposals automatically.
- **Model:** Claude Sonnet + Tavily
- **Schedule:** Weekly Monday morning
- **Writes to:** `upsell_opportunities` table
- **File:** `agents/tier3-revenue/upsell_agent.py`

### 18. Retention Agent
- **Job:** Monitor client health. Spot churn risk early. Send value-add content. Flag at-risk accounts before they cancel.
- **Model:** Groq + Tavily
- **Schedule:** Weekly Friday
- **Writes to:** `client_health` table, Chairman queue (if high churn risk)
- **File:** `agents/tier3-revenue/retention_agent.py`

---

## TIER 4 — MARKET AGENTS
*Each one owns a market and watches it 24/7.*

### 19. Stock Intelligence
- **Already built** ✅ — `/Users/surfs/Desktop/stock-bot`
- 20 workers running on Railway

### 20. Crypto Watcher
- **Job:** Monitor on-chain signals, whale movements, narrative shifts. Feed to Capital Allocator.
- **Model:** Groq + Tavily
- **Schedule:** Every 30 minutes
- **File:** `agents/tier4-market/crypto_watcher.py`

### 21. Real Estate Scout
- **Job:** Watch listings, permit filings, neighborhood trends. Surface investment opportunities.
- **Model:** Claude Sonnet + Tavily + Playwright
- **Schedule:** Daily
- **File:** `agents/tier4-market/real_estate_scout.py`

### 22. Trend Surfer
- **Job:** Spot what's going viral 48-72 hours before it peaks. Feed Idea Hunter and Content Empire.
- **Model:** Groq + Tavily
- **Schedule:** Every hour
- **Tools:** Tavily (Reddit, Twitter, TikTok trends), Google Trends API
- **File:** `agents/tier4-market/trend_surfer.py`

### 23. Competitor Tracker
- **Job:** Monitor every competitor across all your businesses. Price changes, new features, funding, bad reviews.
- **Model:** Groq + Playwright + Tavily
- **Schedule:** Daily
- **File:** `agents/tier4-market/competitor_tracker.py`

### 24. Macro Watcher
- **Job:** Track Fed decisions, inflation, jobs data, geopolitical events. Tell all agents when macro shifts.
- **Model:** Groq + Tavily + FRED API
- **Schedule:** Every 2 hours on market days
- **File:** `agents/tier4-market/macro_watcher.py`

---

## TIER 5 — CONTENT MACHINE
*Produces content at inhuman scale.*

### 25. Content Strategist
- **Job:** Decide what to create based on Trend Surfer data and SEO gaps. Set weekly content plan for all brands.
- **Model:** Claude Sonnet
- **Schedule:** Every Monday 7:00am
- **File:** `agents/tier5-content/content_strategist.py`

### 26. Writer
- **Job:** Write blog posts, newsletters, long-form articles. Match brand voice. Publish automatically.
- **Model:** Hermes-3 (style adherence)
- **Schedule:** Triggered by Content Strategist
- **Tools:** Composio CMS MCP
- **File:** `agents/tier5-content/writer.py`

### 27. Social Agent
- **Job:** Adapt content for Twitter, LinkedIn, Instagram. Post on optimal schedule. Double down on what works.
- **Model:** Hermes-3
- **Schedule:** Daily based on platform optimal times
- **Tools:** Composio social MCPs
- **File:** `agents/tier5-content/social_agent.py`

### 28. Video Scripter
- **Job:** Write YouTube and TikTok scripts on trending topics. Optimized for watch time and conversion.
- **Model:** Claude Sonnet
- **Schedule:** 3x per week
- **File:** `agents/tier5-content/video_scripter.py`

### 29. SEO Agent
- **Job:** Audit all sites weekly. Find keyword gaps. Write optimized content. Monitor rankings. Fix technical issues.
- **Model:** Claude Sonnet + Tavily + GitHub MCP
- **Schedule:** Weekly
- **File:** `agents/tier5-content/seo_agent.py`

### 30. Email Marketer
- **Job:** Manage email lists across all businesses. Write sequences, broadcasts, re-engagement campaigns. A/B test subject lines.
- **Model:** Hermes-3 + Composio
- **Schedule:** Weekly campaigns + daily monitoring
- **File:** `agents/tier5-content/email_marketer.py`

---

## TIER 6 — ECOMMERCE OPERATORS
*Runs product businesses end to end.*

### 31. Product Scout
- **Job:** Find winning products using Google Trends, TikTok Shop data, Amazon BSR movement. Proven demand only.
- **Model:** Groq + Tavily
- **Schedule:** Daily
- **File:** `agents/tier6-ecommerce/product_scout.py`

### 32. Listing Agent
- **Job:** Write optimized product titles, descriptions, bullet points for Amazon, Shopify, Etsy. SEO-optimized.
- **Model:** Hermes-3
- **Schedule:** Triggered by Product Scout approval
- **File:** `agents/tier6-ecommerce/listing_agent.py`

### 33. Pricing Agent
- **Job:** Monitor competitor prices in real time. Auto-adjust prices to stay competitive while protecting margin.
- **Model:** Groq + Playwright
- **Schedule:** Every 2 hours
- **File:** `agents/tier6-ecommerce/pricing_agent.py`

### 34. Ad Agent
- **Job:** Create Facebook, Google, TikTok ad copy variants. Test them. Kill losers. Scale winners. Report ROAS daily.
- **Model:** Hermes-3 + Composio
- **Schedule:** Daily campaign management
- **File:** `agents/tier6-ecommerce/ad_agent.py`

### 35. Inventory Agent
- **Job:** Track stock levels. Predict reorder timing based on velocity. Send purchase orders automatically.
- **Model:** Groq
- **Schedule:** Daily
- **File:** `agents/tier6-ecommerce/inventory_agent.py`

### 36. Support Agent
- **Job:** Handle all customer emails and chat. Answer questions, process returns, resolve complaints. Escalate edge cases only.
- **Model:** Hermes-3 + Composio Gmail
- **Schedule:** Continuous (check every 30 min)
- **File:** `agents/tier6-ecommerce/support_agent.py`

---

## TIER 7 — INTELLIGENCE LAYER
*Feeds real-time knowledge into every agent.*

### 37. Web Crawler
- **Job:** Browse specific sites on schedule. Extract structured data. Feed into Supabase for other agents.
- **Model:** Groq + Playwright MCP
- **Schedule:** Per-target schedule (varies)
- **File:** `agents/tier7-intelligence/web_crawler.py`

### 38. News Aggregator
- **Job:** Pull from 50+ sources every 15 minutes. Classify, score relevance, route to right agents.
- **Model:** Groq + Tavily
- **Schedule:** Every 15 minutes
- **File:** `agents/tier7-intelligence/news_aggregator.py`

### 39. Data Scientist
- **Job:** Run weekly analysis on all business data. Find patterns humans miss. Revenue correlations, agent performance trends.
- **Model:** Claude Opus + E2B (run Python analysis)
- **Schedule:** Weekly Sunday
- **File:** `agents/tier7-intelligence/data_scientist.py`

### 40. Memory Keeper
- **Job:** Maintain the living knowledge base of everything the empire has learned. Every agent reads from this first.
- **Model:** Claude Sonnet
- **Schedule:** Continuous (updates on every agent run)
- **File:** `agents/tier7-intelligence/memory_keeper.py`

---

## TIER 8 — WATCHDOGS
*Make sure everything runs. Nothing breaks silently.*

### 41. Systems Monitor
- **Job:** Watch Railway, Vercel, Supabase 24/7. Alert the moment anything goes down. Already partially built in stock-bot.
- **Model:** Groq
- **Schedule:** Every 5 minutes
- **File:** `agents/tier8-watchdogs/systems_monitor.py`

### 42. Quality Inspector
- **Job:** Randomly sample output from every agent daily. Score quality. Flag anything below threshold.
- **Model:** Claude Sonnet
- **Schedule:** Daily
- **File:** `agents/tier8-watchdogs/quality_inspector.py`

### 43. Finance Tracker
- **Job:** Monitor revenue, expenses, invoices. Reconcile daily. Flag anomalies. Weekly P&L report.
- **Model:** Groq + Composio Stripe/accounting MCPs
- **Schedule:** Daily + weekly report
- **File:** `agents/tier8-watchdogs/finance_tracker.py`

### 44. Compliance Agent
- **Job:** Watch for legal/regulatory changes in your markets. Early warning only — not a lawyer.
- **Model:** Claude Sonnet + Tavily
- **Schedule:** Weekly
- **File:** `agents/tier8-watchdogs/compliance_agent.py`

### 45. Security Agent
- **Job:** Monitor for unusual API usage, unexpected costs, unauthorized access patterns. Auto-lock on anomalies.
- **Model:** Groq
- **Schedule:** Every 15 minutes
- **File:** `agents/tier8-watchdogs/security_agent.py`

---

## TIER 9 — META AGENTS
*Agents that improve the other agents.*

### 46. Prompt Engineer
- **Job:** Read agent output quality from Langfuse. Generate improved prompts. Run A/B tests. Push winners to production.
- **Model:** Claude Opus
- **Schedule:** Weekly (after Skill Builder)
- **File:** `agents/tier9-meta/prompt_engineer.py`

### 47. Evolution Agent
- **Job:** The highest level. Read everything — all agent performance, all business results, all market data. Propose changes to the entire system architecture. Suggest new agents, retire old ones, restructure the empire.
- **Model:** Claude Opus
- **Schedule:** Monthly
- **Writes to:** `evolution_proposals` table → Chairman for approval
- **File:** `agents/tier9-meta/evolution_agent.py`

---

## Inter-Agent Communication

Agents communicate through the `task_queue` table in Supabase:

```sql
CREATE TABLE task_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_agent text NOT NULL,
    to_agent text NOT NULL,
    task_type text NOT NULL,
    input_ref uuid,          -- reference to input data row
    payload jsonb,
    priority int DEFAULT 5,  -- 1-10, higher = more urgent
    status text DEFAULT 'pending',
    created_at timestamptz DEFAULT now(),
    picked_up_at timestamptz,
    completed_at timestamptz,
    result_ref uuid          -- reference to output data row
);
```

**Rule: agents pass references (IDs), not raw data.**
