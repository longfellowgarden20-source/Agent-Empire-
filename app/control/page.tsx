"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const AGENTS = [
  { name: "scout",      label: "Scout",      desc: "Finds business ideas + market trends",     interval: "every 6h" },
  { name: "prospector", label: "Prospector", desc: "Finds B2B sales leads",                    interval: "daily" },
  { name: "closer",     label: "Closer",     desc: "Writes outreach emails for leads",          interval: "every 2h" },
  { name: "content",    label: "Content",    desc: "Tweets, LinkedIn posts, email newsletters", interval: "every 12h" },
  { name: "intel",      label: "Intel",      desc: "Market news + macro signals",               interval: "every 4h" },
  { name: "builder",    label: "Builder",    desc: "Specs validated ideas into build plans",    interval: "every 4h" },
  { name: "money",      label: "Money",      desc: "Revenue health + business scoring",         interval: "every 6h" },
  { name: "ops",        label: "Ops",        desc: "Monitors agent health + alerts",            interval: "every 30m" },
  { name: "chairman",   label: "Chairman",   desc: "Compiles morning brief at 7am",             interval: "7am daily" },
  { name: "learner",    label: "Learner",    desc: "Reviews performance + suggests improvements", interval: "daily" },
];

type AgentState = {
  enabled: boolean;
  lastRun?: string;
  lastStatus?: string;
};

