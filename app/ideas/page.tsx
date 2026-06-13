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

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  raw:       { bg: "rgba(74,74,106,0.15)",  border: "rgba(74,74,106,0.3)",   text: "#4a4a6a" },
  validating:{ bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.3)",  text: "#fbbf24" },
  validated: { bg: "rgba(124,106,255,0.12)",border: "rgba(124,106,255,0.3)", text: "#a78bfa" },
  building:  { bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.3)",  text: "#60a5fa" },
  live:      { bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.3)",  text: "#34d399" },
  killed:    { bg: "rgba(248,113,113,0.12)",border: "rgba(248,113,113,0.3)", text: "#f87171" },
};

const STATUS_ORDER = ["raw", "validating", "validated", "building", "live", "killed"];

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState("");

  async function triggerScout() {
    setTriggering(true);
    setTriggerMsg("");
    try {
      const res = await fetch("/api/trigger-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: "scout" }),
      });
      const data = await res.json();
      setTriggerMsg(data.ok ? "Scout triggered — ideas appear in ~30s" : `Error: ${data.error}`);
    } catch {
      setTriggerMsg("Could not reach worker");
    }
    setTriggering(false);
  }

  async function fetchIdeas() {
    let q = supabase.from("ideas").select("*").order("created_at", { ascending: false }).limit(50);
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
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
    <div style={{ padding: "28px 28px", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
            Ideas Pipeline
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0", fontFamily: "var(--font-geist-mono)" }}>
            {ideas.length} ideas · {counts["validated"] || 0} validated · {counts["live"] || 0} live
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <button onClick={triggerScout} disabled={triggering} style={{
            fontFamily: "var(--font-geist-mono)", fontSize: 11, letterSpacing: "0.06em",
            padding: "8px 18px", borderRadius: 8, cursor: triggering ? "wait" : "pointer",
            background: "rgba(124,106,255,0.12)", border: "1px solid rgba(124,106,255,0.3)",
            color: "#a78bfa", textTransform: "uppercase", transition: "all 0.15s",
          }}>
            {triggering ? "Running..." : "⚡ Run Scout"}
          </button>
          {triggerMsg && (
            <span style={{ fontSize: 11, fontFamily: "var(--font-geist-mono)", color: triggerMsg.startsWith("Scout") ? "#34d399" : "#f87171" }}>
              {triggerMsg}
            </span>
          )}
        </div>
      </div>

      {/* Pipeline stages */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STATUS_ORDER.map((s) => {
          const c = STATUS_COLORS[s];
          const active = filter === s;
          return (
            <button key={s} onClick={() => setFilter(active ? "all" : s)} style={{
              fontFamily: "var(--font-geist-mono)", fontSize: 10, letterSpacing: "0.08em",
              padding: "5px 12px", borderRadius: 20, cursor: "pointer",
              textTransform: "uppercase",
              background: active ? c.bg : "transparent",
              color: active ? c.text : "var(--text-muted)",
              border: `1px solid ${active ? c.border : "var(--border)"}`,
              transition: "all 0.15s",
            }}>
              {s} {counts[s] ? `(${counts[s]})` : "(0)"}
            </button>
          );
        })}
        <button onClick={() => setFilter("all")} style={{
          fontFamily: "var(--font-geist-mono)", fontSize: 10, letterSpacing: "0.08em",
          padding: "5px 12px", borderRadius: 20, cursor: "pointer",
          textTransform: "uppercase",
          background: filter === "all" ? "rgba(255,255,255,0.08)" : "transparent",
          color: filter === "all" ? "var(--text-primary)" : "var(--text-muted)",
          border: `1px solid ${filter === "all" ? "var(--border-bright)" : "var(--border)"}`,
          transition: "all 0.15s",
        }}>
          All ({ideas.length})
        </button>
      </div>

      {/* Ideas list */}
      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "40px 0" }}>Loading...</div>
      ) : ideas.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "80px 40px",
          background: "var(--bg-panel)", border: "1px solid var(--border)",
          borderRadius: 16, backdropFilter: "blur(12px)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💡</div>
          <p style={{ fontSize: 15, color: "var(--text-primary)", marginBottom: 8, fontWeight: 500 }}>No ideas yet</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Hit ⚡ Run Scout above to generate business ideas</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ideas.map(idea => <IdeaCard key={idea.id} idea={idea} />)}
        </div>
      )}
    </div>
  );
}

