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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function SourceLinks({ urls }: { urls: string[] }) {
  if (!urls || urls.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {urls.slice(0, 4).map((url, i) => {
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
              borderBottom: "1px solid #2a2a2a",
            }}
          >
            {display}
          </a>
        );
      })}
    </div>
  );
}

function HighlightBox({ item }: { item: IntelItem }) {
  return (
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #ef4444",
        borderLeft: "3px solid #ef4444",
        borderRadius: 6,
        padding: "20px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "#ef4444",
            border: "1px solid #ef4444",
            padding: "2px 8px",
            borderRadius: 2,
          }}
        >
          Latest High-Priority Intel
        </span>
        <span
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 11,
            color: "#555555",
          }}
        >
          {timeAgo(item.created_at)}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 13,
            fontWeight: 700,
            color: "#ef4444",
          }}
        >
          {item.relevance_score}/10
        </span>
      </div>
      {item.ticker_or_topic && (
        <p
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 12,
            color: "#888888",
            margin: 0,
          }}
        >
          {item.ticker_or_topic}
        </p>
      )}
      <p
        style={{
          fontSize: 15,
          color: "#e5e5e5",
          lineHeight: 1.65,
          margin: 0,
          fontWeight: 400,
        }}
      >
        {item.summary}
      </p>
      <SourceLinks urls={item.source_urls} />
    </div>
  );
}

function IntelCard({ item }: { item: IntelItem }) {
  const scoreColor = item.relevance_score >= 8 ? "#ef4444" : item.relevance_score >= 6 ? "#f59e0b" : "#555555";
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
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {item.ticker_or_topic && (
          <span
            style={{
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: 11,
              color: "#888888",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.ticker_or_topic}
          </span>
        )}
        <span
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 11,
            color: scoreColor,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {item.relevance_score}/10
        </span>
        <span
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 11,
            color: "#444444",
            flexShrink: 0,
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
      <SourceLinks urls={item.source_urls} />
    </div>
  );
}

export default function CompetitorsPage() {
  const [items, setItems] = useState<IntelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function fetchData() {
    setLoading(true);
    const { data } = await supabase
      .from("oracle_intelligence")
      .select("*")
      .eq("category", "competitor")
      .order("created_at", { ascending: false })
      .limit(50);
    setItems(data || []);
    setLastUpdated(new Date());
    setLoading(false);
  }

  useEffect(() => {
    fetchData();

    const sub = supabase
      .channel("competitors-channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "oracle_intelligence" },
        (payload) => {
          const row = payload.new as IntelItem;
          if (row.category === "competitor") {
            setItems((prev) => [row, ...prev]);
            setLastUpdated(new Date());
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, []);

  const highlight = items.find((i) => i.relevance_score >= 8) ?? null;
  const rest = highlight ? items.filter((i) => i.id !== highlight.id) : items;

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
              Competitor Watch
            </h1>
            <p style={{ fontSize: 12, color: "#555555", margin: "4px 0 0 0" }}>
              Competitor Tracker agent monitors rival moves and threats
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

        {loading ? (
          <p style={{ fontSize: 12, color: "#555555", fontFamily: "var(--font-geist-mono, monospace)" }}>
            Scanning competitor activity...
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
            <p style={{ fontSize: 14, color: "#555555", margin: 0 }}>No competitor intel yet.</p>
            <p
              style={{
                fontSize: 12,
                color: "#333333",
                margin: 0,
                fontFamily: "var(--font-geist-mono, monospace)",
              }}
            >
              Competitor Tracker agent runs every 12 hours
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {highlight && <HighlightBox item={highlight} />}
            {rest.map((item) => (
              <IntelCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