export default function ControlPage() {
  const [states, setStates] = useState<Record<string, AgentState>>({});
  const [toggling, setToggling] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [triggerMsg, setTriggerMsg] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  async function fetchStates() {
    // get enabled/disabled state from agent_memory
    const { data: mem } = await supabase
      .from("agent_memory")
      .select("agent, value")
      .eq("key", "enabled");

    // get last run from agent_runs
    const { data: runs } = await supabase
      .from("agent_runs")
      .select("agent, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    const lastRuns: Record<string, { status: string; created_at: string }> = {};
    for (const r of (runs || [])) {
      if (!lastRuns[r.agent]) lastRuns[r.agent] = r;
    }

    const newStates: Record<string, AgentState> = {};
    for (const a of AGENTS) {
      const memRow = (mem || []).find(m => m.agent === a.name);
      const enabled = memRow ? memRow.value !== false : true;
      const last = lastRuns[a.name];
      newStates[a.name] = {
        enabled,
        lastRun: last ? new Date(last.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }) : undefined,
        lastStatus: last?.status,
      };
    }
    setStates(newStates);
    setLoading(false);
  }

  async function toggleAgent(name: string) {
    const current = states[name]?.enabled ?? true;
    const next = !current;
    setToggling(name);
    await supabase.from("agent_memory").upsert(
      { agent: name, key: "enabled", value: next },
      { onConflict: "agent,key" }
    );
    setStates(prev => ({ ...prev, [name]: { ...prev[name], enabled: next } }));
    setToggling(null);
  }

  async function runAgent(name: string) {
    setTriggering(name);
    setTriggerMsg(prev => ({ ...prev, [name]: "" }));
    try {
      const res = await fetch("/api/trigger-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: name }),
      });
      const data = await res.json();
      setTriggerMsg(prev => ({ ...prev, [name]: data.ok ? "✓ Started" : `✗ ${data.error}` }));
    } catch {
      setTriggerMsg(prev => ({ ...prev, [name]: "✗ Unreachable" }));
    }
    setTriggering(null);
    setTimeout(() => setTriggerMsg(prev => ({ ...prev, [name]: "" })), 3000);
  }

  async function enableOnly(name: string) {
    // disable all, then enable just this one
    for (const a of AGENTS) {
      await supabase.from("agent_memory").upsert(
        { agent: a.name, key: "enabled", value: a.name === name },
        { onConflict: "agent,key" }
      );
    }
    const newStates: Record<string, AgentState> = {};
    for (const a of AGENTS) {
      newStates[a.name] = { ...states[a.name], enabled: a.name === name };
    }
    setStates(newStates);
  }

  async function enableAll() {
    for (const a of AGENTS) {
      await supabase.from("agent_memory").upsert(
        { agent: a.name, key: "enabled", value: true },
        { onConflict: "agent,key" }
      );
    }
    setStates(prev => {
      const next = { ...prev };
      for (const a of AGENTS) next[a.name] = { ...next[a.name], enabled: true };
      return next;
    });
  }

  useEffect(() => { fetchStates(); }, []);

  const enabledCount = AGENTS.filter(a => states[a.name]?.enabled).length;

  function statusColor(s?: string) {
    if (s === "success") return "#34d399";
    if (s === "failed")  return "#f87171";
    if (s === "skipped") return "#4a4a6a";
    return "#4a4a6a";
  }

  return (
    <div style={{ padding: "28px", maxWidth: 900, display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
            Agent Control
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0", fontFamily: "var(--font-geist-mono)" }}>
            {enabledCount} of {AGENTS.length} agents active
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={enableAll} style={{
            fontFamily: "var(--font-geist-mono)", fontSize: 11, padding: "7px 16px", borderRadius: 8,
            cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
            background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399",
          }}>Enable All</button>
          <button onClick={() => enableOnly("scout")} style={{
            fontFamily: "var(--font-geist-mono)", fontSize: 11, padding: "7px 16px", borderRadius: 8,
            cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
            background: "rgba(124,106,255,0.12)", border: "1px solid rgba(124,106,255,0.3)", color: "#a78bfa",
          }}>Ideas Only</button>
        </div>
      </div>

      {/* Agent cards */}
      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "40px 0" }}>Loading...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {AGENTS.map(a => {
            const st = states[a.name] || { enabled: true };
            const isToggling = toggling === a.name;
            const isTriggering = triggering === a.name;
            const msg = triggerMsg[a.name];

            return (
              <div key={a.name} className="glow-hover" style={{
                background: "var(--bg-panel)", border: `1px solid ${st.enabled ? "var(--border-bright)" : "var(--border)"}`,
                borderRadius: 12, backdropFilter: "blur(12px)",
                padding: "16px 20px", display: "flex", alignItems: "center", gap: 16,
                opacity: st.enabled ? 1 : 0.45, transition: "all 0.2s",
              }}>
                {/* Toggle */}
                <button onClick={() => toggleAgent(a.name)} disabled={isToggling} style={{
                  width: 44, height: 24, borderRadius: 12, border: "none", cursor: isToggling ? "wait" : "pointer",
                  background: st.enabled ? "rgba(52,211,153,0.25)" : "rgba(74,74,106,0.2)",
                  position: "relative", flexShrink: 0, transition: "background 0.2s",
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%", position: "absolute",
                    top: 3, left: st.enabled ? 23 : 3,
                    background: st.enabled ? "#34d399" : "#4a4a6a",
                    transition: "left 0.2s, background 0.2s",
                  }} />
                </button>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{a.label}</span>
                    <span style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", letterSpacing: "0.06em" }}>{a.interval}</span>
                    {st.lastStatus && (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor(st.lastStatus), display: "inline-block" }} />
                    )}
                    {st.lastRun && (
                      <span style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)" }}>last: {st.lastRun}</span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{a.desc}</p>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {msg && (
                    <span style={{ fontSize: 11, fontFamily: "var(--font-geist-mono)", color: msg.startsWith("✓") ? "#34d399" : "#f87171" }}>
                      {msg}
                    </span>
                  )}
                  <button onClick={() => runAgent(a.name)} disabled={!!triggering} style={{
                    fontFamily: "var(--font-geist-mono)", fontSize: 10, padding: "6px 14px", borderRadius: 8,
                    cursor: isTriggering ? "wait" : "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
                    background: isTriggering ? "rgba(52,211,153,0.1)" : "rgba(124,106,255,0.1)",
                    color: isTriggering ? "#34d399" : "#a78bfa",
                    border: `1px solid ${isTriggering ? "rgba(52,211,153,0.25)" : "rgba(124,106,255,0.25)"}`,
                    transition: "all 0.15s",
                  }}>{isTriggering ? "..." : "▶ Run"}</button>

                  <button onClick={() => enableOnly(a.name)} style={{
                    fontFamily: "var(--font-geist-mono)", fontSize: 10, padding: "6px 14px", borderRadius: 8,
                    cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
                    background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)",
                    transition: "all 0.15s",
                  }}>Only</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
