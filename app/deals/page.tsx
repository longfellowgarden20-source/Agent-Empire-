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

const COLUMNS = [
  { key: "new", label: "NEW", color: "#333333" },
  { key: "drafted", label: "DRAFTED", color: "#6366f1" },
  { key: "sent", label: "SENT", color: "#3b82f6" },
  { key: "replied", label: "REPLIED", color: "#f59e0b" },
  { key: "meeting", label: "MEETING", color: "#10b981" },
  { key: "closed", label: "CLOSED", color: "#22c55e" },
  { key: "dead", label: "DEAD", color: "#ef4444" },
];

const DEAL_VALUE = 5000;

function daysInPipeline(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function formatCurrency(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

export default function DealsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
      .channel("deals_realtime")
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

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPipelineValue = prospects
    .filter((p) => p.outreach_status !== "dead")
    .reduce((sum, p) => sum + p.score * DEAL_VALUE, 0);

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
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "24px",
          marginBottom: "28px",
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "#f9fafb",
            letterSpacing: "0.05em",
            margin: 0,
          }}
        >
          DEALS
        </h1>
        <div
          style={{
            background: "#111111",
            border: "1px solid #22c55e",
            borderRadius: "5px",
            padding: "6px 14px",
            fontSize: "14px",
            color: "#22c55e",
            fontWeight: 700,
          }}
        >
          PIPELINE: {formatCurrency(totalPipelineValue)}
        </div>
        <span style={{ fontSize: "12px", color: "#4b5563" }}>
          estimated @ score × ${DEAL_VALUE.toLocaleString()}/deal
        </span>
      </div>

      <div style={{ overflowX: "auto", paddingBottom: "16px" }}>
        <div
          style={{
            display: "flex",
            gap: "12px",
            minWidth: "max-content",
            alignItems: "flex-start",
          }}
        >
          {COLUMNS.map((col) => {
            const colProspects = prospects.filter(
              (p) => p.outreach_status === col.key
            );
            const colValue = colProspects.reduce(
              (sum, p) => sum + p.score * DEAL_VALUE,
              0
            );

            return (
              <div
                key={col.key}
                style={{
                  width: "240px",
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    background: "#111111",
                    border: `1px solid ${col.color}`,
                    borderTop: `3px solid ${col.color}`,
                    borderRadius: "6px",
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: col.color,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {col.label}
                    </span>
                    <span
                      style={{
                        background: col.color,
                        color: "#fff",
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: "3px",
                      }}
                    >
                      {colProspects.length}
                    </span>
                  </div>
                  {col.key !== "dead" && colValue > 0 && (
                    <div style={{ fontSize: "11px", color: "#6b7280" }}>
                      {formatCurrency(colValue)}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {colProspects.map((p) => {
                    const days = daysInPipeline(p.created_at);
                    const isExpanded = expanded.has(p.id);
                    return (
                      <div
                        key={p.id}
                        style={{
                          background: "#111111",
                          border: "1px solid #1f1f1f",
                          borderRadius: "5px",
                          overflow: "hidden",
                          cursor: "pointer",
                          transition: "border-color 0.15s",
                        }}
                        onClick={() => toggleExpand(p.id)}
                      >
                        <div style={{ padding: "10px 12px" }}>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: "13px",
                              color: "#f9fafb",
                              marginBottom: "4px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {p.company_name}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "4px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "11px",
                                color:
                                  p.score >= 8
                                    ? "#22c55e"
                                    : p.score >= 6
                                    ? "#f59e0b"
                                    : "#6b7280",
                                fontWeight: 700,
                              }}
                            >
                              {p.score}/10
                            </span>
                            <span
                              style={{
                                fontSize: "10px",
                                color: days > 14 ? "#ef4444" : "#4b5563",
                              }}
                            >
                              {days}d
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#6b7280",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {p.industry}
                          </div>
                        </div>

                        {isExpanded && (
                          <div
                            style={{
                              borderTop: "1px solid #1f1f1f",
                              padding: "10px 12px",
                              background: "#0d0d0d",
                            }}
                          >
                            {p.intel?.pain_points &&
                              p.intel.pain_points.length > 0 && (
                                <div style={{ marginBottom: "10px" }}>
                                  <div
                                    style={{
                                      fontSize: "10px",
                                      color: "#6b7280",
                                      marginBottom: "4px",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.06em",
                                    }}
                                  >
                                    Pain Points
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "3px",
                                    }}
                                  >
                                    {p.intel.pain_points.map((pt, idx) => (
                                      <div
                                        key={idx}
                                        style={{
                                          fontSize: "11px",
                                          color: "#d1d5db",
                                          padding: "2px 0",
                                          borderLeft: "2px solid #f59e0b",
                                          paddingLeft: "6px",
                                        }}
                                      >
                                        {pt}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                            {p.intel?.email_subject && (
                              <div style={{ marginBottom: "8px" }}>
                                <div
                                  style={{
                                    fontSize: "10px",
                                    color: "#6b7280",
                                    marginBottom: "3px",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                  }}
                                >
                                  Subject
                                </div>
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#a5b4fc",
                                  }}
                                >
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
                                    marginBottom: "3px",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                  }}
                                >
                                  Email
                                </div>
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#9ca3af",
                                    maxHeight: "120px",
                                    overflow: "auto",
                                    background: "#0a0a0a",
                                    border: "1px solid #1f1f1f",
                                    borderRadius: "3px",
                                    padding: "8px",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {p.intel.email_body}
                                </div>
                              </div>
                            )}

                            {!p.intel?.pain_points &&
                              !p.intel?.email_subject &&
                              !p.intel?.email_body && (
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#4b5563",
                                  }}
                                >
                                  no intel yet
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {colProspects.length === 0 && (
                    <div
                      style={{
                        border: "1px dashed #1f1f1f",
                        borderRadius: "5px",
                        padding: "20px 12px",
                        textAlign: "center",
                        fontSize: "11px",
                        color: "#2d2d2d",
                      }}
                    >
                      empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
