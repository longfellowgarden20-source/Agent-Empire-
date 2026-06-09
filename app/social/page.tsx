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

const PLATFORM_COLORS: Record<string, string> = {
  twitter: "#1d9bf0",
  linkedin: "#0a66c2",
  instagram: "#e1306c",
  tiktok: "#ff0050",
  other: "#555555",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#555555",
  review: "#f59e0b",
  published: "#22c55e",
  scheduled: "#3b82f6",
};

const PLATFORMS = ["all", "twitter", "linkedin", "instagram", "tiktok"] as const;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function PlatformBadge({ platform }: { platform: string | null }) {
  const p = (platform ?? "other").toLowerCase();
  const color = PLATFORM_COLORS[p] ?? PLATFORM_COLORS.other;
  return (
    <span
      style={{
        fontFamily: "var(--font-geist-mono, monospace)",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color,
        border: `1px solid ${color}`,
        padding: "2px 7px",
        borderRadius: 2,
        flexShrink: 0,
      }}
    >
      {platform ?? "other"}
    </span>
  );
}

function PostCard({ item }: { item: ContentPiece }) {
  const statusColor = STATUS_COLORS[item.status] ?? "#555555";
  return (
    <div
      style={{
        background: "#111111",
        border: "1px solid #1f1f1f",
        borderRadius: 6,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <PlatformBadge platform={item.platform} />
        <span
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 11,
            color: statusColor,
            marginLeft: "auto",
          }}
        >
          {item.status}
        </span>
      </div>
      <p
        style={{
          fontSize: 13,
          color: "#cccccc",
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        {item.title}
      </p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <span
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 11,
            color: "#444444",
          }}
        >
          {item.status === "scheduled" && item.published_at
            ? `Scheduled: ${formatDateTime(item.published_at)}`
            : item.status === "published" && item.published_at
            ? `Published: ${formatDateTime(item.published_at)}`
            : `Created: ${formatDateTime(item.created_at)}`}
        </span>
        <div style={{ display: "flex", gap: 14 }}>
          <span
            style={{
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: 11,
              color: "#333333",
            }}
          >
            👁 0
          </span>
          <span
            style={{
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: 11,
              color: "#333333",
            }}
          >
            ♥ 0
          </span>
        </div>
      </div>
    </div>
  );
}

function QueueSection({ posts }: { posts: ContentPiece[] }) {
  if (posts.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "#3b82f6",
            border: "1px solid #3b82f6",
            padding: "2px 8px",
            borderRadius: 2,
          }}
        >
          Scheduled Queue
        </span>
        <span
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 11,
            color: "#444444",
          }}
        >
          {posts.length} post{posts.length !== 1 ? "s" : ""} queued
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
        {posts.map((item) => (
          <PostCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

export default function SocialPage() {
  const [items, setItems] = useState<ContentPiece[]>([]);
  const [platform, setPlatform] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    const { data } = await supabase
      .from("content_pieces")
      .select("*")
      .eq("type", "social")
      .order("created_at", { ascending: false })
      .limit(200);
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();

    const sub = supabase
      .channel("social-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "content_pieces" },
        (payload) => {
          const row = payload.new as ContentPiece;
          if (row.type === "social") {
            fetchData();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, []);

  const filtered =
    platform === "all"
      ? items
      : items.filter((i) => (i.platform ?? "").toLowerCase() === platform);

  const queued = [...filtered]
    .filter((i) => i.status === "scheduled")
    .sort((a, b) => {
      if (!a.published_at) return 1;
      if (!b.published_at) return -1;
      return new Date(a.published_at).getTime() - new Date(b.published_at).getTime();
    });

  const published = filtered.filter((i) => i.status === "published");
  const drafts = filtered.filter((i) => i.status === "draft" || i.status === "review");

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
            Social Feed
          </h1>
          <p style={{ fontSize: 12, color: "#555555", margin: "4px 0 0 0" }}>
            Social Agent publishes content automatically across platforms
          </p>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              style={{
                fontFamily: "var(--font-geist-mono, monospace)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "5px 12px",
                borderRadius: 3,
                border: `1px solid ${
                  platform === p
                    ? PLATFORM_COLORS[p] ?? "#2a2a2a"
                    : "#1a1a1a"
                }`,
                background: platform === p ? "#1a1a1a" : "transparent",
                color:
                  platform === p
                    ? PLATFORM_COLORS[p] ?? "#f5f5f5"
                    : "#555555",
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ fontSize: 12, color: "#555555", fontFamily: "var(--font-geist-mono, monospace)" }}>
            Loading social posts...
          </p>
        ) : filtered.length === 0 ? (
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
            <p style={{ fontSize: 14, color: "#555555", margin: 0 }}>No posts yet.</p>
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
              Social Agent publishes content automatically across platforms
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {queued.length > 0 && <QueueSection posts={queued} />}

            {published.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono, monospace)",
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      color: "#22c55e",
                      border: "1px solid #22c55e",
                      padding: "2px 8px",
                      borderRadius: 2,
                    }}
                  >
                    Published
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono, monospace)",
                      fontSize: 11,
                      color: "#444444",
                    }}
                  >
                    {published.length} post{published.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 10,
                  }}
                >
                  {published.map((item) => (
                    <PostCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}

            {drafts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono, monospace)",
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      color: "#555555",
                      border: "1px solid #333333",
                      padding: "2px 8px",
                      borderRadius: 2,
                    }}
                  >
                    Drafts & Review
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono, monospace)",
                      fontSize: 11,
                      color: "#444444",
                    }}
                  >
                    {drafts.length} post{drafts.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 10,
                  }}
                >
                  {drafts.map((item) => (
                    <PostCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
