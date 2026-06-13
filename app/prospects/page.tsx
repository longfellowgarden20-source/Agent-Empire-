"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Prospect = {
  id: string;
  company_name: string;
  website: string;
  industry: string;
  score: number;
  intel: Record<string, any>;
  outreach_status: string;
  created_at: string;
};

const STATUS: Record<string, { text: string; bg: string; border: string }> = {
  new:        { text: "#4a4a6a", bg: "rgba(74,74,106,0.12)",  border: "rgba(74,74,106,0.25)" },
  email_ready:{ text: "#a78bfa", bg: "rgba(124,106,255,0.12)",border: "rgba(124,106,255,0.25)" },
  drafted:    { text: "#a78bfa", bg: "rgba(124,106,255,0.12)",border: "rgba(124,106,255,0.25)" },
  sent:       { text: "#60a5fa", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.25)" },
  replied:    { text: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.25)" },
  meeting:    { text: "#34d399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)" },
  closed:     { text: "#34d399", bg: "rgba(52,211,153,0.15)", border: "rgba(52,211,153,0.35)" },
  dead:       { text: "#f87171", bg: "rgba(248,113,113,0.12)",border: "rgba(248,113,113,0.25)" },
};

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  async function fetchProspects() {
    let q = supabase.from("prospects").select("*").order("score", { ascending: false }).limit(100);
    if (filter !== "all") q = q.eq("outreach_status", filter);
    const { data } = await q;
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

  const counts: Record<string, number> = {};
  prospects.forEach(p => { counts[p.outreach_status] = (counts[p.outreach_status] || 0) + 1; });
  const statuses = ["new", "email_ready", "sent", "replied", "meeting", "closed", "dead"];

  return (
    <div style={{ padding: "28px", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
          Prospects
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0", fontFamily: "var(--font-geist-mono)" }}>
          {prospects.length} total · {counts["meeting"] || 0} in meeting · {counts["closed"] || 0} closed
        </p>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => setFilter("all")} style={{
          fontFamily: "var(--font-geist-mono)", fontSize: 10, padding: "5px 12px", borderRadius: 20,
          cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", transition: "all 0.15s",
          background: filter === "all" ? "rgba(255,255,255,0.08)" : "transparent",
          color: filter === "all" ? "var(--text-primary)" : "var(--text-muted)",
          border: `1px solid ${filter === "all" ? "var(--border-bright)" : "var(--border)"}`,
        }}>All ({prospects.length})</button>
        {statuses.map(s => {
          const c = STATUS[s] || STATUS.new;
          const active = filter === s;
          return (
            <button key={s} onClick={() => setFilter(active ? "all" : s)} style={{
              fontFamily: "var(--font-geist-mono)", fontSize: 10, padding: "5px 12px", borderRadius: 20,
              cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", transition: "all 0.15s",
              background: active ? c.bg : "transparent",
              color: active ? c.text : "var(--text-muted)",
              border: `1px solid ${active ? c.border : "var(--border)"}`,
            }}>{s.replace("_", " ")} {counts[s] ? `(${counts[s]})` : "(0)"}</button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "40px 0" }}>Loading...</div>
      ) : prospects.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "80px 40px",
          background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 16,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
          <p style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 500, marginBottom: 8 }}>No prospects yet</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Prospector agent runs daily</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {prospects.map(p => <ProspectCard key={p.id} prospect={p} />)}
        </div>
      )}
    </div>
  );
}

function ProspectCard({ prospect: p }: { prospect: Prospect }) {
  const [expanded, setExpanded] = useState(false);
  const c = STATUS[p.outreach_status] || STATUS.new;
  const date = new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const scoreColor = p.score >= 8 ? "#34d399" : p.score >= 6 ? "#fbbf24" : "var(--text-muted)";

  return (
    <div className="glow-hover" style={{
      background: "var(--bg-panel)", border: "1px solid var(--border)",
      borderRadius: 12, backdropFilter: "blur(12px)", overflow: "hidden", transition: "all 0.15s",
    }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{
          minWidth: 40, height: 40, borderRadius: 8,
          background: `${scoreColor}15`, border: `1px solid ${scoreColor}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontFamily: "var(--font-geist-mono)", fontWeight: 700, color: scoreColor,
        }}>{p.score || "?"}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 600 }}>{p.company_name}</span>
            <span style={{
              fontSize: 9, fontFamily: "var(--font-geist-mono)", textTransform: "uppercase",
              letterSpacing: "0.08em", padding: "2px 8px", borderRadius: 20,
              background: c.bg, color: c.text, border: `1px solid ${c.border}`,
            }}>{p.outreach_status.replace("_", " ")}</span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {p.industry && <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}>{p.industry}</span>}
            {p.website && (
              <a href={p.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ color: "#60a5fa", fontSize: 11, fontFamily: "var(--font-geist-mono)", textDecoration: "none" }}>
                {p.website.replace(/^https?:\/\//, "").split("/")[0]}
              </a>
            )}
          </div>
        </div>

        <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-geist-mono)", flexShrink: 0 }}>{date}</span>
      </div>

      {expanded && p.intel && (
        <div style={{ padding: "0 18px 18px", borderTop: "1px solid var(--border)" }}>
          {p.intel.pain_points?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Pain Points</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {p.intel.pain_points.map((pt: string, i: number) => (
                  <span key={i} style={{ fontSize: 11, fontFamily: "var(--font-geist-mono)", padding: "3px 10px", borderRadius: 20, background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>{pt}</span>
                ))}
              </div>
            </div>
          )}
          {p.intel.reasoning && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginTop: 12 }}>{p.intel.reasoning}</p>
          )}
          {p.intel.email_subject && (
            <div style={{ marginTop: 14, padding: 14, background: "rgba(124,106,255,0.06)", border: "1px solid rgba(124,106,255,0.15)", borderRadius: 8 }}>
              <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "#a78bfa", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Drafted Email</p>
              <p style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{p.intel.email_subject}</p>
              <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{p.intel.email_body}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
