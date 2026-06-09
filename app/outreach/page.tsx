"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type Intel = {
  email_subject?: string;
  email_body?: string;
  pain_points?: string[];
};

type Prospect = {
  id: string;
  company_name: string;
  website: string;
  industry: string;
  score: number;
  outreach_status: string;
  intel: Intel | null;
  created_at: string;
};

function pipelineStats(prospects: Prospect[]) {
  const total = prospects.length;
  const drafted = prospects.filter(
    (p) => p.outreach_status === "drafted"
  ).length;
  const sent = prospects.filter((p) => p.outreach_status === "sent").length;
  const replied = prospects.filter(
    (p) => p.outreach_status === "replied"
  ).length;
  const meeting = prospects.filter(
    (p) => p.outreach_status === "meeting"
  ).length;
  const closed = prospects.filter(
    (p) => p.outreach_status === "closed"
  ).length;
  return { total, drafted, sent, replied, meeting, closed };
}

function convPct(num: number, denom: number): string {
  if (denom === 0) return "0%";
  return `${Math.round((num / denom) * 100)}%`;
}

export default function OutreachPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortAsc, setSortAsc] = useState(false);

  const fetchProspects = useCallback(async () => {
    const { data } = await supabase
      .from("prospects")
      .select("*")
      .order("score", { ascending: false });
    if (data) setProspects(data as Prospect[]);
  }, []);

  useEffect(() => {
    fetchProspects();
    const channel = supabase
      .channel("prospects_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prospects" },
        () => fetchProspects()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProspects]);

  const markSent = async (id: string) => {
    await supabase
      .from("prospects")
      .update({ outreach_status: "sent" })
      .eq("id", id);
    fetchProspects();
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const stats = pipelineStats(prospects);

  const actionQueue = prospects.filter(
    (p) =>
      (p.outreach_status === "needs_email" || p.outreach_status === "new") &&
      p.score >= 7
  );

  const sorted = [...prospects].sort((a, b) =>
    sortAsc ? a.score - b.score : b.score - a.score
  );

  const funnelSteps = [
    { label: "DRAFTED", count: stats.drafted, base: stats.total },
    { label: "SENT", count: stats.sent, base: stats.drafted },
    { label: "REPLIED", count: stats.replied, base: stats.sent },
    { label: "MEETING", count: stats.meeting, base: stats.replied },
    { label: "CLOSED", count: stats.closed, base: stats.meeting },
  ];

  const statBoxStyle = {
    background: "#111111",
    border: "1px solid #1f1f1f",
    borderRadius: "6px",
    padding: "16px 20px",
    flex: "1 1 120px",
  };

  return (
    <div
      style={{
        background: "#0a0a0a",
        minHeight: "100vh",
        color: "#e5e7eb",
        fontFamily: "monospace",
        padding: "32px",
      }}
    >
      <h1
        style={{
          fontSize: "22px",
          fontWeight: 700,
          color: "#f9fafb",
          letterSpacing: "0.05em",
          marginBottom: "24px",
        }}
      >
        OUTREACH PIPELINE
      </h1>

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "32px",
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "TOTAL", value: stats.total, color: "#e5e7eb" },
          { label: "DRAFTED", value: stats.drafted, color: "#6366f1" },
          { label: "SENT", value: stats.sent, color: "#3b82f6" },
          { label: "REPLIED", value: stats.replied, color: "#f59e0b" },
          { label: "MEETINGS", value: stats.meeting, color: "#10b981" },
          { label: "CLOSED", value: stats.closed, color: "#22c55e" },
        ].map(({ label, value, color }) => (
          <div key={label} style={statBoxStyle}>
            <div
              style={{ fontSize: "11px", color: "#6b7280", marginBottom: "6px" }}
            >
              {label}
            </div>
            <div style={{ fontSize: "24px", fontWeight: 700, color }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "#111111",
          border: "1px solid #1f1f1f",
          borderRadius: "6px",
          padding: "20px",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            color: "#6b7280",
            marginBottom: "16px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Conversion Funnel
        </div>
        <div style={{ display: "flex", alignItems: "stretch", gap: "4px" }}>
          {funnelSteps.map((step, i) => {
            const pct = step.base > 0 ? step.count / step.base : 0;
            const barH = Math.max(20, Math.round(pct * 80));
            const colors = [
              "#6366f1",
              "#3b82f6",
              "#f59e0b",
              "#10b981",
              "#22c55e",
            ];
            return (
              <div
                key={step.label}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: colors[i],
                  }}
                >
                  {step.count}
                </div>
                <div
                  style={{
                    width: "100%",
                    height: `${barH}px`,
                    background: colors[i],
                    opacity: 0.7 - i * 0.08,
                    borderRadius: "3px",
                    transition: "height 0.3s",
                  }}
                />
                <div style={{ fontSize: "10px", color: "#6b7280" }}>
                  {step.label}
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "#4b5563",
                  }}
                >
                  {i === 0
                    ? convPct(step.count, stats.total)
                    : convPct(step.count, funnelSteps[i - 1].count)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {actionQueue.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <div
            style={{
              fontSize: "13px",
              color: "#f59e0b",
              marginBottom: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#f59e0b",
                display: "inline-block",
              }}
            />
            ACTION QUEUE — {actionQueue.length} prospects need emails
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {actionQueue.map((p) => (
              <div
                key={p.id}
                style={{
                  background: "#111111",
                  border: "1px solid #292524",
                  borderRadius: "6px",
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: "1 1 200px" }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "14px",
                      color: "#f9fafb",
                      marginBottom: "4px",
                    }}
                  >
                    {p.company_name}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      marginBottom: "6px",
                    }}
                  >
                    {p.industry}
                  </div>
                  {p.intel?.pain_points && p.intel.pain_points.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "4px",
                      }}
                    >
                      {p.intel.pain_points.map((pt, idx) => (
                        <span
                          key={idx}
                          style={{
                            background: "#1a1a1a",
                            border: "1px solid #292524",
                            borderRadius: "3px",
                            padding: "2px 8px",
                            fontSize: "11px",
                            color: "#d1d5db",
                          }}
                        >
                          {pt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    flex: "0 0 auto",
                  }}
                >
                  <span
                    style={{
                      background: "#1a1a1a",
                      border: "1px solid #22c55e",
                      color: "#22c55e",
                      padding: "4px 10px",
                      borderRadius: "4px",
                      fontSize: "13px",
                      fontWeight: 700,
                    }}
                  >
                    {p.score}/10
                  </span>
                  <button
                    onClick={() => markSent(p.id)}
                    style={{
                      background: "#3b82f6",
                      border: "none",
                      color: "#fff",
                      fontFamily: "monospace",
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "7px 14px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      letterSpacing: "0.06em",
                    }}
                  >
                    MARK SENT
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div
          style={{
            fontSize: "11px",
            color: "#6b7280",
            marginBottom: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          ALL PROSPECTS
          <button
            onClick={() => setSortAsc((v) => !v)}
            style={{
              background: "transparent",
              border: "1px solid #333",
              color: "#6b7280",
              fontFamily: "monospace",
              fontSize: "11px",
              padding: "3px 10px",
              borderRadius: "3px",
              cursor: "pointer",
            }}
          >
            SCORE {sortAsc ? "↑" : "↓"}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            gap: "0",
            borderBottom: "1px solid #1f1f1f",
            paddingBottom: "8px",
            marginBottom: "4px",
          }}
        >
          {["COMPANY", "SCORE", "INDUSTRY", "STATUS"].map((h) => (
            <div
              key={h}
              style={{
                fontSize: "10px",
                color: "#4b5563",
                letterSpacing: "0.08em",
                padding: "0 8px",
              }}
            >
              {h}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {sorted.map((p) => (
            <div
              key={p.id}
              style={{
                background: "#111111",
                border: "1px solid #1f1f1f",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <div
                onClick={() => toggleExpand(p.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  padding: "10px 8px",
                  cursor: "pointer",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "13px", color: "#f9fafb" }}>
                  {p.company_name}
                </span>
                <span
                  style={{
                    fontSize: "13px",
                    color: p.score >= 8 ? "#22c55e" : p.score >= 6 ? "#f59e0b" : "#6b7280",
                    fontWeight: 700,
                  }}
                >
                  {p.score}/10
                </span>
                <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                  {p.industry}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  {p.outreach_status}
                </span>
              </div>

              {expanded.has(p.id) && (
                <div
                  style={{
                    borderTop: "1px solid #1f1f1f",
                    padding: "14px 16px",
                    background: "#0d0d0d",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {p.intel?.email_subject && (
                    <div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#6b7280",
                          marginBottom: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        SUBJECT
                      </div>
                      <div style={{ fontSize: "13px", color: "#a5b4fc" }}>
                        {p.intel.email_subject}
                      </div>
                    </div>
                  )}
                  {p.intel?.email_body && (
                    <div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#6b7280",
                          marginBottom: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        EMAIL BODY
                      </div>
                      <pre
                        style={{
                          background: "#0a0a0a",
                          border: "1px solid #1f1f1f",
                          borderRadius: "4px",
                          padding: "12px",
                          fontSize: "12px",
                          color: "#d1d5db",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          margin: 0,
                          maxHeight: "200px",
                          overflow: "auto",
                        }}
                      >
                        {p.intel.email_body}
                      </pre>
                    </div>
                  )}
                  {!p.intel?.email_subject && !p.intel?.email_body && (
                    <div style={{ fontSize: "12px", color: "#4b5563" }}>
                      no email drafted yet
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
