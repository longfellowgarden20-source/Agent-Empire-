-- Seed data so the War Room dashboard shows something while agents spin up
-- Run this AFTER supabase-empire.sql

-- Sample businesses
INSERT INTO businesses (name, slug, status, revenue_7d, revenue_prev_7d, war_room_score, agent_count, url) VALUES
  ('Lead Gen Agency', 'lead-gen-agency', 'building', 0, 0, 45, 5, null),
  ('Content Empire', 'content-empire', 'building', 0, 0, 30, 6, null),
  ('Stock Intelligence', 'stock-intelligence', 'active', 0, 0, 72, 20, null)
ON CONFLICT (slug) DO NOTHING;

-- Sample chairman queue items
INSERT INTO chairman_queue (message, priority, requires_action, sent_in_brief) VALUES
  ('🚀 Empire is online. Agents are initializing — add Groq + Tavily keys to Railway to activate.', 9, true, false),
  ('📋 Run supabase-empire.sql first, then this seed file to populate tables.', 7, false, false),
  ('🤖 All 47 agents built and deployed to Railway. Waiting for API keys.', 5, false, false)
ON CONFLICT DO NOTHING;

-- Sample agent runs to show the live feed
INSERT INTO agent_runs (agent, status, summary, duration_ms) VALUES
  ('systems_monitor', 'success', 'All systems nominal. Railway: online. Vercel: online. Supabase: online.', 312),
  ('oracle', 'skipped', 'TAVILY_API_KEY not configured — skipping live search', 10),
  ('news_aggregator', 'skipped', 'TAVILY_API_KEY not configured — skipping', 8),
  ('chairman', 'skipped', 'No businesses with revenue data yet', 5);
