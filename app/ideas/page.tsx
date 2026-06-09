"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Idea = {
  id: string;
  title: string;
  description: string;
  source: string;
  raw_score: number;
  validated_score: number;
  status: string;
  market_data: Record<string, any>;
  spec: Record<string, any>;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  raw: "#555",
  validating: "#f59e0b",
  validated: "#6366f1",
  building: "#3b82f6",
  live: "#22c55e",
  killed: "#ef4444",
};

const STATUS_ORDER = ["raw", "validating", "validated", "building", "live", "killed"];

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  async function fetchIdeas() {
    let query = supabase.from("ideas").select("*").order("created_at", { ascending: false }).limit(50);
    if (filter !== "all") query = query.eq("status", filter);
    const { data } = await query;
    setIdeas(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchIdeas();
    const sub = supabase.channel("ideas-ch")
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas" }, fetchIdeas)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [filter]);

  const counts: Record<string, number> = {};
  ideas.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });

  return (
    <div style={{ padding: 24, maxWidth: 1000, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ color: "#f5f5f5", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Ideas Pipeline</h1>
        <p style={{ color: "#555", fontSize: 12, fontFamily: "monospace" }}>
          {ideas.length} ideas · {counts["validated"] || 0} validated · {counts["live"] || 0} live
        </p>
      </div>

      {/* pipeline stages */}
      <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
        {STATUS_ORDER.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <button onClick={() => setFilter(s === filter ? "all" : s)} style={{
              fontFamily: "monospace", fontSize: 10, padding: "6px 14px",
              background: filter === s ? STATUS_COLORS[s] + "20" : "transparent",
              color: filter === s ? STATUS_COLORS[s] : "#333",
              border: `1px solid ${filter === s ? STATUS_COLORS[s] + "40" : "#1a1a1a"}`,
              cursor: "pointer", textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap",
            }}>
              {s} {counts[s] ? `(${counts[s]})` : "(0)"}
            </button>
            {i < STATUS_ORDER.length - 1 && (
              <span style={{ color: "#222", fontSize: 12, padding: "0 2px" }}>→</span>
            )}
          </div>
        ))}
        <button onClick={() => setFilter("all")} style={{
          marginLeft: 12, fontFamily: "monospace", fontSize: 10, padding: "6px 14px",
          background: filter === "all" ? "#1f1f1f" : "transparent",
          color: filter === "all" ? "#f5f5f5" : "#333",
          border: "1px solid #1a1a1a", cursor: "pointer",
        }}>ALL</button>
      </div>

      {loading ? (
        <p style={{ color: "#555", fontSize: 12 }}>Loading ideas...</p>
      ) : ideas.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#444" }}>
          <p style={{ fontSize: 14, marginBottom: 8 }}>No ideas yet</p>
          <p style={{ fontSize: 12, marginBottom: 4 }}>Idea Hunter runs every 6 hours and searches for business opportunities</p>
          <p style={{ fontSize: 12, color: "#333" }}>Needs Gemini + Tavily keys to activate</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ideas.map(idea => <IdeaCard key={idea.id} idea={idea} />)}
        </div>
      )}
    </div>
  );
}

function IdeaCard({ idea }: { idea: Idea }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = STATUS_COLORS[idea.status] || "#555";
  const score = idea.validated_score || idea.raw_score;
  const scoreColor = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#555";
  const date = new Date(idea.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 2 }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "14px 16px", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* score */}
        <div style={{ textAlign: "center", minWidth: 40 }}>
          <div style={{ color: scoreColor, fontSize: 20, fontFamily: "monospace", fontWeight: 700, lineHeight: 1 }}>
            {score || "?"}
          </div>
          <div style={{ color: "#333", fontSize: 9, fontFamily: "monospace" }}>SCORE</div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ color: "#f5f5f5", fontSize: 14, fontWeight: 600 }}>{idea.title}</span>
            <span style={{
              color: statusColor, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase",
              background: statusColor + "15", padding: "2px 6px", borderRadius: 2, letterSpacing: 1,
            }}>{idea.status}</span>
            {idea.source && (
              <span style={{ color: "#333", fontSize: 9, fontFamily: "monospace" }}>via {idea.source}</span>
            )}
          </div>
          {idea.description && (
            <p style={{ color: "#888", fontSize: 12, lineHeight: 1.5, margin: 0 }}>{idea.description}</p>
          )}
        </div>

        <span style={{ color: "#333", fontSize: 10, fontFamily: "monospace", shrink: 0 } as any}>{date}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid #111", marginTop: 0 }}>
          {idea.market_data && Object.keys(idea.market_data).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ color: "#444", fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", marginBottom: 6 }}>Market Data</p>
              {idea.market_data.reasoning && (
                <p style={{ color: "#888", fontSize: 12, lineHeight: 1.5 }}>{idea.market_data.reasoning}</p>
              )}
              {idea.market_data.competitors && (
                <p style={{ color: "#666", fontSize: 11, marginTop: 4 }}>Competitors: {idea.market_data.competitors}</p>
              )}
            </div>
          )}
          {idea.spec && Object.keys(idea.spec).length > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: "#080810", border: "1px solid #1a1a2a", borderRadius: 2 }}>
              <p style={{ color: "#6366f1", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>ARCHITECT SPEC</p>
              {idea.spec.revenue_model && (
                <p style={{ color: "#ccc", fontSize: 12, marginBottom: 4 }}>💰 {idea.spec.revenue_model}</p>
              )}
              {idea.spec.agent_roster && (
                <p style={{ color: "#888", fontSize: 12 }}>🤖 {Array.isArray(idea.spec.agent_roster) ? idea.spec.agent_roster.join(", ") : idea.spec.agent_roster}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
