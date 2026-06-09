"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type IntelItem = {
  id: string;
  category: string;
  summary: string;
  raw_data: Record<string, unknown>;
  source_urls: string[];
  relevance_score: number;
  ticker_or_topic: string;
  created_at: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  market: "#22c55e",
  macro: "#f59e0b",
  trend: "#6366f1",
  news: "#3b82f6",
  competitor: "#ef4444",
  other: "#555555",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "#22c55e" : score >= 6 ? "#f59e0b" : "#555555";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 36,
        borderRadius: 4,
        border: `2px solid ${color}`,
        color,
        fontFamily: "var(--font-geist-mono, monospace)",
        fontSize: 16,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {score}
    </div>
  );
}

function CategoryTag({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
  return (
    <span
      style={{
        fontFamily: "var(--font-geist-mono, monospace)",
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color,
        border: `1px solid ${color}`,
        padding: "2px 6px",
        borderRadius: 2,
        flexShrink: 0,
      }}
    >
      {category}
    </span>
  );
}

function TrendCard({ item }: { item: IntelItem }) {
  return (
    <div
      style={{
        background: "#111111",
        border: "1px solid #1f1f1f",
        borderRadius: 6,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <ScoreBadge score={item.relevance_score} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <CategoryTag category={item.category} />
            {item.ticker_or_topic && (
              <span
                style={{
                  fontFamily: "var(--font-geist-mono, monospace)",
                  fontSize: 11,
                  color: "#888888",
                }}
              >
                {item.ticker_or_topic}
              </span>
            )}
            <span
              style={{
                fontFamily: "var(--font-geist-mono, monospace)",
                fontSize: 11,
                color: "#444444",
                marginLeft: "auto",
              }}
            >
              {timeAgo(item.created_at)}
            </span>
          </div>
          <p
            style={{
              fontSize: 13,
              color: "#cccccc",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {item.summary}
          </p>
        </div>
      </div>
      {item.source_urls && item.source_urls.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingLeft: 48 }}>
          {item.source_urls.slice(0, 3).map((url, i) => {
            let display = url;
            try {
              display = new URL(url).hostname.replace("www.", "");
            } catch {}
            return (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "var(--font-geist-mono, monospace)",
                  fontSize: 11,
                  color: "#555555",
                  textDecoration: "none",
                  borderBottom: "1px solid #333333",
                }}
              >
                {display}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

const FILTERS = ["all", "market", "macro", "trend", "news", "competitor"] as const;

export default function TrendsPage() {
  const [items, setItems] = useState<IntelItem[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function fetchData(cat: string) {
    setLoading(true);
    let query = supabase
      .from("oracle_intelligence")
      .select("*")
      .in("category", ["trend", "market", "macro", "news", "competitor"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (cat !== "all") {
      query = supabase
        .from("oracle_intelligence")
        .select("*")
        .eq("category", cat)
        .order("created_at", { ascending: false })
        .limit(50);
    }

    const { data } = await query;
    setItems(data || []);
    setLastUpdated(new Date());
    setLoading(false);
  }

  useEffect(() => {
    fetchData(filter);

    const sub = supabase
      .channel("trends-channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "oracle_intelligence" },
        () => fetchData(filter)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [filter]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        padding: "24px",
        fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: "#f5f5f5",
                margin: 0,
                fontFamily: "var(--font-geist-mono, monospace)",
                letterSpacing: "-0.01em",
              }}
            >
              Trend Intelligence
            </h1>
            <p style={{ fontSize: 12, color: "#555555", margin: "4px 0 0 0" }}>
              Oracle agent scans the web for emerging trends and market signals
            </p>
          </div>
          {lastUpdated && (
            <span
              style={{
                fontFamily: "var(--font-geist-mono, monospace)",
                fontSize: 11,
                color: "#444444",
              }}
            >
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                fontFamily: "var(--font-geist-mono, monospace)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "5px 12px",
                borderRadius: 3,
                border: `1px solid ${filter === cat ? "#2a2a2a" : "#1a1a1a"}`,
                background: filter === cat ? "#1f1f1f" : "transparent",
                color: filter === cat ? "#f5f5f5" : "#555555",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ fontSize: 12, color: "#555555", fontFamily: "var(--font-geist-mono, monospace)" }}>
            Fetching intelligence...
          </p>
        ) : items.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "80px 0",
              gap: 8,
            }}
          >
            <p style={{ fontSize: 14, color: "#555555", margin: 0 }}>No trends detected yet.</p>
            <p
              style={{
                fontSize: 12,
                color: "#333333",
                margin: 0,
                fontFamily: "var(--font-geist-mono, monospace)",
              }}
            >
              Oracle agent runs every 8 hours — check back soon
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item) => (
              <TrendCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
