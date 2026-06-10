"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ─── helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "overdue";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `in ${h}h`;
  return `in ${m}m`;
}

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

const mono: React.CSSProperties = { fontFamily: "monospace" };

// ─── Feature 11 — TopIntelCard ───────────────────────────────────────────────

type IntelRow = {
  id: string;
  category: string;
  relevance_score: number;
  summary: string;
  source_url: string | null;
  created_at: string;
};

const categoryColor: Record<string, string> = {
  trend: "#f59e0b",
  market: "#3b82f6",
  competitor: "#ef4444",
  opportunity: "#22c55e",
  risk: "#f97316",
};

export function TopIntelCard() {
  const [row, setRow] = useState<IntelRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("oracle_intelligence")
        .select("*")
        .order("relevance_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setRow(data ?? null);
      setLoading(false);
    })();
  }, []);

  if (loading) return null;

  const cat = row?.category ?? "";
  const catColor = categoryColor[cat] ?? "#888";

  return (
    <div
      style={{
        ...mono,
        background: "#0d0d0d",
        border: "1px solid #1a1a1a",
        borderRadius: 6,
        padding: "12px 16px",
        fontSize: 13,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#555",
          marginBottom: 8,
          letterSpacing: 1,
        }}
      >
        TOP ORACLE INTEL
      </div>

      {!row ? (
        <div style={{ color: "#444", fontSize: 12 }}>
          Oracle agent runs every 8h — check back soon
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span
              style={{
                background: catColor + "22",
                color: catColor,
                border: `1px solid ${catColor}44`,
                borderRadius: 3,
                padding: "2px 7px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {cat || "GENERAL"}
            </span>
            <span
              style={{
                background: "#1a1a1a",
                color: "#e5e7eb",
                border: "1px solid #333",
                borderRadius: 3,
                padding: "2px 7px",
                fontSize: 11,
              }}
            >
              {row.relevance_score}/10
            </span>
            <span style={{ color: "#444", fontSize: 11, marginLeft: "auto" }}>
              {timeAgo(row.created_at)}
            </span>
          </div>

          <div
            style={{
              color: "#ccc",
              lineHeight: 1.5,
              marginBottom: row.source_url ? 8 : 0,
            }}
          >
            {row.summary}
          </div>

          {row.source_url && (
            <a
              href={row.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#3b82f6",
                fontSize: 11,
                textDecoration: "none",
                borderBottom: "1px solid #1d4ed8",
              }}
            >
              {row.source_url.replace(/^https?:\/\//, "").split("/")[0]} →
            </a>
          )}
        </>
      )}
    </div>
  );
}

// ─── Feature 12 — TrendAlert ─────────────────────────────────────────────────

export function TrendAlert() {
  const [row, setRow] = useState<IntelRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
      const { data } = await supabase
        .from("oracle_intelligence")
        .select("*")
        .eq("category", "trend")
        .gte("relevance_score", 9)
        .gte("created_at", since)
        .order("relevance_score", { ascending: false })
        .limit(1)
        .maybeSingle();
      setRow(data ?? null);
      setLoading(false);
    })();
  }, []);

  if (loading || !row) return null;

  return (
    <div
      style={{
        ...mono,
        background: "#1a1000",
        border: "1px solid #f59e0b",
        borderRadius: 6,
        padding: "12px 16px",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            background: "#f59e0b",
            color: "#000",
            borderRadius: 3,
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          🔥 HOT TREND
        </span>
        <span style={{ color: "#f59e0b", fontSize: 11 }}>
          {row.relevance_score}/10 · {timeAgo(row.created_at)}
        </span>
      </div>
      <div style={{ color: "#fde68a", lineHeight: 1.5 }}>{row.summary}</div>
      {row.source_url && (
        <a
          href={row.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#f59e0b",
            fontSize: 11,
            textDecoration: "none",
            display: "block",
            marginTop: 6,
          }}
        >
          {row.source_url.replace(/^https?:\/\//, "").split("/")[0]} →
        </a>
      )}
    </div>
  );
}

// ─── Feature 13 — SalesFunnelMini ────────────────────────────────────────────

type FunnelCounts = {
  prospects: number;
  drafted: number;
  sent: number;
  replied: number;
  meeting: number;
  closed: number;
};

const stageColors: Record<string, string> = {
  prospects: "#888",
  drafted: "#60a5fa",
  sent: "#a78bfa",
  replied: "#34d399",
  meeting: "#f59e0b",
  closed: "#22c55e",
};

export function SalesFunnelMini() {
  const [counts, setCounts] = useState<FunnelCounts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("prospects")
        .select("outreach_status");

      if (!data) { setLoading(false); return; }

      const c: FunnelCounts = {
        prospects: 0, drafted: 0, sent: 0,
        replied: 0, meeting: 0, closed: 0,
      };
      for (const row of data) {
        const s = (row.outreach_status ?? "").toLowerCase();
        if (s === "prospects" || s === "new" || s === "") c.prospects++;
        else if (s === "drafted") c.drafted++;
        else if (s === "sent") c.sent++;
        else if (s === "replied") c.replied++;
        else if (s === "meeting") c.meeting++;
        else if (s === "closed") c.closed++;
        else c.prospects++;
      }
      setCounts(c);
      setLoading(false);
    })();
  }, []);

  if (loading) return null;

  const stages: { label: string; key: keyof FunnelCounts }[] = [
    { label: "Prospects", key: "prospects" },
    { label: "Drafted", key: "drafted" },
    { label: "Sent", key: "sent" },
    { label: "Replied", key: "replied" },
    { label: "Meeting", key: "meeting" },
    { label: "Closed", key: "closed" },
  ];

  return (
    <div
      style={{
        ...mono,
        background: "#0d0d0d",
        border: "1px solid #1a1a1a",
        borderRadius: 6,
        padding: "10px 14px",
        fontSize: 12,
      }}
    >
      <div style={{ fontSize: 10, color: "#555", marginBottom: 8, letterSpacing: 1 }}>
        SALES FUNNEL
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
        {stages.map((s, i) => (
          <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <a
              href="/prospects"
              style={{ textDecoration: "none" }}
              title={`View ${s.label}`}
            >
              <span style={{ color: "#666", fontSize: 10 }}>{s.label}</span>
              <span
                style={{
                  color: stageColors[s.key],
                  fontWeight: 700,
                  marginLeft: 3,
                }}
              >
                ({counts?.[s.key] ?? 0})
              </span>
            </a>
            {i < stages.length - 1 && (
              <span style={{ color: "#333", margin: "0 2px" }}>→</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Feature 14 — IdeasScoreboard ────────────────────────────────────────────

type IdeaCounts = {
  raw: number;
  validating: number;
  validated: number;
  building: number;
  live: number;
  killed: number;
};

export function IdeasScoreboard() {
  const [counts, setCounts] = useState<IdeaCounts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("ideas").select("status");
      if (!data) { setLoading(false); return; }

      const c: IdeaCounts = {
        raw: 0, validating: 0, validated: 0,
        building: 0, live: 0, killed: 0,
      };
      for (const row of data) {
        const s = (row.status ?? "raw").toLowerCase() as keyof IdeaCounts;
        if (s in c) c[s]++;
      }
      setCounts(c);
      setLoading(false);
    })();
  }, []);

  if (loading) return null;

  const shown: { key: keyof IdeaCounts; label: string; color: string }[] = [
    { key: "raw", label: "raw", color: "#888" },
    { key: "validated", label: "validated", color: "#60a5fa" },
    { key: "building", label: "building", color: "#3b82f6" },
    { key: "live", label: "live", color: "#22c55e" },
  ];

  return (
    <div
      style={{
        ...mono,
        background: "#0d0d0d",
        border: "1px solid #1a1a1a",
        borderRadius: 6,
        padding: "10px 14px",
        fontSize: 12,
      }}
    >
      <div style={{ fontSize: 10, color: "#555", marginBottom: 8, letterSpacing: 1 }}>
        IDEAS BOARD
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {shown.map((s, i) => (
          <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <a
              href={`/ideas?status=${s.key}`}
              style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
            >
              <span style={{ color: "#555", fontSize: 11 }}>{s.label}:</span>
              <span style={{ color: s.color, fontWeight: 700, fontSize: 14 }}>
                {counts?.[s.key] ?? 0}
              </span>
            </a>
            {i < shown.length - 1 && (
              <span style={{ color: "#2a2a2a", marginLeft: 4 }}>·</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Feature 15 — WarRoomScoresGrid ──────────────────────────────────────────

type BizRow = {
  id: string;
  name: string;
  slug?: string;
  war_room_score: number | null;
};

function scoreBg(score: number) {
  if (score < 40) return { bg: "#1a0000", border: "#7f1d1d", color: "#ef4444" };
  if (score <= 80) return { bg: "#1a1400", border: "#78350f", color: "#f59e0b" };
  return { bg: "#001a00", border: "#14532d", color: "#22c55e" };
}

export function WarRoomScoresGrid() {
  const [businesses, setBusinesses] = useState<BizRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("businesses")
        .select("id, name, slug, war_room_score")
        .order("war_room_score", { ascending: false });
      setBusinesses((data ?? []) as BizRow[]);
      setLoading(false);
    })();
  }, []);

  if (loading || businesses.length === 0) return null;

  return (
    <div
      style={{
        ...mono,
        background: "#0d0d0d",
        border: "1px solid #1a1a1a",
        borderRadius: 6,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 10, color: "#555", marginBottom: 10, letterSpacing: 1 }}>
        WAR ROOM SCORES
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {businesses.map((b) => {
          const score = b.war_room_score ?? 0;
          const { bg, border, color } = scoreBg(score);
          const slug = b.slug ?? toSlug(b.name);
          const name = b.name.length > 15 ? b.name.slice(0, 14) + "…" : b.name;
          return (
            <a
              key={b.id}
              href={`/companies/${slug}`}
              style={{ textDecoration: "none" }}
            >
              <div
                style={{
                  width: 120,
                  background: bg,
                  border: `1px solid ${border}`,
                  borderRadius: 5,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    color: "#888",
                    fontSize: 10,
                    marginBottom: 4,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {name}
                </div>
                <div style={{ color, fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
                  {score}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ─── Feature 16 — BusinessesNeedingAttention ─────────────────────────────────

export function BusinessesNeedingAttention() {
  const [businesses, setBusinesses] = useState<BizRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("businesses")
        .select("id, name, slug, war_room_score")
        .lt("war_room_score", 40)
        .order("war_room_score", { ascending: true });
      setBusinesses((data ?? []) as BizRow[]);
      setLoading(false);
    })();
  }, []);

  if (loading || businesses.length === 0) return null;

  return (
    <div
      style={{
        ...mono,
        background: "#0d0d0d",
        border: "1px solid #1a1a1a",
        borderRadius: 6,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 10, color: "#ef4444", marginBottom: 10, letterSpacing: 1 }}>
        ⚠ BUSINESSES NEEDING ATTENTION
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {businesses.map((b) => {
          const score = b.war_room_score ?? 0;
          const slug = b.slug ?? toSlug(b.name);
          return (
            <div
              key={b.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                borderLeft: "3px solid #ef4444",
                paddingLeft: 10,
                paddingTop: 4,
                paddingBottom: 4,
              }}
            >
              <span style={{ color: "#ccc", fontSize: 13, flex: 1 }}>{b.name}</span>
              <span style={{ color: "#ef4444", fontSize: 18, fontWeight: 700, minWidth: 32 }}>
                {score}
              </span>
              <span
                style={{
                  background: "#7f1d1d",
                  color: "#fca5a5",
                  fontSize: 9,
                  borderRadius: 3,
                  padding: "2px 6px",
                  letterSpacing: 1,
                  fontWeight: 700,
                }}
              >
                NEEDS ATTENTION
              </span>
              <a
                href={`/companies/${slug}`}
                style={{
                  color: "#ef4444",
                  fontSize: 11,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                VIEW →
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Feature 17 — PublishingQueue ────────────────────────────────────────────

type ContentRow = {
  id: string;
  title: string;
  platform: string | null;
  published_at: string | null;
  status: string;
};

const platformColor: Record<string, string> = {
  twitter: "#1d9bf0",
  linkedin: "#0a66c2",
  blog: "#a78bfa",
  instagram: "#e1306c",
  youtube: "#ff0000",
  email: "#34d399",
};

export function PublishingQueue() {
  const [items, setItems] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("content_pieces")
          .select("id, title, platform, published_at, status")
          .eq("status", "scheduled")
          .order("published_at", { ascending: true })
          .limit(3);

        if (error) {
          setTableError(true);
        } else {
          setItems((data ?? []) as ContentRow[]);
        }
      } catch {
        setTableError(true);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return null;

  return (
    <div
      style={{
        ...mono,
        background: "#0d0d0d",
        border: "1px solid #1a1a1a",
        borderRadius: 6,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 10, color: "#555", marginBottom: 10, letterSpacing: 1 }}>
        PUBLISHING QUEUE
      </div>

      {tableError ? (
        <div style={{ color: "#444", fontSize: 12 }}>Content agents not active yet</div>
      ) : items.length === 0 ? (
        <div style={{ color: "#444", fontSize: 12 }}>No scheduled content</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item) => {
            const platform = (item.platform ?? "blog").toLowerCase();
            const pColor = platformColor[platform] ?? "#888";
            const title =
              item.title.length > 40 ? item.title.slice(0, 39) + "…" : item.title;
            const due = item.published_at ? timeUntil(item.published_at) : "—";
            return (
              <div
                key={item.id}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span
                  style={{
                    background: pColor + "22",
                    color: pColor,
                    border: `1px solid ${pColor}44`,
                    borderRadius: 3,
                    padding: "1px 6px",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  {platform}
                </span>
                <span style={{ color: "#aaa", fontSize: 12, flex: 1 }}>{title}</span>
                <span style={{ color: "#666", fontSize: 11, whiteSpace: "nowrap" }}>
                  {due}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Feature 18 — CostTracker ────────────────────────────────────────────────

export function CostTracker() {
  const [spent, setSpent] = useState<number | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);

      const [runsRes, budgetRes] = await Promise.all([
        supabase
          .from("agent_runs")
          .select("cost_usd")
          .gte("created_at", todayMidnight.toISOString()),
        supabase
          .from("agent_memory")
          .select("value")
          .eq("agent", "system")
          .eq("key", "daily_budget_usd")
          .maybeSingle(),
      ]);

      const totalSpent = (runsRes.data ?? []).reduce(
        (sum: number, r: { cost_usd: number | null }) => sum + (r.cost_usd ?? 0),
        0
      );
      setSpent(totalSpent);

      const budgetVal = budgetRes.data?.value;
      if (budgetVal !== null && budgetVal !== undefined) {
        setBudget(parseFloat(String(budgetVal)));
      }

      setLoading(false);
    })();
  }, []);

  if (loading) return null;

  const pct = budget && budget > 0 ? (spent ?? 0) / budget : null;
  const barColor =
    pct === null ? "#3b82f6"
    : pct < 0.7 ? "#22c55e"
    : pct < 0.9 ? "#f59e0b"
    : "#ef4444";

  return (
    <div
      style={{
        ...mono,
        background: "#0d0d0d",
        border: "1px solid #1a1a1a",
        borderRadius: 6,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 10, color: "#555", marginBottom: 8, letterSpacing: 1 }}>
        TODAY&apos;S LLM COST
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
        <span style={{ color: barColor, fontSize: 20, fontWeight: 700 }}>
          ${(spent ?? 0).toFixed(2)}
        </span>
        {budget !== null ? (
          <span style={{ color: "#555", fontSize: 12 }}>
            of ${budget.toFixed(2)} budget
            {pct !== null && (
              <span style={{ color: barColor, marginLeft: 6 }}>
                ({Math.round(pct * 100)}%)
              </span>
            )}
          </span>
        ) : (
          <span style={{ color: "#444", fontSize: 11 }}>No budget limit set</span>
        )}
      </div>

      {budget !== null && budget > 0 && pct !== null && (
        <div
          style={{
            background: "#1a1a1a",
            borderRadius: 4,
            height: 6,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: barColor,
              height: "100%",
              width: `${Math.min(100, Math.round(pct * 100))}%`,
              borderRadius: 4,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Feature 19 — LastChairmanBrief ──────────────────────────────────────────

type QueueRow = {
  id: string;
  message: string;
  priority: number | null;
  created_at: string;
};

const priorityDotColor = (p: number | null) => {
  if (!p) return "#555";
  if (p >= 8) return "#ef4444";
  if (p >= 5) return "#f59e0b";
  return "#22c55e";
};

export function LastChairmanBrief() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("chairman_queue")
        .select("id, message, priority, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      setRows((data ?? []) as QueueRow[]);
      setLoading(false);
    })();
  }, []);

  if (loading || rows.length === 0) return null;

  const latestDate = new Date(rows[0].created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      style={{
        ...mono,
        background: "#0d0d0d",
        border: "1px solid #1a1a1a",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          padding: "12px 14px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ color: "#aaa", fontSize: 12, fontFamily: "monospace" }}>
          LAST BRIEF —{" "}
          <span style={{ color: "#666" }}>{latestDate}</span>
        </span>
        <span style={{ color: "#555", fontSize: 14 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid #1a1a1a", padding: "8px 14px 12px" }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "5px 0",
                borderBottom: "1px solid #111",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: priorityDotColor(r.priority),
                  flexShrink: 0,
                  marginTop: 4,
                }}
              />
              <span style={{ color: "#bbb", fontSize: 12, flex: 1, lineHeight: 1.5 }}>
                {r.message}
              </span>
              <span style={{ color: "#444", fontSize: 10, whiteSpace: "nowrap", marginTop: 2 }}>
                {timeAgo(r.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Feature 20 — EmpireScore ────────────────────────────────────────────────

export function EmpireScore() {
  const [target, setTarget] = useState(0);
  const [displayed, setDisplayed] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const tick = useCallback(() => {
    setDisplayed((prev) => {
      if (prev >= target) return target;
      const step = Math.max(1, Math.ceil((target - prev) / 8));
      return Math.min(prev + step, target);
    });
  }, [target]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("businesses")
        .select("war_room_score")
        .not("war_room_score", "is", null);

      const scores = (data ?? []).map((b: { war_room_score: number }) => b.war_room_score);
      const n = scores.length;
      setCount(n);
      if (n > 0) {
        const avg = Math.round(scores.reduce((s: number, v: number) => s + v, 0) / n);
        setTarget(avg);
      } else {
        setTarget(0);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    setDisplayed(0);
    const id = setInterval(() => {
      setDisplayed((prev) => {
        if (prev >= target) { clearInterval(id); return target; }
        const step = Math.max(1, Math.ceil((target - prev) / 8));
        return Math.min(prev + step, target);
      });
    }, 40);
    return () => clearInterval(id);
  }, [target, loading]);

  // keep tick dep satisfied
  void tick;

  if (loading) return null;

  const scoreColor =
    displayed < 40 ? "#ef4444"
    : displayed <= 70 ? "#f59e0b"
    : "#22c55e";

  return (
    <div
      style={{
        ...mono,
        background: "#0d0d0d",
        border: "1px solid #1a1a1a",
        borderRadius: 6,
        padding: "24px 16px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          color: scoreColor,
          fontSize: 72,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: -2,
          transition: "color 0.3s",
        }}
      >
        {displayed}
      </div>
      <div
        style={{
          color: "#555",
          fontSize: 11,
          letterSpacing: 3,
          marginTop: 8,
          textTransform: "uppercase",
        }}
      >
        Empire Score
      </div>
      <div style={{ color: "#333", fontSize: 11, marginTop: 4 }}>
        avg of {count} {count === 1 ? "business" : "businesses"}
      </div>
    </div>
  );
}

// ─── Default export ───────────────────────────────────────────────────────────

const CommandCenterExtras = {
  TopIntelCard,
  TrendAlert,
  SalesFunnelMini,
  IdeasScoreboard,
  WarRoomScoresGrid,
  BusinessesNeedingAttention,
  PublishingQueue,
  CostTracker,
  LastChairmanBrief,
  EmpireScore,
};

export default CommandCenterExtras;
