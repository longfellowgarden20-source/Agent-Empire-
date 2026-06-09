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

function formatAgent(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AgentsClient() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [recentRuns, setRecentRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchAgents() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from("agent_runs")
      .select("*")
      .gte("created_at", yesterday)
      .order("created_at", { ascending: false });

    const runs: AgentRun[] = data || [];
    setRecentRuns(runs.slice(0, 20));

    // summarize by agent
    const map: Record<string, AgentRun[]> = {};
    for (const r of runs) {
      if (!map[r.agent]) map[r.agent] = [];
      map[r.agent].push(r);
    }

    const summaries: AgentSummary[] = Object.entries(map).map(([name, agentRuns]) => {
      const latest = agentRuns[0];
      const successes = agentRuns.filter((r) => r.status === "success").length;
      return {
        name,
        lastStatus: latest.status,
        lastRun: new Date(latest.created_at).toLocaleTimeString("en-US", {
          hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York",
        }),
        tasksToday: agentRuns.length,
        successRate: Math.round((successes / agentRuns.length) * 100),
        totalCost: agentRuns.reduce((s, r) => s + (r.cost_usd || 0), 0),
      };
    });

    summaries.sort((a, b) => b.tasksToday - a.tasksToday);
    setAgents(summaries);
    setLoading(false);
  }

  useEffect(() => {
    fetchAgents();
    const sub = supabase
      .channel("agent-runs-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_runs" }, fetchAgents)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const totalTasks = agents.reduce((s, a) => s + a.tasksToday, 0);
  const totalCost = agents.reduce((s, a) => s + a.totalCost, 0);
  const failing = agents.filter((a) => a.lastStatus === "failed");

  return (
    <div className="flex flex-col gap-4 p-6" style={{ maxWidth: 1000 }}>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold" style={{ color: "#f5f5f5" }}>Agents</h1>
        <p className="text-xs" style={{ color: "#555555" }}>All agent activity in the last 24 hours</p>
      </div>

      {/* stat row */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <StatCard label="Tasks Today" value={String(totalTasks)} />
        <StatCard label="Agents Active" value={String(agents.length)} />
        <StatCard label="Cost Today" value={`$${totalCost.toFixed(4)}`} valueColor="#555555" />
      </div>

      {failing.length > 0 && (
        <div className="flex flex-col gap-2 p-3 rounded-sm" style={{ background: "#1a0a0a", border: "1px solid #2a1010" }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: "#ef4444", fontFamily: "var(--font-geist-mono)" }}>⚠ Failing Agents</p>
          {failing.map((a) => (
            <p key={a.name} className="text-xs" style={{ color: "#ef4444" }}>
              {formatAgent(a.name)} — last run {a.lastRun}
            </p>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-xs" style={{ color: "#555555" }}>Loading agent data...</p>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <p className="text-sm" style={{ color: "#555555" }}>No agents have run yet.</p>
          <p className="text-xs" style={{ color: "#333333" }}>Run your first agent to see activity here.</p>
        </div>
      ) : (
        <div className="flex flex-col rounded-sm" style={{ background: "#111111", border: "1px solid #1f1f1f" }}>
          <div
            className="grid px-4 py-2 text-xs uppercase tracking-wider border-b"
            style={{ gridTemplateColumns: "1fr 80px 80px 80px 60px", color: "#333333", borderColor: "#1f1f1f", fontFamily: "var(--font-geist-mono)" }}
          >
            <span>Agent</span>
            <span className="text-right">Last Run</span>
            <span className="text-right">Tasks</span>
            <span className="text-right">Success</span>
            <span className="text-right">Status</span>
          </div>
          <div className="divide-y" style={{ borderColor: "#1f1f1f" }}>
            {agents.map((a) => <AgentRow key={a.name} agent={a} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent: a }: { agent: AgentSummary }) {
  const dotColor = a.lastStatus === "success" ? "#22c55e" : a.lastStatus === "failed" ? "#ef4444" : "#333333";

  return (
    <div
      className="grid px-4 py-3 items-center"
      style={{ gridTemplateColumns: "1fr 80px 80px 80px 60px" }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: dotColor, fontSize: 8 }}>●</span>
        <span className="text-sm" style={{ color: "#f5f5f5" }}>{formatAgent(a.name)}</span>
      </div>
      <span className="text-xs tabular-nums text-right" style={{ color: "#555555", fontFamily: "var(--font-geist-mono)" }}>{a.lastRun}</span>
      <span className="text-xs tabular-nums text-right" style={{ color: "#555555", fontFamily: "var(--font-geist-mono)" }}>{a.tasksToday}</span>
      <span className="text-xs tabular-nums text-right" style={{ color: a.successRate >= 80 ? "#22c55e" : "#f59e0b", fontFamily: "var(--font-geist-mono)" }}>{a.successRate}%</span>
      <span className="text-xs uppercase text-right" style={{ color: dotColor, fontFamily: "var(--font-geist-mono)" }}>{a.lastStatus}</span>
    </div>
  );
}

function StatCard({ label, value, valueColor = "#f5f5f5" }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-sm" style={{ background: "#111111", border: "1px solid #1f1f1f" }}>
      <span className="text-xs" style={{ color: "#555555" }}>{label}</span>
      <span className="text-2xl font-semibold tabular-nums" style={{ color: valueColor, fontFamily: "var(--font-geist-mono)", lineHeight: 1.2 }}>{value}</span>
    </div>
  );
}
