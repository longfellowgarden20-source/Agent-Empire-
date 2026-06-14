-- Template generation tables for Gumroad + TikTok automation

CREATE TABLE IF NOT EXISTS templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    category text,  -- notion, figma, canva, prompts
    gumroad_product_id text UNIQUE,
    gumroad_url text,
    price_cents int,
    description text,
    target_customer text,
    status text DEFAULT 'draft',  -- draft, live, archived
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tiktok_hooks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid REFERENCES templates(id) ON DELETE CASCADE,
    script text NOT NULL,
    angle text,  -- the viral angle used
    status text DEFAULT 'draft',  -- draft, queued, posted, archived
    video_url text,
    views int DEFAULT 0,
    engagement int DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    posted_at timestamptz
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_tiktok_hooks_product ON tiktok_hooks(product_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_hooks_status ON tiktok_hooks(status);
