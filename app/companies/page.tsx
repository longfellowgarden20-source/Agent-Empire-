"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
  status: string;
  
  war_room_score: number | null;
  
  revenue_7d: number | null;
  created_at: string;
};

type FilterTab = "all" | "active" | "building" | "paused" | "killed";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  building: "#3b82f6",
  paused: "#f59e0b",
  killed: "#ef4444",
  idea: "#6366f1",
};

function scoreColor(score: number | null): string {
  if (score === null) return "#333";
  if (score > 80) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function fmtRevenue(n: number | null | undefined): string {
  if (n === null || n === undefined) return "$0";
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

export default function CompaniesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  async function fetchData() {
    const { data } = await supabase
      .from("businesses")
      .select("id,name,slug,status,war_room_score,revenue_7d,revenue_prev_7d,created_at")
      .order("created_at", { ascending: false });
    if (data) setBusinesses(data as Business[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();

    const sub = supabase
      .channel("companies-businesses")
      .on("postgres_changes", { event: "*", schema: "public", table: "businesses" }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, []);

  const filtered =
    filter === "all" ? businesses : businesses.filter((b) => b.status === filter);

  const activeCount = businesses.filter((b) => b.status === "active").length;
  const totalCount = businesses.length;

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "ALL" },
    { key: "active", label: "ACTIVE" },
    { key: "building", label: "BUILDING" },
    { key: "paused", label: "PAUSED" },
    { key: "killed", label: "KILLED" },
  ];

  const mono: React.CSSProperties = { fontFamily: "var(--font-geist-mono)" };

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", padding: "32px 40px", ...mono }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 28,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>
            WAR ROOM / COMPANIES
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f5f5f5", letterSpacing: 1 }}>
            Empire
          </h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>{activeCount}</span>
          <span style={{ fontSize: 13, color: "#444", marginLeft: 6 }}>active</span>
          <span style={{ fontSize: 13, color: "#333", marginLeft: 4 }}>/ {totalCount} total</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 28,
          borderBottom: "1px solid #1a1a1a",
          paddingBottom: 0,
        }}
      >
        {tabs.map((tab) => {
          const active = filter === tab.key;
          const count =
            tab.key === "all"
              ? businesses.length
              : businesses.filter((b) => b.status === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                background: "none",
                border: "none",
                borderBottom: active ? "2px solid #6366f1" : "2px solid transparent",
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 10,
                letterSpacing: 2,
                color: active ? "#f5f5f5" : "#555",
                textTransform: "uppercase",
                marginBottom: -1,
                transition: "color 0.15s",
                ...mono,
              }}
            >
              {tab.label}
              <span
                style={{
                  marginLeft: 6,
                  color: active ? "#6366f1" : "#333",
                  fontSize: 9,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ color: "#444", fontSize: 13, padding: "40px 0" }}>Loading businesses...</div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            color: "#444",
            fontSize: 13,
            padding: "80px 0",
            textAlign: "center",
            letterSpacing: 1,
          }}
        >
          {filter === "all"
            ? "No businesses yet — Idea Hunter is searching for opportunities"
            : `No ${filter} businesses`}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((b) => {
            const statusColor = STATUS_COLORS[b.status] ?? "#555";
            const score = b.war_room_score ?? 0;
            const barColor = scoreColor(b.war_room_score);

            return (
              <div
                key={b.id}
                style={{
                  background: "#0f0f0f",
                  border: "1px solid #1a1a1a",
                  padding: "20px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#2a2a2a";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#1a1a1a";
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#f5f5f5", marginBottom: 4 }}>
                      {b.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#888",
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {b.status === "active" ? "Active business" : b.status === "building" ? "Under construction" : b.status ?? "—"}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      background: statusColor + "14",
                      border: `1px solid ${statusColor}30`,
                      borderRadius: 2,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: statusColor,
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 9,
                        color: statusColor,
                        letterSpacing: 2,
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      {b.status}
                    </span>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 6,
                      fontSize: 10,
                      color: "#444",
                      letterSpacing: 1,
                    }}
                  >
                    <span>WAR ROOM SCORE</span>
                    <span style={{ color: barColor, fontWeight: 600 }}>
                      {b.war_room_score !== null ? b.war_room_score : "—"}/100
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      background: "#1a1a1a",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, Math.max(0, score))}%`,
                        background: barColor,
                        borderRadius: 2,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", gap: 24 }}>
                    <div>
                      <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase", marginBottom: 3 }}>
                        Today
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#22c55e" }}>
                        {fmtRevenue(b.revenue_7d)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase", marginBottom: 3 }}>
                        Agents
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#f5f5f5" }}>
                        {(b as any).agent_count ?? "—"}
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/companies/${b.slug}`}
                    style={{
                      fontSize: 10,
                      letterSpacing: 2,
                      color: "#6366f1",
                      textDecoration: "none",
                      padding: "6px 14px",
                      border: "1px solid #6366f130",
                      background: "#6366f108",
                      textTransform: "uppercase",
                      transition: "border-color 0.15s, color 0.15s",
                      display: "inline-block",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.borderColor = "#6366f160";
                      (e.currentTarget as HTMLAnchorElement).style.color = "#818cf8";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.borderColor = "#6366f130";
                      (e.currentTarget as HTMLAnchorElement).style.color = "#6366f1";
                    }}
                  >
                    OPEN →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
