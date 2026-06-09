"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type IntelItem = {
  id: string;
  category: string;
  ticker_or_topic: string;
  summary: string;
  source_urls: string[];
  relevance_score: number;
  created_at: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  market: "#22c55e",
  macro: "#f59e0b",
  trend: "#6366f1",
  news: "#3b82f6",
  competitor: "#ef4444",
  ai: "#6366f1",
  startup: "#22c55e",
  ecommerce: "#f59e0b",
  regulation: "#ef4444",
  other: "#555555",
};

export default function OracleClient() {
  const [items, setItems] = useState<IntelItem[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  async function fetchIntel(cat?: string) {
    setLoading(true);
    let query = supabase
      .from("oracle_intelligence")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (cat && cat !== "all") query = query.eq("category", cat);

    const { data } = await query;
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchIntel(filter);

    const sub = supabase
      .channel("oracle-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "oracle_intelligence" }, () => fetchIntel(filter))
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [filter]);

  const categories = ["all", "market", "macro", "trend", "news", "competitor", "ai", "regulation"];

  return (
    <div className="flex flex-col gap-4 p-6" style={{ maxWidth: 900 }}>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold" style={{ color: "#f5f5f5" }}>Oracle</h1>
        <p className="text-xs" style={{ color: "#555555" }}>Live intelligence feed — updated every 30 min during market hours</p>
      </div>

      {/* category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className="px-3 py-1 text-xs uppercase tracking-wider rounded-sm transition-colors"
            style={{
              fontFamily: "var(--font-geist-mono)",
              background: filter === cat ? "#1f1f1f" : "transparent",
              color: filter === cat ? "#f5f5f5" : "#555555",
              border: `1px solid ${filter === cat ? "#2a2a2a" : "#1f1f1f"}`,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-xs" style={{ color: "#555555" }}>Loading intelligence...</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <p className="text-sm" style={{ color: "#555555" }}>No intel yet — Oracle agent hasn&apos;t run.</p>
          <p className="text-xs" style={{ color: "#333333" }}>Fill your .env.local and run: python agents/tier1-gods/oracle.py</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <IntelRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function IntelRow({ item }: { item: IntelItem }) {
  const color = CATEGORY_COLORS[item.category] || "#555555";
  const time = new Date(item.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York",
  });

  return (
    <div
      className="flex gap-4 p-4 rounded-sm"
      style={{ background: "#111111", border: "1px solid #1f1f1f" }}
    >
      <div className="flex flex-col items-center gap-1 shrink-0" style={{ width: 70 }}>
        <span className="text-xs tabular-nums" style={{ color: "#333333", fontFamily: "var(--font-geist-mono)" }}>{time}</span>
        <span
          className="text-xs uppercase tracking-wider"
          style={{ color, fontFamily: "var(--font-geist-mono)" }}
        >
          {item.category}
        </span>
        <span className="text-xs tabular-nums" style={{ color: "#333333", fontFamily: "var(--font-geist-mono)" }}>
          {item.relevance_score}/10
        </span>
      </div>

      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <p className="text-sm" style={{ color: "#f5f5f5" }}>{item.summary}</p>
        {item.source_urls?.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-1">
            {item.source_urls.slice(0, 2).map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs truncate max-w-xs"
                style={{ color: "#333333", fontFamily: "var(--font-geist-mono)" }}
              >
                {new URL(url).hostname}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