function IdeaCard({ idea }: { idea: Idea }) {
  const [expanded, setExpanded] = useState(false);
  const c = STATUS_COLORS[idea.status] || STATUS_COLORS.raw;
  const score = idea.validated_score || idea.raw_score;
  const scoreColor = score >= 80 ? "#34d399" : score >= 60 ? "#fbbf24" : "var(--text-muted)";
  const date = new Date(idea.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const md = idea.market_data || {};

  return (
    <div className="glow-hover" style={{
      background: "var(--bg-panel)", border: "1px solid var(--border)",
      borderRadius: 12, backdropFilter: "blur(12px)",
      transition: "all 0.15s", overflow: "hidden",
    }}>
      <div onClick={() => setExpanded(!expanded)} style={{
        padding: "16px 20px", cursor: "pointer",
        display: "flex", gap: 16, alignItems: "flex-start",
      }}>
        {/* Score */}
        <div style={{
          minWidth: 48, height: 48, borderRadius: 10,
          background: `${scoreColor}15`, border: `1px solid ${scoreColor}30`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ color: scoreColor, fontSize: 18, fontFamily: "var(--font-geist-mono)", fontWeight: 700, lineHeight: 1 }}>
            {score || "?"}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 8, fontFamily: "var(--font-geist-mono)", letterSpacing: 1 }}>SCR</div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 600 }}>{idea.title}</span>
            <span style={{
              fontSize: 9, fontFamily: "var(--font-geist-mono)", textTransform: "uppercase",
              letterSpacing: "0.08em", padding: "2px 8px", borderRadius: 20,
              background: c.bg, color: c.text, border: `1px solid ${c.border}`,
            }}>{idea.status}</span>
            {idea.source && (
              <span style={{ color: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}>
                via {idea.source}
              </span>
            )}
          </div>
          {idea.description && (
            <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>{idea.description}</p>
          )}
          {md.revenue_model && (
            <p style={{ color: "#a78bfa", fontSize: 11, fontFamily: "var(--font-geist-mono)", margin: "6px 0 0" }}>
              💰 {md.revenue_model}
            </p>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}>{date}</span>
          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)" }}>
          {md.reasoning && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Why it works</p>
              <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>{md.reasoning}</p>
            </div>
          )}
          {md.market_size && (
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <span style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase" }}>Market:</span>
              <span style={{ fontSize: 11, color: "#60a5fa", fontFamily: "var(--font-geist-mono)" }}>{md.market_size}</span>
            </div>
          )}
          {idea.spec && Object.keys(idea.spec).length > 0 && (
            <div style={{
              marginTop: 14, padding: 14,
              background: "rgba(124,106,255,0.06)", border: "1px solid rgba(124,106,255,0.15)",
              borderRadius: 8,
            }}>
              <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "#a78bfa", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Architect Spec</p>
              {idea.spec.revenue_model && (
                <p style={{ color: "var(--text-primary)", fontSize: 13, marginBottom: 4 }}>💰 {idea.spec.revenue_model}</p>
              )}
              {idea.spec.estimated_build_days && (
                <p style={{ color: "var(--text-muted)", fontSize: 12 }}>⏱ {idea.spec.estimated_build_days} day build</p>
              )}
              {idea.spec.mvp_features && (
                <div style={{ marginTop: 8 }}>
                  {(idea.spec.mvp_features as string[]).map((f, i) => (
                    <p key={i} style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 2 }}>• {f}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
