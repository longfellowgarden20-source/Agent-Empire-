-- Agent Empire — Supabase Schema
-- Run this in your existing Supabase project (same DB as stock-bot)

-- ── Agent Memory ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_memory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent text NOT NULL,
    key text NOT NULL,
    value jsonb,
    updated_at timestamptz DEFAULT now(),
    UNIQUE (agent, key)
);

-- ── Task Queue (inter-agent communication) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_agent text NOT NULL,
    to_agent text NOT NULL,
    task_type text NOT NULL,
    payload jsonb,
    priority int DEFAULT 5,
    status text DEFAULT 'pending',   -- pending | in_progress | completed | failed
    created_at timestamptz DEFAULT now(),
    picked_up_at timestamptz,
    completed_at timestamptz,
    result jsonb
);
CREATE INDEX IF NOT EXISTS task_queue_to_agent_status ON task_queue (to_agent, status, priority DESC);

-- ── Agent Runs (observability) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent text NOT NULL,
    status text NOT NULL,            -- success | failed | skipped
    summary text,
    cost_usd numeric(10,6) DEFAULT 0,
    duration_ms int,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_runs_agent ON agent_runs (agent, created_at DESC);

-- ── Chairman Queue (morning brief) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chairman_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message text NOT NULL,
    priority int DEFAULT 5,
    requires_action boolean DEFAULT false,
    sent_in_brief boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- ── Business Registry ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text UNIQUE NOT NULL,
    status text DEFAULT 'active',    -- active | review | shutdown | building
    revenue_7d numeric DEFAULT 0,
    revenue_prev_7d numeric DEFAULT 0,
    war_room_score int,
    war_room_recommendation text,
    agent_count int DEFAULT 0,
    url text,
    railway_service_url text,
    manifest jsonb,   -- full spec: agent_instructions, tech_stack, db_tables, etc.
    created_at timestamptz DEFAULT now(),
    last_scored_at timestamptz
);

-- ── Ideas Pipeline ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ideas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    source text,                     -- reddit | trends | tavily | oracle
    raw_score int,                   -- 1-100 from Idea Hunter
    validated_score int,             -- 1-100 from Market Validator
    status text DEFAULT 'raw',       -- raw | validating | validated | building | live | killed
    market_data jsonb,
    spec jsonb,
    created_at timestamptz DEFAULT now()
);

-- ── Oracle Intelligence (live market data) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS oracle_intelligence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category text NOT NULL,         -- market | news | trend | competitor | macro
    ticker_or_topic text,
    summary text NOT NULL,
    raw_data jsonb,
    source_urls text[],
    relevance_score int,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oracle_recent ON oracle_intelligence (category, created_at DESC);

-- ── Prospects (Lead Gen) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prospects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name text NOT NULL,
    website text,
    industry text,
    size text,
    score int,                       -- 1-10 from Prospector
    intel jsonb,                     -- from Researcher
    outreach_status text DEFAULT 'new', -- new | drafted | sent | replied | meeting | closed | dead
    created_at timestamptz DEFAULT now()
);

-- ── Evolution Proposals ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evolution_proposals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal text NOT NULL,
    reasoning text,
    impact_estimate text,
    status text DEFAULT 'pending',   -- pending | approved | rejected
    created_at timestamptz DEFAULT now()
);

-- Enable Realtime on key tables (War Room dashboard)
ALTER PUBLICATION supabase_realtime ADD TABLE agent_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE chairman_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE businesses;
ALTER PUBLICATION supabase_realtime ADD TABLE task_queue;
