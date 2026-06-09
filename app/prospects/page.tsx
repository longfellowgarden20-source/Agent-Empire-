"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Prospect = {
  id: string;
  company_name: string;
  website: string;
  industry: string;
  size: string;
  score: number;
  intel: Record<string, any>;
  outreach_status: string;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  new: "#555555",
  drafted: "#6366f1",
  sent: "#3b82f6",
  replied: "#f59e0b",
  meeting: "#10b981",
  closed: "#22c55e",
  dead: "#ef4444",
  needs_email: "#f97316",
};

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  async function fetchProspects() {
    let query = supabase
      .from("prospects")
      .select("*")
      .order("score", { ascending: false })
      .limit(100);
    if (filter !== "all") query = query.eq("outreach_status", filter);
    const { data } = await query;
    setProspects(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchProspects();
    const sub = supabase.channel("prospects-ch")
      .on("postgres_changes", { event: "*", schema: "public", table: "prospects" }, fetchProspects)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [filter]);

  const statuses = ["all", "new", "drafted", "sent", "replied", "meeting", "closed", "dead"];
  const counts: Record<string, number> = {};
  prospects.forEach(p => { counts[p.outreach_status] = (counts[p.outreach_status] || 0) + 1; });

  return (
    <div style={{ padding: 24, maxWidth: 1000, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ color: "#f5f5f5", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Prospects</h1>
        <p style={{ color: "#555", fontSize: 12, fontFamily: "monospace" }}>
          {prospects.length} total · {counts["meeting"] || 0} in meeting · {counts["closed"] || 0} closed
        </p>
      </div>

      {/* pipeline counts */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            fontFamily: "monospace", fontSize: 10, padding: "4px 10px",
            background: filter === s ? "#1f1f1f" : "transparent",
            color: filter === s ? (STATUS_COLORS[s] || "#f5f5f5") : "#444",
            border: `1px solid ${filter === s ? "#2a2a2a" : "#1a1a1a"}`,
            borderRadius: 2, cursor: "pointer", textTransform: "uppercase", letterSpacing: 1,
          }}>
            {s} {s !== "all" && counts[s] ? `(${counts[s]})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "#555", fontSize: 12 }}>Loading prospects...</p>
      ) : prospects.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#444" }}>
          <p style={{ fontSize: 14, marginBottom: 8 }}>No prospects yet</p>
          <p style={{ fontSize: 12 }}>Prospector agent runs daily — add Tavily + Gemini keys to activate</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {/* header */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 120px 80px 100px 80px",
            padding: "8px 16px", fontFamily: "monospace", fontSize: 10,
            color: "#333", textTransform: "uppercase", letterSpacing: 1,
            borderBottom: "1px solid #1a1a1a",
          }}>
            <span>Company</span>
            <span>Industry</span>
            <span style={{ textAlign: "right" }}>Score</span>
            <span style={{ textAlign: "center" }}>Status</span>
            <span style={{ textAlign: "right" }}>Added</span>
          </div>
          {prospects.map(p => <ProspectRow key={p.id} prospect={p} />)}
        </div>
      )}
    </div>
  );
}

function ProspectRow({ prospect: p }: { prospect: Prospect }) {
  const [expanded, setExpanded] = useState(false);
  const color = STATUS_COLORS[p.outreach_status] || "#555";
  const date = new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const scoreColor = p.score >= 8 ? "#22c55e" : p.score >= 6 ? "#f59e0b" : "#555";

  return (
    <>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "grid", gridTemplateColumns: "1fr 120px 80px 100px 80px",
          padding: "12px 16px", background: "#0d0d0d", cursor: "pointer",
          borderBottom: "1px solid #111", alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ color: "#f5f5f5", fontSize: 13 }}>{p.company_name}</span>
          {p.website && (
            <a href={p.website} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: "#333", fontSize: 10, fontFamily: "monospace" }}>
              {p.website.replace(/^https?:\/\//, "").split("/")[0]}
            </a>
          )}
        </div>
        <span style={{ color: "#555", fontSize: 11, fontFamily: "monospace" }}>{p.industry?.split(" ").slice(0, 3).join(" ")}</span>
        <span style={{ color: scoreColor, fontSize: 14, fontFamily: "monospace", textAlign: "right", fontWeight: 600 }}>
          {p.score || "—"}/10
        </span>
        <span style={{ color, fontSize: 10, fontFamily: "monospace", textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
          ● {p.outreach_status}
        </span>
        <span style={{ color: "#333", fontSize: 10, fontFamily: "monospace", textAlign: "right" }}>{date}</span>
      </div>
      {expanded && p.intel && (
        <div style={{ padding: "12px 16px 16px", background: "#080808", borderBottom: "1px solid #111" }}>
          {p.intel.pain_points && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: "#444", fontSize: 10, fontFamily: "monospace", textTransform: "uppercase" }}>Pain Points</span>
              <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {p.intel.pain_points.map((pt: string, i: number) => (
                  <span key={i} style={{ color: "#f59e0b", fontSize: 11, fontFamily: "monospace", background: "#1a1400", padding: "2px 8px", borderRadius: 2 }}>{pt}</span>
                ))}
              </div>
            </div>
          )}
          {p.intel.reasoning && (
            <p style={{ color: "#888", fontSize: 12, lineHeight: 1.5 }}>{p.intel.reasoning}</p>
          )}
          {p.intel.email_subject && (
            <div style={{ marginTop: 10, padding: 12, background: "#0d0d1a", border: "1px solid #1a1a2a", borderRadius: 2 }}>
              <p style={{ color: "#6366f1", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>DRAFTED EMAIL</p>
              <p style={{ color: "#ccc", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{p.intel.email_subject}</p>
              <p style={{ color: "#888", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{p.intel.email_body}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
