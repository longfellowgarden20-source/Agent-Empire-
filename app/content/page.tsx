"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ContentPiece = {
  id: string;
  title: string;
  type: "article" | "social" | "email" | "video";
  status: "draft" | "review" | "published" | "scheduled";
  platform: string | null;
  seo_score: number | null;
  word_count: number | null;
  created_at: string;
  published_at: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#555555",
  review: "#f59e0b",
  published: "#22c55e",
  scheduled: "#3b82f6",
};

const TYPE_COLORS: Record<string, string> = {
  article: "#6366f1",
  social: "#22c55e",
  email: "#f59e0b",
  video: "#ef4444",
};

const TYPES = ["all", "article", "social", "email", "video"] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SeoBar({ score }: { score: number | null }) {
  if (score === null) {
    return <span style={{ fontSize: 12, color: "#444444", fontFamily: "var(--font-geist-mono, monospace)" }}>—</span>;
  }
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 48,
          height: 4,
          background: "#1f1f1f",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${score}%`,
            height: "100%",
            background: color,
            borderRadius: 2,
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "var(--font-geist-mono, monospace)",
          fontSize: 11,
          color,
        }}
      >
        {score}
      </span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        background: "#111111",
        border: "1px solid #1f1f1f",
        borderRadius: 6,
        padding: "14px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flex: 1,
        minWidth: 120,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-geist-mono, monospace)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "#555555",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-geist-mono, monospace)",
          fontSize: 22,
          fontWeight: 700,
          color: "#f5f5f5",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function ContentPage() {
  const [items, setItems] = useState<ContentPiece[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  async function fetchData(type: string) {
    setLoading(true);
    let query = supabase
      .from("content_pieces")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (type !== "all") {
      query = supabase
        .from("content_pieces")
        .select("*")
        .eq("type", type)
        .order("created_at", { ascending: false })
        .limit(200);
    }

    const { data } = await query;
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchData(filter);

    const sub = supabase
      .channel("content-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "content_pieces" },
        () => fetchData(filter)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [filter]);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const publishedThisWeek = items.filter(
    (i) => i.status === "published" && i.published_at && new Date(i.published_at) >= weekAgo
  ).length;
  const inDraft = items.filter((i) => i.status === "draft").length;
  const scheduled = items.filter((i) => i.status === "scheduled").length;
  const seoScores = items.map((i) => i.seo_score).filter((s): s is number => s !== null);
  const avgSeo = seoScores.length > 0 ? Math.round(seoScores.reduce((a, b) => a + b, 0) / seoScores.length) : 0;

  const displayed = filter === "all" ? items : items.filter((i) => i.type === filter);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        padding: "24px",
        fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
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
            Content Pipeline
          </h1>
          <p style={{ fontSize: 12, color: "#555555", margin: "4px 0 0 0" }}>
            Articles, social posts, emails, and videos across all platforms
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <StatCard label="Published this week" value={publishedThisWeek} />
          <StatCard label="In Draft" value={inDraft} />
          <StatCard label="Scheduled" value={scheduled} />
          <StatCard label="Avg SEO Score" value={avgSeo > 0 ? avgSeo : "—"} />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{
                fontFamily: "var(--font-geist-mono, monospace)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "5px 12px",
                borderRadius: 3,
                border: `1px solid ${filter === t ? "#2a2a2a" : "#1a1a1a"}`,
                background: filter === t ? "#1f1f1f" : "transparent",
                color: filter === t ? "#f5f5f5" : "#555555",
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ fontSize: 12, color: "#555555", fontFamily: "var(--font-geist-mono, monospace)" }}>
            Loading content...
          </p>
        ) : displayed.length === 0 ? (
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
            <p style={{ fontSize: 14, color: "#555555", margin: 0 }}>No content yet.</p>
            <p
              style={{
                fontSize: 12,
                color: "#333333",
                margin: 0,
                fontFamily: "var(--font-geist-mono, monospace)",
                textAlign: "center",
                maxWidth: 400,
              }}
            >
              Content agents produce articles, social posts, and emails automatically
            </p>
          </div>
        ) : (
          <div
            style={{
              background: "#111111",
              border: "1px solid #1f1f1f",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #1f1f1f",
                  }}
                >
                  {["Title", "Type", "Status", "Platform", "SEO Score", "Words", "Date"].map((col) => (
                    <th
                      key={col}
                      style={{
                        fontFamily: "var(--font-geist-mono, monospace)",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: "#555555",
                        padding: "10px 14px",
                        textAlign: "left",
                        fontWeight: 500,
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: idx < displayed.length - 1 ? "1px solid #161616" : "none",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 14px",
                        fontSize: 13,
                        color: "#cccccc",
                        maxWidth: 280,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.title}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-geist-mono, monospace)",
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          color: TYPE_COLORS[item.type] ?? "#555555",
                          border: `1px solid ${TYPE_COLORS[item.type] ?? "#555555"}`,
                          padding: "2px 6px",
                          borderRadius: 2,
                        }}
                      >
                        {item.type}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-geist-mono, monospace)",
                          fontSize: 11,
                          color: STATUS_COLORS[item.status] ?? "#555555",
                        }}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: "var(--font-geist-mono, monospace)",
                        fontSize: 11,
                        color: "#666666",
                      }}
                    >
                      {item.platform ?? "—"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <SeoBar score={item.seo_score} />
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: "var(--font-geist-mono, monospace)",
                        fontSize: 11,
                        color: "#555555",
                      }}
                    >
                      {item.word_count !== null ? item.word_count.toLocaleString() : "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: "var(--font-geist-mono, monospace)",
                        fontSize: 11,
                        color: "#444444",
                      }}
                    >
                      {formatDate(item.published_at ?? item.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
