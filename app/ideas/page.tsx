"use client";

import { useEffect, useState, useRef } from "react";
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

type PreviewIdea = {
  title: string;
  description: string;
  score: number;
  market_size: string;
  revenue_model: string;
  target_customer: string;
  reasoning: string;
  risks: string;
  refined_pitch: string;
  original_pitch: string;
};

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  raw:        { bg: "rgba(74,74,106,0.15)",   border: "rgba(74,74,106,0.3)",    text: "#6b6b9a" },
  validating: { bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)",   text: "#fbbf24" },
  validated:  { bg: "rgba(124,106,255,0.12)", border: "rgba(124,106,255,0.3)",  text: "#a78bfa" },
  building:   { bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.3)",   text: "#60a5fa" },
  live:       { bg: "rgba(52,211,153,0.12)",  border: "rgba(52,211,153,0.3)",   text: "#34d399" },
  killed:     { bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.3)",  text: "#f87171" },
};

const STATUS_ORDER = ["raw", "validating", "validated", "building", "live", "killed"];
const SORT_OPTIONS = ["newest", "score", "status", "market"] as const;
type Sort = typeof SORT_OPTIONS[number];

function daysAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  return d === 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`;
}

function scoreColor(s: number) {
  return s >= 80 ? "#34d399" : s >= 60 ? "#fbbf24" : "#6b6b9a";
}

// ── Timeline bar ──────────────────────────────────────────────────────────────
function TimelineBar({ ideas, counts, onFilter }: { ideas: Idea[]; counts: Record<string, number>; onFilter: (s: string) => void }) {
  return (
    <div style={{
      background: "var(--bg-panel)", border: "1px solid var(--border)",
      borderRadius: 12, backdropFilter: "blur(12px)", padding: "16px 20px",
    }}>
      <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>
        Pipeline
      </p>
      <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", height: 6, marginBottom: 14 }}>
        {STATUS_ORDER.filter(s => counts[s]).map(s => {
          const pct = ((counts[s] || 0) / ideas.length) * 100;
          const c = STATUS_COLORS[s];
          return (
            <div key={s} style={{ width: `${pct}%`, background: c.text, opacity: 0.7, cursor: "pointer", transition: "opacity 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
              onClick={() => onFilter(s)}
              title={`${s}: ${counts[s]}`}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {STATUS_ORDER.map(s => {
          const c = STATUS_COLORS[s];
          const stuck = ideas.filter(i => i.status === s && (Date.now() - new Date(i.created_at).getTime()) > 3 * 86400000);
          return (
            <button key={s} onClick={() => onFilter(s)} style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            }}>
              <span style={{ fontSize: 16, fontFamily: "var(--font-geist-mono)", fontWeight: 700, color: counts[s] ? c.text : "var(--text-muted)" }}>
                {counts[s] || 0}
              </span>
              <span style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                {s}
              </span>
              {stuck.length > 0 && (
                <span style={{ fontSize: 8, color: "#f87171", fontFamily: "var(--font-geist-mono)" }}>⚠ {stuck.length} stuck</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Preview card (shown after refinement before saving) ───────────────────────
function PreviewCard({ preview, onSave, onEdit, onDiscard, saving }: {
  preview: PreviewIdea;
  onSave: (p: PreviewIdea) => void;
  onEdit: (field: keyof PreviewIdea, val: string) => void;
  onDiscard: () => void;
  saving: boolean;
}) {
  const sc = scoreColor(preview.score * 10);
  return (
    <div style={{
      background: "rgba(124,106,255,0.06)", border: "1px solid rgba(124,106,255,0.25)",
      borderRadius: 12, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
          Preview — edit before saving
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onDiscard} style={{
            fontFamily: "var(--font-geist-mono)", fontSize: 10, padding: "4px 12px", borderRadius: 6,
            background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer",
          }}>Discard</button>
          <button onClick={() => onSave(preview)} disabled={saving} style={{
            fontFamily: "var(--font-geist-mono)", fontSize: 10, padding: "4px 14px", borderRadius: 6,
            background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)",
            color: "#34d399", cursor: saving ? "wait" : "pointer",
          }}>{saving ? "Saving..." : "✓ Save to Pipeline"}</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{
          minWidth: 52, height: 52, borderRadius: 10, flexShrink: 0,
          background: `${sc}15`, border: `1px solid ${sc}30`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ color: sc, fontSize: 20, fontFamily: "var(--font-geist-mono)", fontWeight: 700, lineHeight: 1 }}>{preview.score}</span>
          <span style={{ color: "var(--text-muted)", fontSize: 8, fontFamily: "var(--font-geist-mono)" }}>/ 10</span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={preview.title}
            onChange={e => onEdit("title", e.target.value)}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6,
              color: "var(--text-primary)", fontSize: 15, fontWeight: 600, padding: "6px 10px", outline: "none", width: "100%",
            }}
          />
          <textarea
            value={preview.description}
            onChange={e => onEdit("description", e.target.value)}
            rows={2}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6,
              color: "var(--text-muted)", fontSize: 13, padding: "6px 10px", outline: "none",
              width: "100%", resize: "none", lineHeight: 1.5, fontFamily: "inherit",
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { label: "Revenue model", field: "revenue_model" as const },
          { label: "Target customer", field: "target_customer" as const },
        ].map(({ label, field }) => (
          <div key={field}>
            <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</p>
            <input
              value={preview[field]}
              onChange={e => onEdit(field, e.target.value)}
              style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6,
                color: "var(--text-primary)", fontSize: 12, padding: "5px 8px", outline: "none", width: "100%",
              }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "#34d399", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Why it works</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>{preview.reasoning}</p>
        </div>
        <div>
          <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "#f87171", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Biggest risk</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>{preview.risks}</p>
        </div>
      </div>

      {preview.refined_pitch && (
        <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 6, borderLeft: "2px solid #a78bfa" }}>
          <p style={{ fontSize: 12, color: "var(--text-primary)", margin: 0, fontStyle: "italic" }}>"{preview.refined_pitch}"</p>
        </div>
      )}
    </div>
  );
}

// ── Conversation thread inside expanded card ──────────────────────────────────
function IdeaConversation({ idea, onUpdate }: { idea: Idea; onUpdate: (updated: Partial<Idea>) => void }) {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    if (!input.trim() || thinking) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(m => [...m, { role: "user", text: userMsg }]);
    setThinking(true);
    try {
      const res = await fetch("/api/refine-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea_id: idea.id, message: userMsg, idea }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages(m => [...m, { role: "ai", text: data.reply }]);
        if (data.updated) onUpdate(data.updated);
      } else {
        setMessages(m => [...m, { role: "ai", text: `Error: ${data.error}` }]);
      }
    } catch {
      setMessages(m => [...m, { role: "ai", text: "Could not reach server" }]);
    }
    setThinking(false);
  }

  return (
    <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
        Push back · ask questions · refine
      </p>
      {messages.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10, maxHeight: 200, overflowY: "auto" }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              padding: "8px 12px", borderRadius: 8, fontSize: 13, lineHeight: 1.5,
              background: m.role === "user" ? "rgba(124,106,255,0.1)" : "rgba(255,255,255,0.03)",
              color: m.role === "user" ? "#a78bfa" : "var(--text-primary)",
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%", border: `1px solid ${m.role === "user" ? "rgba(124,106,255,0.2)" : "var(--border)"}`,
            }}>{m.text}</div>
          ))}
          {thinking && (
            <div style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, color: "var(--text-muted)", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", alignSelf: "flex-start" }}>
              thinking...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
          placeholder='e.g. "but Lemlist already does this" or "what if we focused on lawyers only?"'
          style={{
            flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
            borderRadius: 6, color: "var(--text-primary)", fontSize: 12, padding: "7px 12px", outline: "none",
          }}
        />
        <button onClick={send} disabled={thinking || !input.trim()} style={{
          fontFamily: "var(--font-geist-mono)", fontSize: 10, padding: "0 14px", borderRadius: 6,
          background: "rgba(124,106,255,0.1)", border: "1px solid rgba(124,106,255,0.25)",
          color: "#a78bfa", cursor: thinking ? "wait" : "pointer",
          opacity: !input.trim() ? 0.4 : 1,
        }}>Send</button>
      </div>
    </div>
  );
}

// ── Main idea card ────────────────────────────────────────────────────────────
function IdeaCard({
  idea, selected, onSelect, compareMode, onKill, onValidate, onUpdate,
}: {
  idea: Idea;
  selected: boolean;
  onSelect: (id: string) => void;
  compareMode: boolean;
  onKill: (id: string) => void;
  onValidate: (id: string) => void;
  onUpdate: (id: string, data: Partial<Idea>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [building, setBuilding] = useState(["building", "validated"].includes(idea.status));
  const [buildMsg, setBuildMsg] = useState("");
  const [validating, setValidating] = useState(false);

  const c = STATUS_COLORS[idea.status] || STATUS_COLORS.raw;
  const score = idea.validated_score || idea.raw_score;
  const sc = scoreColor(score);
  const md = idea.market_data || {};
  const spec = idea.spec || {};
  const stuckDays = Math.floor((Date.now() - new Date(idea.created_at).getTime()) / 86400000);
  const isStuck = stuckDays >= 3 && !["live", "building"].includes(idea.status);

  async function queueForBuilder(e: React.MouseEvent) {
    e.stopPropagation();
    if (building) return;
    setBuilding(true);
    await supabase.from("ideas").update({ status: "validated" }).eq("id", idea.id);
    await supabase.from("task_queue").insert({
      to_agent: "builder", from_agent: "chairman",
      task: "build_idea", payload: { idea_id: idea.id, title: idea.title },
      priority: 9, status: "pending",
    });
    setBuildMsg("Queued for Builder");
  }

  async function killIdea(e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from("ideas").update({ status: "killed" }).eq("id", idea.id);
    onKill(idea.id);
  }

  async function validateIdea(e: React.MouseEvent) {
    e.stopPropagation();
    if (validating) return;
    setValidating(true);
    try {
      const res = await fetch("/api/validate-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea_id: idea.id, idea }),
      });
      const data = await res.json();
      if (data.ok) onValidate(idea.id);
    } catch {}
    setValidating(false);
  }

  const canValidate = ["raw", "validating"].includes(idea.status);
  const canKill = !["killed", "live"].includes(idea.status);

  function openCompetitor(e: React.MouseEvent) {
    e.stopPropagation();
    const q = encodeURIComponent(idea.title);
    const ideaParam = encodeURIComponent(idea.title);
    window.open(`/competitor?q=${q}&idea=${ideaParam}&idea_id=${idea.id}&auto=1`, "_blank");
  }

  return (
    <div style={{
      background: selected ? "rgba(124,106,255,0.06)" : "var(--bg-panel)",
      border: `1px solid ${selected ? "rgba(124,106,255,0.3)" : isStuck ? "rgba(248,113,113,0.2)" : "var(--border)"}`,
      borderRadius: 12, backdropFilter: "blur(12px)",
      transition: "all 0.15s", overflow: "hidden",
    }}>
      <div style={{ padding: "14px 18px", display: "flex", gap: 14, alignItems: "flex-start" }}>

        {/* Compare checkbox */}
        {compareMode && (
          <input type="checkbox" checked={selected} onChange={() => onSelect(idea.id)}
            onClick={e => e.stopPropagation()}
            style={{ marginTop: 16, accentColor: "#7c6aff", cursor: "pointer", flexShrink: 0 }}
          />
        )}

        {/* Score box */}
        <div onClick={() => setExpanded(!expanded)} style={{
          minWidth: 46, height: 46, borderRadius: 9, flexShrink: 0, cursor: "pointer",
          background: `${sc}15`, border: `1px solid ${sc}30`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ color: sc, fontSize: 17, fontFamily: "var(--font-geist-mono)", fontWeight: 700, lineHeight: 1 }}>{score || "?"}</span>
          <span style={{ color: "var(--text-muted)", fontSize: 7, fontFamily: "var(--font-geist-mono)", letterSpacing: 1 }}>SCR</span>
        </div>

        {/* Main content */}
        <div onClick={() => setExpanded(!expanded)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 600 }}>{idea.title}</span>
            <span style={{
              fontSize: 9, fontFamily: "var(--font-geist-mono)", textTransform: "uppercase",
              letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 20,
              background: c.bg, color: c.text, border: `1px solid ${c.border}`,
            }}>{idea.status}</span>
            {isStuck && (
              <span style={{ fontSize: 9, color: "#f87171", fontFamily: "var(--font-geist-mono)" }}>⚠ {stuckDays}d stuck</span>
            )}
            {idea.source && (
              <span style={{ color: "var(--text-muted)", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}>via {idea.source}</span>
            )}
          </div>
          {idea.description && (
            <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.55, margin: "0 0 4px" }}>{idea.description}</p>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            {md.revenue_model && (
              <span style={{ color: "#a78bfa", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}>💰 {md.revenue_model}</span>
            )}
            {spec.estimated_mrr_30d && (
              <span style={{ color: "#34d399", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}>📈 {spec.estimated_mrr_30d}</span>
            )}
            {spec.estimated_build_days && (
              <span style={{ color: "#60a5fa", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}>⏱ {spec.estimated_build_days}d build</span>
            )}
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}>{daysAgo(idea.created_at)}</span>
          <div style={{ display: "flex", gap: 5 }}>
            {canValidate && (
              <button onClick={validateIdea} disabled={validating} style={{
                fontFamily: "var(--font-geist-mono)", fontSize: 9, letterSpacing: "0.05em",
                padding: "3px 9px", borderRadius: 5, cursor: "pointer", textTransform: "uppercase",
                background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24",
                opacity: validating ? 0.5 : 1,
              }}>{validating ? "..." : "✓ Validate"}</button>
            )}
            <button onClick={openCompetitor} style={{
              fontFamily: "var(--font-geist-mono)", fontSize: 9, letterSpacing: "0.05em",
              padding: "3px 9px", borderRadius: 5, cursor: "pointer", textTransform: "uppercase",
              background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171",
            }} title="Find competitors for this idea">🔍 Clone</button>
            <button onClick={queueForBuilder} disabled={building} style={{
              fontFamily: "var(--font-geist-mono)", fontSize: 9, letterSpacing: "0.05em",
              padding: "3px 9px", borderRadius: 5, cursor: building ? "default" : "pointer", textTransform: "uppercase",
              background: building ? "rgba(52,211,153,0.1)" : "rgba(96,165,250,0.1)",
              border: `1px solid ${building ? "rgba(52,211,153,0.25)" : "rgba(96,165,250,0.25)"}`,
              color: building ? "#34d399" : "#60a5fa",
            }}>{building ? (buildMsg ? "✓" : "✓ Queued") : "⚙ Build"}</button>
            {canKill && (
              <button onClick={killIdea} style={{
                fontFamily: "var(--font-geist-mono)", fontSize: 9, padding: "3px 8px", borderRadius: 5,
                cursor: "pointer", background: "transparent", border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }} title="Kill this idea">✕</button>
            )}
          </div>
          <span onClick={() => setExpanded(!expanded)} style={{ color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 18px 18px", borderTop: "1px solid var(--border)" }}>
          {/* Score breakdown */}
          {(md.reasoning || md.risks) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
              {md.reasoning && (
                <div style={{ padding: "10px 12px", background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 8 }}>
                  <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "#34d399", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Why it works</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>{md.reasoning}</p>
                </div>
              )}
              {md.risks && (
                <div style={{ padding: "10px 12px", background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8 }}>
                  <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "#f87171", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Biggest risk</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>{md.risks}</p>
                </div>
              )}
            </div>
          )}

          {/* Sub-scores */}
          {md.target_customer && (
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ padding: "6px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 6 }}>
                <span style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Target · </span>
                <span style={{ fontSize: 11, color: "var(--text-primary)" }}>{md.target_customer}</span>
              </div>
              {md.market_size && (
                <div style={{ padding: "6px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 6 }}>
                  <span style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Market · </span>
                  <span style={{ fontSize: 11, color: "#60a5fa" }}>{md.market_size}</span>
                </div>
              )}
            </div>
          )}

          {/* Architect spec */}
          {spec && Object.keys(spec).length > 0 && (
            <div style={{
              marginTop: 12, padding: 14,
              background: "rgba(124,106,255,0.05)", border: "1px solid rgba(124,106,255,0.15)", borderRadius: 8,
            }}>
              <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "#a78bfa", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Architect Spec
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                {spec.estimated_build_days && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>⏱ {spec.estimated_build_days} day build</span>
                )}
                {spec.estimated_mrr_30d && (
                  <span style={{ fontSize: 12, color: "#34d399" }}>📈 {spec.estimated_mrr_30d} in 30 days</span>
                )}
                {spec.pricing && (
                  <span style={{ fontSize: 12, color: "#a78bfa" }}>💰 {spec.pricing}</span>
                )}
                {spec.target_customer && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>👤 {spec.target_customer}</span>
                )}
              </div>
              {spec.mvp_features && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {(spec.mvp_features as string[]).map((f, i) => (
                    <span key={i} style={{ fontSize: 12, color: "var(--text-muted)" }}>• {f}</span>
                  ))}
                </div>
              )}
              {spec.first_customer_path && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 6 }}>
                  <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "#34d399", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>First customer path</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>{spec.first_customer_path}</p>
                </div>
              )}
            </div>
          )}

          {/* Conversation */}
          <IdeaConversation idea={idea} onUpdate={(updated) => onUpdate(idea.id, updated)} />
        </div>
      )}
    </div>
  );
}

// ── Compare panel ─────────────────────────────────────────────────────────────
function ComparePanel({ ideas, onClose }: { ideas: Idea[]; onClose: () => void }) {
  if (ideas.length < 2) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(5,5,7,0.9)", backdropFilter: "blur(8px)",
      display: "flex", flexDirection: "column", padding: 32, gap: 20, overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Compare Ideas</h2>
        <button onClick={onClose} style={{
          background: "var(--bg-panel)", border: "1px solid var(--border)", color: "var(--text-muted)",
          borderRadius: 8, padding: "6px 16px", cursor: "pointer", fontFamily: "var(--font-geist-mono)", fontSize: 12,
        }}>Close</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${ideas.length}, 1fr)`, gap: 16, flex: 1 }}>
        {ideas.map(idea => {
          const md = idea.market_data || {};
          const spec = idea.spec || {};
          const score = idea.validated_score || idea.raw_score;
          const sc = scoreColor(score);
          const c = STATUS_COLORS[idea.status] || STATUS_COLORS.raw;
          return (
            <div key={idea.id} style={{
              background: "var(--bg-panel)", border: "1px solid var(--border)",
              borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12,
            }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 9, flexShrink: 0,
                  background: `${sc}15`, border: `1px solid ${sc}30`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ color: sc, fontSize: 18, fontFamily: "var(--font-geist-mono)", fontWeight: 700 }}>{score}</span>
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>{idea.title}</p>
                  <span style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", textTransform: "uppercase", padding: "2px 7px", borderRadius: 20, background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>{idea.status}</span>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55, margin: 0 }}>{idea.description}</p>
              {[
                { label: "Revenue", value: md.revenue_model },
                { label: "Market", value: md.market_size },
                { label: "Target", value: md.target_customer },
                { label: "MRR 30d", value: spec.estimated_mrr_30d, color: "#34d399" },
                { label: "Build time", value: spec.estimated_build_days ? `${spec.estimated_build_days}d` : undefined, color: "#60a5fa" },
                { label: "Risk", value: md.risks },
              ].filter(r => r.value).map(({ label, value, color }) => (
                <div key={label} style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                  <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{label}</p>
                  <p style={{ fontSize: 12, color: color || "var(--text-primary)", margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Scout with context ────────────────────────────────────────────────────────
function ScoutModal({ onClose, onTriggered }: { onClose: () => void; onTriggered: (msg: string) => void }) {
  const [context, setContext] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch("/api/trigger-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: "scout", context: context.trim() || undefined }),
      });
      const data = await res.json();
      onTriggered(data.ok ? "Scout triggered — ideas appear in ~30s" : `Error: ${data.error}`);
      onClose();
    } catch {
      onTriggered("Could not reach worker");
      onClose();
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, background: "rgba(5,5,7,0.85)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0d0d14", border: "1px solid var(--border)", borderRadius: 14,
        padding: 28, width: 480, display: "flex", flexDirection: "column", gap: 16,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Run Scout</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          Optionally focus Scout on a theme. Leave blank for general ideas.
        </p>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder='e.g. "find ideas in legaltech under $500 to build" or "focus on b2b SaaS for construction"'
          rows={3}
          autoFocus
          style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8,
            color: "var(--text-primary)", fontSize: 13, padding: "10px 14px",
            fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.5,
          }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            fontFamily: "var(--font-geist-mono)", fontSize: 11, padding: "7px 16px", borderRadius: 7,
            background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer",
          }}>Cancel</button>
          <button onClick={run} disabled={running} style={{
            fontFamily: "var(--font-geist-mono)", fontSize: 11, padding: "7px 20px", borderRadius: 7,
            background: "rgba(124,106,255,0.12)", border: "1px solid rgba(124,106,255,0.3)",
            color: "#a78bfa", cursor: "pointer", textTransform: "uppercase",
          }}>{running ? "Running..." : "⚡ Run Scout"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [loading, setLoading] = useState(true);
  const [triggerMsg, setTriggerMsg] = useState("");
  const [showScout, setShowScout] = useState(false);

  // pitch state
  const [pitch, setPitch] = useState("");
  const [pitching, setPitching] = useState(false);
  const [preview, setPreview] = useState<PreviewIdea | null>(null);
  const [saving, setSaving] = useState(false);

  // compare state
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  async function fetchIdeas() {
    let q = supabase.from("ideas").select("*").limit(100);
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

  async function submitPitch() {
    if (!pitch.trim() || pitching) return;
    setPitching(true);
    try {
      const res = await fetch("/api/pitch-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitch: pitch.trim(), preview_only: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setPreview({ ...data.refined, original_pitch: pitch.trim() });
        setPitch("");
      }
    } catch {}
    setPitching(false);
  }

  async function savePreview(p: PreviewIdea) {
    setSaving(true);
    await fetch("/api/pitch-idea", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pitch: p.original_pitch, refined_override: p }),
    });
    setPreview(null);
    setSaving(false);
  }

  function editPreview(field: keyof PreviewIdea, val: string) {
    setPreview(p => p ? { ...p, [field]: val } : p);
  }

  function toggleSelect(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length < 3 ? [...s, id] : s);
  }

  function handleKill(id: string) {
    setIdeas(list => list.map(i => i.id === id ? { ...i, status: "killed" } : i));
  }

  function handleValidate(id: string) {
    setIdeas(list => list.map(i => i.id === id ? { ...i, status: "validated" } : i));
  }

  function handleUpdate(id: string, data: Partial<Idea>) {
    setIdeas(list => list.map(i => i.id === id ? { ...i, ...data } : i));
  }

  const counts: Record<string, number> = {};
  ideas.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });

  const sorted = [...ideas].sort((a, b) => {
    if (sort === "score") return (b.validated_score || b.raw_score) - (a.validated_score || a.raw_score);
    if (sort === "status") return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (sort === "market") {
      const order = { large: 0, medium: 1, small: 2 };
      return (order[(a.market_data?.market_size as keyof typeof order)] ?? 3) - (order[(b.market_data?.market_size as keyof typeof order)] ?? 3);
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const compareIdeas = ideas.filter(i => selected.includes(i.id));

  return (
    <div style={{ padding: "28px", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 20 }}>

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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => { setCompareMode(m => !m); setSelected([]); }} style={{
            fontFamily: "var(--font-geist-mono)", fontSize: 10, padding: "7px 14px", borderRadius: 7,
            background: compareMode ? "rgba(124,106,255,0.15)" : "transparent",
            border: `1px solid ${compareMode ? "rgba(124,106,255,0.35)" : "var(--border)"}`,
            color: compareMode ? "#a78bfa" : "var(--text-muted)", cursor: "pointer", textTransform: "uppercase",
          }}>⊞ Compare{selected.length > 0 ? ` (${selected.length})` : ""}</button>
          {compareMode && selected.length >= 2 && (
            <button onClick={() => document.dispatchEvent(new CustomEvent("open-compare"))} style={{
              fontFamily: "var(--font-geist-mono)", fontSize: 10, padding: "7px 14px", borderRadius: 7,
              background: "rgba(124,106,255,0.12)", border: "1px solid rgba(124,106,255,0.3)",
              color: "#a78bfa", cursor: "pointer", textTransform: "uppercase",
            }}>View</button>
          )}
          <button onClick={() => setShowScout(true)} style={{
            fontFamily: "var(--font-geist-mono)", fontSize: 11, letterSpacing: "0.06em",
            padding: "8px 18px", borderRadius: 8, cursor: "pointer",
            background: "rgba(124,106,255,0.12)", border: "1px solid rgba(124,106,255,0.3)",
            color: "#a78bfa", textTransform: "uppercase",
          }}>⚡ Run Scout</button>
        </div>
      </div>

      {triggerMsg && (
        <span style={{ fontSize: 11, fontFamily: "var(--font-geist-mono)", color: triggerMsg.startsWith("Scout") ? "#34d399" : "#f87171" }}>
          {triggerMsg}
        </span>
      )}

      {/* Timeline */}
      <TimelineBar ideas={ideas} counts={counts} onFilter={s => setFilter(f => f === s ? "all" : s)} />

      {/* Pitch box */}
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: 12, backdropFilter: "blur(12px)", padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
          Pitch an idea — refine before saving · Cmd+Enter to submit
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <textarea
            value={pitch}
            onChange={e => setPitch(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitPitch(); }}
            placeholder='e.g. "AI that writes cold emails for real estate agents, $49/mo per agent"'
            rows={2}
            style={{
              flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
              borderRadius: 8, color: "var(--text-primary)", fontSize: 13, padding: "10px 14px",
              fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.5,
            }}
          />
          <button onClick={submitPitch} disabled={pitching || !pitch.trim()} style={{
            fontFamily: "var(--font-geist-mono)", fontSize: 11, padding: "0 20px", borderRadius: 8,
            cursor: pitching || !pitch.trim() ? "default" : "pointer",
            background: pitching ? "rgba(52,211,153,0.1)" : "rgba(124,106,255,0.12)",
            border: `1px solid ${pitching ? "rgba(52,211,153,0.25)" : "rgba(124,106,255,0.3)"}`,
            color: pitching ? "#34d399" : "#a78bfa", textTransform: "uppercase", flexShrink: 0,
            opacity: !pitch.trim() && !pitching ? 0.4 : 1,
          }}>{pitching ? "Refining..." : "⚡ Refine"}</button>
        </div>

        {preview && (
          <PreviewCard
            preview={preview}
            onSave={savePreview}
            onEdit={editPreview}
            onDiscard={() => setPreview(null)}
            saving={saving}
          />
        )}
      </div>

      {/* Filters + sort */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <button onClick={() => setFilter("all")} style={{
            fontFamily: "var(--font-geist-mono)", fontSize: 10, letterSpacing: "0.08em",
            padding: "4px 11px", borderRadius: 20, cursor: "pointer", textTransform: "uppercase",
            background: filter === "all" ? "rgba(255,255,255,0.08)" : "transparent",
            color: filter === "all" ? "var(--text-primary)" : "var(--text-muted)",
            border: `1px solid ${filter === "all" ? "rgba(255,255,255,0.15)" : "var(--border)"}`,
          }}>All ({ideas.length})</button>
          {STATUS_ORDER.map(s => {
            const col = STATUS_COLORS[s];
            const active = filter === s;
            return (
              <button key={s} onClick={() => setFilter(active ? "all" : s)} style={{
                fontFamily: "var(--font-geist-mono)", fontSize: 10, letterSpacing: "0.08em",
                padding: "4px 11px", borderRadius: 20, cursor: "pointer", textTransform: "uppercase",
                background: active ? col.bg : "transparent",
                color: active ? col.text : "var(--text-muted)",
                border: `1px solid ${active ? col.border : "var(--border)"}`,
              }}>{s} ({counts[s] || 0})</button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {SORT_OPTIONS.map(s => (
            <button key={s} onClick={() => setSort(s)} style={{
              fontFamily: "var(--font-geist-mono)", fontSize: 9, padding: "4px 10px", borderRadius: 6,
              cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
              background: sort === s ? "rgba(255,255,255,0.06)" : "transparent",
              color: sort === s ? "var(--text-primary)" : "var(--text-muted)",
              border: `1px solid ${sort === s ? "rgba(255,255,255,0.12)" : "var(--border)"}`,
            }}>{s}</button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "40px 0" }}>Loading...</div>
      ) : sorted.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "80px 40px",
          background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 16,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💡</div>
          <p style={{ fontSize: 15, color: "var(--text-primary)", marginBottom: 8, fontWeight: 500 }}>No ideas yet</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Run Scout or pitch one above</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map(idea => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              selected={selected.includes(idea.id)}
              onSelect={toggleSelect}
              compareMode={compareMode}
              onKill={handleKill}
              onValidate={handleValidate}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showScout && (
        <ScoutModal
          onClose={() => setShowScout(false)}
          onTriggered={msg => { setTriggerMsg(msg); setShowScout(false); }}
        />
      )}

      {compareMode && selected.length >= 2 && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 150 }}>
          <button onClick={() => document.dispatchEvent(new CustomEvent("open-compare"))} style={{
            fontFamily: "var(--font-geist-mono)", fontSize: 12, padding: "10px 24px", borderRadius: 30,
            background: "rgba(124,106,255,0.9)", border: "1px solid rgba(124,106,255,0.5)",
            color: "#fff", cursor: "pointer", boxShadow: "0 8px 32px rgba(124,106,255,0.3)",
          }}>⊞ Compare {selected.length} ideas</button>
        </div>
      )}

      <CompareWrapper ideas={compareIdeas} />
    </div>
  );
}

function CompareWrapper({ ideas }: { ideas: Idea[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = () => setOpen(true);
    document.addEventListener("open-compare", handler);
    return () => document.removeEventListener("open-compare", handler);
  }, []);
  if (!open || ideas.length < 2) return null;
  return <ComparePanel ideas={ideas} onClose={() => setOpen(false)} />;
}
