"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type AgentRun = {
  id: string;
  agent: string;
  status: "success" | "failed" | "skipped";
  summary: string;
  cost_usd: number;
  duration_ms: number;
  created_at: string;
};

type AgentSummary = {
  name: string;
  lastStatus: "success" | "failed" | "skipped" | "never";
  lastRun: string;
  tasksToday: number;
  successRate: number;
  totalCost: number;
};

const CORE_AGENTS = ["scout", "prospector", "closer", "content", "intel", "ops", "chairman", "builder", "money", "learner"];

function fmt(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function statusStyle(s: string) {
  if (s === "success") return { color: "#34d399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)" };
  if (s === "failed")  return { color: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.25)" };
  return { color: "#4a4a6a", bg: "rgba(74,74,106,0.12)", border: "rgba(74,74,106,0.25)" };
}

export default function AgentsClient() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [recentRuns, setRecentRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);

  async function fetchAgents() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from("agent_runs").select("*").gte("created_at", yesterday).order("created_at", { ascending: false });
    const runs: AgentRun[] = data || [];
    setRecentRuns(runs.slice(0, 10));

    const map: Record<string, AgentRun[]> = {};
    for (const r of runs) {
      if (!map[r.agent]) map[r.agent] = [];
      map[r.agent].push(r);
    }

    // include core agents even if they haven't run
    for (const a of CORE_AGENTS) {
      if (!map[a]) map[a] = [];
    }

    const summaries: AgentSummary[] = Object.entries(map).map(([name, agentRuns]) => {
      if (agentRuns.length === 0) return { name, lastStatus: "never" as const, lastRun: "—", tasksToday: 0, successRate: 0, totalCost: 0 };
      const latest = agentRuns[0];
      const successes = agentRuns.filter(r => r.status === "success").length;
      return {
        name,
        lastStatus: latest.status,
        lastRun: new Date(latest.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }),
        tasksToday: agentRuns.length,
        successRate: Math.round((successes / agentRuns.length) * 100),
        totalCost: agentRuns.reduce((s, r) => s + (r.cost_usd || 0), 0),
      };
    });

    // only show the 10 core agents, not old tier agents from history
    const filtered = summaries.filter(a => CORE_AGENTS.includes(a.name));
    filtered.sort((a, b) => CORE_AGENTS.indexOf(a.name) - CORE_AGENTS.indexOf(b.name));
    setAgents(filtered);
    setLoading(false);
  }

  async function triggerAgent(name: string) {
    setTriggering(name);
    try {
      await fetch("/api/trigger-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent: name }) });
    } catch {}
    setTimeout(() => setTriggering(null), 2000);
  }

  useEffect(() => {
    fetchAgents();
    const sub = supabase.channel("agent-runs-ch")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_runs" }, fetchAgents)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const totalTasks = agents.reduce((s, a) => s + a.tasksToday, 0);
  const failing = agents.filter(a => a.lastStatus === "failed");

  return (
    <div style={{ padding: "28px", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>Agents</h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0", fontFamily: "var(--font-geist-mono)" }}>
          {CORE_AGENTS.length} agents · {totalTasks} runs today
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "Runs Today", value: String(totalTasks), color: "var(--text-primary)" },
          { label: "Active Agents", value: String(agents.filter(a => a.tasksToday > 0).length), color: "#34d399" },
          { label: "Failing", value: String(failing.length), color: failing.length > 0 ? "#f87171" : "var(--text-muted)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            padding: "18px 20px", borderRadius: 12,
            background: "var(--bg-panel)", border: "1px solid var(--border)", backdropFilter: "blur(12px)",
          }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-geist-mono)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>{label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "var(--font-geist-mono)", margin: 0, lineHeight: 1 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Agent table */}
      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "40px 0" }}>Loading...</div>
      ) : (
        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 12, backdropFilter: "blur(12px)", overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 90px 80px",
            padding: "10px 18px", borderBottom: "1px solid var(--border)",
            fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            <span>Agent</span>
            <span style={{ textAlign: "right" }}>Last Run</span>
            <span style={{ textAlign: "right" }}>Runs</span>
            <span style={{ textAlign: "right" }}>Success</span>
            <span style={{ textAlign: "center" }}>Status</span>
            <span style={{ textAlign: "right" }}>Action</span>
          </div>
          {agents.map((a, i) => {
            const s = statusStyle(a.lastStatus);
            const isTrigger = triggering === a.name;
            return (
              <div key={a.name} style={{
                display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 90px 80px",
                padding: "12px 18px", alignItems: "center",
                borderBottom: i < agents.length - 1 ? "1px solid var(--border)" : "none",
                transition: "background 0.1s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  <span style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 500 }}>{fmt(a.name)}</span>
                </div>
                <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-geist-mono)", textAlign: "right" }}>{a.lastRun}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-geist-mono)", textAlign: "right" }}>{a.tasksToday}</span>
                <span style={{ fontSize: 11, fontFamily: "var(--font-geist-mono)", textAlign: "right", color: a.successRate >= 80 ? "#34d399" : a.successRate > 0 ? "#fbbf24" : "var(--text-muted)" }}>
                  {a.tasksToday > 0 ? `${a.successRate}%` : "—"}
                </span>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <span style={{
                    fontSize: 9, fontFamily: "var(--font-geist-mono)", textTransform: "uppercase",
                    letterSpacing: "0.08em", padding: "2px 8px", borderRadius: 20,
                    background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                  }}>{a.lastStatus}</span>
                </div>
                {CORE_AGENTS.includes(a.name) ? (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => triggerAgent(a.name)} disabled={!!triggering} style={{
                      fontSize: 10, fontFamily: "var(--font-geist-mono)", padding: "4px 10px", borderRadius: 6,
                      cursor: isTrigger ? "wait" : "pointer",
                      background: isTrigger ? "rgba(52,211,153,0.1)" : "rgba(124,106,255,0.1)",
                      color: isTrigger ? "#34d399" : "#a78bfa",
                      border: `1px solid ${isTrigger ? "rgba(52,211,153,0.25)" : "rgba(124,106,255,0.25)"}`,
                    }}>{isTrigger ? "..." : "▶ Run"}</button>
                  </div>
                ) : <span />}
              </div>
            );
          })}
        </div>
      )}

      {/* Recent runs */}
      {recentRuns.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Recent Runs</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recentRuns.map(r => {
              const s = statusStyle(r.status);
              return (
                <div key={r.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                  background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  <span style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 500, minWidth: 90 }}>{fmt(r.agent)}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 12, flex: 1 }}>{r.summary || "—"}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-geist-mono)", flexShrink: 0 }}>
                    {new Date(r.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
