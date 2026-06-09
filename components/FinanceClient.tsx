"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Business = {
  id: string;
  name: string;
  revenue_7d: number;
  revenue_prev_7d: number;
  war_room_score: number;
  status: string;
};

type AgentCost = {
  agent: string;
  total_cost: number;
  run_count: number;
};

export default function FinanceClient() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [agentCosts, setAgentCosts] = useState<AgentCost[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchFinance() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [bizRes, costRes] = await Promise.all([
      supabase.from("businesses").select("*").order("revenue_7d", { ascending: false }),
      supabase.from("agent_runs").select("agent, cost_usd").gte("created_at", yesterday),
    ]);

    setBusinesses(bizRes.data || []);

    // aggregate costs by agent
    const costMap: Record<string, AgentCost> = {};
    for (const r of (costRes.data || [])) {
      if (!costMap[r.agent]) costMap[r.agent] = { agent: r.agent, total_cost: 0, run_count: 0 };
      costMap[r.agent].total_cost += r.cost_usd || 0;
      costMap[r.agent].run_count += 1;
    }
    const costs = Object.values(costMap).sort((a, b) => b.total_cost - a.total_cost);
    setAgentCosts(costs);
    setLoading(false);
  }

  useEffect(() => { fetchFinance(); }, []);

  const totalRevenue7d = businesses.reduce((s, b) => s + (b.revenue_7d || 0), 0);
  const totalRevenuePrev = businesses.reduce((s, b) => s + (b.revenue_prev_7d || 0), 0);
  const totalCost24h = agentCosts.reduce((s, c) => s + c.total_cost, 0);
  const revenueChange = totalRevenuePrev > 0 ? Math.round(((totalRevenue7d - totalRevenuePrev) / totalRevenuePrev) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 p-6" style={{ maxWidth: 1000 }}>
      <h1 className="text-lg font-semibold" style={{ color: "#f5f5f5" }}>Finance</h1>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <StatCard label="7d Revenue" value={`$${totalRevenue7d.toLocaleString()}`} valueColor={revenueChange >= 0 ? "#22c55e" : "#ef4444"} />
        <StatCard label="vs Prev 7d" value={`${revenueChange >= 0 ? "+" : ""}${revenueChange}%`} valueColor={revenueChange >= 0 ? "#22c55e" : "#ef4444"} />
        <StatCard label="API Cost 24h" value={`$${totalCost24h.toFixed(4)}`} valueColor="#555555" />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* Revenue by business */}
        <div className="flex flex-col rounded-sm" style={{ background: "#111111", border: "1px solid #1f1f1f" }}>
          <div className="px-4 py-3 text-xs uppercase tracking-wider border-b" style={{ color: "#555555", borderColor: "#1f1f1f", fontFamily: "var(--font-geist-mono)" }}>
            Revenue by Business
          </div>
          {loading ? (
            <p className="px-4 py-4 text-xs" style={{ color: "#555555" }}>Loading...</p>
          ) : businesses.length === 0 ? (
            <p className="px-4 py-4 text-xs" style={{ color: "#555555" }}>No businesses registered yet.</p>
          ) : businesses.map((b) => {
            const change = b.revenue_prev_7d > 0 ? Math.round(((b.revenue_7d - b.revenue_prev_7d) / b.revenue_prev_7d) * 100) : 0;
            return (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#1f1f1f" }}>
                <span className="flex-1 text-sm" style={{ color: "#f5f5f5" }}>{b.name}</span>
                <span className="text-sm tabular-nums" style={{ color: "#f5f5f5", fontFamily: "var(--font-geist-mono)" }}>${(b.revenue_7d || 0).toLocaleString()}</span>
                <span className="text-xs tabular-nums w-12 text-right" style={{ color: change >= 0 ? "#22c55e" : "#ef4444", fontFamily: "var(--font-geist-mono)" }}>
                  {change >= 0 ? "+" : ""}{change}%
                </span>
              </div>
            );
          })}
        </div>

        {/* API costs */}
        <div className="flex flex-col rounded-sm" style={{ background: "#111111", border: "1px solid #1f1f1f" }}>
          <div className="px-4 py-3 text-xs uppercase tracking-wider border-b" style={{ color: "#555555", borderColor: "#1f1f1f", fontFamily: "var(--font-geist-mono)" }}>
            API Cost by Agent (24h)
          </div>
          {agentCosts.length === 0 ? (
            <p className="px-4 py-4 text-xs" style={{ color: "#555555" }}>No cost data yet.</p>
          ) : agentCosts.map((c) => (
            <div key={c.agent} className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#1f1f1f" }}>
              <span className="flex-1 text-sm" style={{ color: "#f5f5f5" }}>
                {c.agent.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())}
              </span>
              <span className="text-xs tabular-nums" style={{ color: "#555555", fontFamily: "var(--font-geist-mono)" }}>{c.run_count} runs</span>
              <span className="text-sm tabular-nums" style={{ color: "#f5f5f5", fontFamily: "var(--font-geist-mono)" }}>${c.total_cost.toFixed(4)}</span>
            </div>
          ))}
        </div>
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
