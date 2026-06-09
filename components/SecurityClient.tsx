"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type AgentRun = {
  agent: string;
  status: string;
  cost_usd: number;
  created_at: string;
};

export default function SecurityClient() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [anomalies, setAnomalies] = useState<string[]>([]);

  async function fetchSecurity() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [recentRes, dailyRes] = await Promise.all([
      supabase.from("agent_runs").select("agent, status, cost_usd, created_at").gte("created_at", oneHourAgo).order("created_at", { ascending: false }),
      supabase.from("agent_runs").select("agent, status, cost_usd").gte("created_at", yesterday),
    ]);

    const recent = recentRes.data || [];
    const daily = dailyRes.data || [];
    setRuns(recent);

    // detect anomalies
    const flags: string[] = [];

    // high cost agents
    const costByAgent: Record<string, number> = {};
    for (const r of daily) {
      costByAgent[r.agent] = (costByAgent[r.agent] || 0) + (r.cost_usd || 0);
    }
    for (const [agent, cost] of Object.entries(costByAgent)) {
      if (cost > 1.0) flags.push(`High API cost: ${agent} spent $${cost.toFixed(3)} today`);
    }

    // repeated failures
    const failsByAgent: Record<string, number> = {};
    for (const r of daily) {
      if (r.status === "failed") failsByAgent[r.agent] = (failsByAgent[r.agent] || 0) + 1;
    }
    for (const [agent, count] of Object.entries(failsByAgent)) {
      if (count >= 3) flags.push(`Repeated failures: ${agent} failed ${count} times today`);
    }

    setAnomalies(flags);
  }

  useEffect(() => {
    fetchSecurity();
    const interval = setInterval(fetchSecurity, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const totalCostHour = runs.reduce((s, r) => s + (r.cost_usd || 0), 0);
  const failedHour = runs.filter((r) => r.status === "failed").length;

  return (
    <div className="flex flex-col gap-4 p-6" style={{ maxWidth: 800 }}>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold" style={{ color: "#f5f5f5" }}>Security</h1>
        <p className="text-xs" style={{ color: "#555555" }}>API usage, anomaly detection, cost monitoring. Refreshes every 5 minutes.</p>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <StatCard label="Cost (1h)" value={`$${totalCostHour.toFixed(4)}`} />
        <StatCard label="Failures (1h)" value={String(failedHour)} valueColor={failedHour > 0 ? "#ef4444" : "#22c55e"} />
        <StatCard label="Anomalies" value={String(anomalies.length)} valueColor={anomalies.length > 0 ? "#f59e0b" : "#22c55e"} />
      </div>

      {anomalies.length > 0 && (
        <div className="flex flex-col gap-2 p-4 rounded-sm" style={{ background: "#111111", border: "1px solid #f59e0b" }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: "#f59e0b", fontFamily: "var(--font-geist-mono)" }}>⚠ Anomalies Detected</p>
          {anomalies.map((a, i) => (
            <p key={i} className="text-sm" style={{ color: "#f5f5f5" }}>{a}</p>
          ))}
        </div>
      )}

      <div className="flex flex-col rounded-sm" style={{ background: "#111111", border: "1px solid #1f1f1f" }}>
        <div className="px-4 py-3 text-xs uppercase tracking-wider border-b" style={{ color: "#555555", borderColor: "#1f1f1f", fontFamily: "var(--font-geist-mono)" }}>
          Recent Agent Activity (1h)
        </div>
        {runs.length === 0 ? (
          <p className="px-4 py-6 text-xs" style={{ color: "#555555" }}>No activity in the last hour.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: "#1f1f1f" }}>
            {runs.slice(0, 30).map((r, i) => (
              <div key={i} className="grid px-4 py-2.5" style={{ gridTemplateColumns: "100px 1fr 80px 60px" }}>
                <span className="text-xs tabular-nums" style={{ color: "#333333", fontFamily: "var(--font-geist-mono)" }}>
                  {new Date(r.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" })}
                </span>
                <span className="text-xs" style={{ color: "#f5f5f5" }}>
                  {r.agent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
                <span className="text-xs tabular-nums text-right" style={{ color: "#333333", fontFamily: "var(--font-geist-mono)" }}>
                  {r.cost_usd ? `$${r.cost_usd.toFixed(4)}` : "—"}
                </span>
                <span className="text-xs text-right uppercase" style={{ color: r.status === "success" ? "#22c55e" : r.status === "failed" ? "#ef4444" : "#555555", fontFamily: "var(--font-geist-mono)" }}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
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
