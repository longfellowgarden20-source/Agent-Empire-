"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
  status: string;
  revenue_today: number | null;
  revenue_week: number | null;
  revenue_month: number | null;
  mrr: number | null;
  target_mrr: number | null;
};

type AgentRun = {
  id: string;
  agent: string;
  status: string;
  created_at: string;
  cost_usd: number | null;
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "$0.00";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return "$0";
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

function vsTargetColor(mrr: number | null, target: number | null): string {
  if (mrr === null || target === null || target === 0) return "#555555";
  const ratio = mrr / target;
  if (ratio >= 1) return "#22c55e";
  if (ratio >= 0.8) return "#f59e0b";
  return "#ef4444";
}

function vsTargetLabel(mrr: number | null, target: number | null): string {
  if (mrr === null || target === null || target === 0) return "—";
  const pct = Math.round((mrr / target) * 100);
  return pct + "%";
}

export default function RevenuePage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [bizRes, runsRes] = await Promise.all([
      supabase.from("businesses").select("id,name,slug,status,revenue_today,revenue_week,revenue_month,mrr,target_mrr"),
      supabase
        .from("agent_runs")
        .select("id,agent,status,created_at,cost_usd")
        .gte("created_at", todayStart.toISOString()),
    ]);

    if (bizRes.data) setBusinesses(bizRes.data as Business[]);
    if (runsRes.data) setAgentRuns(runsRes.data as AgentRun[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();

    const bizSub = supabase
      .channel("revenue-businesses")
      .on("postgres_changes", { event: "*", schema: "public", table: "businesses" }, fetchData)
      .subscribe();

    const runsSub = supabase
      .channel("revenue-agent-runs")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_runs" }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(bizSub);
      supabase.removeChannel(runsSub);
    };
  }, []);

  const totalToday = businesses.reduce((s, b) => s + (b.revenue_today ?? 0), 0);
  const totalWeek = businesses.reduce((s, b) => s + (b.revenue_week ?? 0), 0);
  const totalMrr = businesses.reduce((s, b) => s + (b.mrr ?? 0), 0);
  const totalTargetMrr = businesses.reduce((s, b) => s + (b.target_mrr ?? 0), 0);
  const totalAgentCost = agentRuns.reduce((s, r) => s + (r.cost_usd ?? 0), 0);

  const mono: React.CSSProperties = { fontFamily: "var(--font-geist-mono)" };

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", padding: "32px 40px", ...mono }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ color: "#555", fontSize: 10, letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>
          WAR ROOM / REVENUE
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f5f5f5", letterSpacing: 1 }}>
          Revenue Intelligence
        </h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: "#1a1a1a",
          border: "1px solid #1a1a1a",
          marginBottom: 32,
        }}
      >
        {[
          { label: "TODAY'S REVENUE", value: fmt(totalToday) },
          { label: "THIS WEEK", value: fmtShort(totalWeek) },
          { label: "MRR", value: fmtShort(totalMrr) },
          { label: "TARGET MRR", value: fmtShort(totalTargetMrr) },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{ background: "#0a0a0a", padding: "24px 28px" }}
          >
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#f5f5f5", letterSpacing: -1 }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "#444", fontSize: 13, padding: "40px 0" }}>Loading revenue data...</div>
      ) : businesses.length === 0 ? (
        <div style={{ color: "#444", fontSize: 13, padding: "60px 0", textAlign: "center", letterSpacing: 1 }}>
          No revenue data yet — agents are building the pipeline
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
              Revenue by Business
            </div>
            <div style={{ border: "1px solid #1a1a1a", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#111", borderBottom: "1px solid #1a1a1a" }}>
                    {["BUSINESS", "TODAY", "WEEK", "MONTH", "MRR", "VS TARGET"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 16px",
                          textAlign: h === "BUSINESS" ? "left" : "right",
                          color: "#444",
                          fontSize: 10,
                          letterSpacing: 2,
                          fontWeight: 500,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((b, i) => {
                    const col = vsTargetColor(b.mrr, b.target_mrr);
                    const label = vsTargetLabel(b.mrr, b.target_mrr);
                    return (
                      <tr
                        key={b.id}
                        style={{
                          borderBottom: "1px solid #111",
                          background: i % 2 === 0 ? "#0a0a0a" : "#0d0d0d",
                        }}
                      >
                        <td style={{ padding: "12px 16px", color: "#e5e5e5" }}>
                          {b.name}
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 9,
                              color: "#444",
                              textTransform: "uppercase",
                              letterSpacing: 1,
                            }}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "#f5f5f5" }}>
                          {fmt(b.revenue_today)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "#f5f5f5" }}>
                          {fmt(b.revenue_week)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "#f5f5f5" }}>
                          {fmt(b.revenue_month)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "#f5f5f5" }}>
                          {fmt(b.mrr)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <span
                            style={{
                              color: col,
                              fontWeight: 600,
                              fontSize: 12,
                            }}
                          >
                            {label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div
            style={{
              marginTop: 32,
              border: "1px solid #1a1a1a",
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
                Agent Cost — Today
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>
                {fmt(totalAgentCost)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#444", letterSpacing: 1, marginBottom: 4 }}>
                {agentRuns.length} agent runs today
              </div>
              <div style={{ fontSize: 10, color: "#444", letterSpacing: 1 }}>
                avg {agentRuns.length > 0 ? fmt(totalAgentCost / agentRuns.length) : "$0.00"} / run
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
