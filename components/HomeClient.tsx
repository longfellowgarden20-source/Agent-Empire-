"use client";

import React, { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import Banner from "@/components/Banner";
import BusinessesGrid, { Business } from "@/components/BusinessesGrid";
import {
  TopIntelCard,
  TrendAlert,
  SalesFunnelMini,
  IdeasScoreboard,
  WarRoomScoresGrid,
  BusinessesNeedingAttention,
  PublishingQueue,
  CostTracker,
  LastChairmanBrief,
  EmpireScore,
} from "@/components/CommandCenterExtras";

// ─── Types ───────────────────────────────────────────────────────────────────

type AgentRun = {
  id: string;
  agent: string;
  status: "success" | "failed" | "running";
  summary: string | null;
  created_at: string;
};

type ChairmanItem = {
  id: string;
  message: string;
  priority: number;
  requires_action: boolean;
  sent_in_brief: boolean;
  created_at: string;
};

type ApiQuota = {
  gemini: number;
  groq: number;
  tavily: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function uptimeBar(pct: number): string {
  const filled = Math.round(pct / 12.5);
  const empty = 8 - filled;
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, empty));
}

function quotaColor(pct: number): string {
  if (pct > 0.8) return "#ef4444";
  if (pct > 0.6) return "#f59e0b";
  return "#22c55e";
}

// ─── Sub-widgets (module-level to avoid remount issues) ───────────────────────

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: 10,
        letterSpacing: "0.12em",
        color: "#555555",
        textTransform: "uppercase",
        marginBottom: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "#111111",
        border: "1px solid #1f1f1f",
        borderRadius: 4,
        padding: "14px 16px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function QuotaMeter({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? value / max : 0;
  const color = quotaColor(pct);
  const barWidth = Math.round(Math.min(pct, 1) * 100);

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "monospace",
          fontSize: 11,
          color: "#aaaaaa",
          marginBottom: 4,
        }}
      >
        <span>{label}</span>
        <span style={{ color }}>
          {value.toLocaleString()}/{max.toLocaleString()}
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "#1a1a1a",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${barWidth}%`,
            background: color,
            borderRadius: 2,
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: "success" | "failed" | "running" }) {
  const color =
    status === "success" ? "#22c55e" : status === "failed" ? "#ef4444" : "#f59e0b";
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        marginRight: 8,
        flexShrink: 0,
      }}
    />
  );
}

function Heatmap({ runs }: { runs: AgentRun[] }) {
  // Build 7-col × 24-row grid: [dayOfWeek 0-6][hour 0-23]
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const now = new Date();

  runs.forEach((r) => {
    const d = new Date(r.created_at);
    const msAgo = now.getTime() - d.getTime();
    if (msAgo > 7 * 24 * 3600 * 1000) return;
    const dow = d.getDay(); // 0=Sun
    const hour = d.getHours();
    grid[dow][hour]++;
  });

  const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const hourLabels = ["00", "06", "12", "18"];

  function cellColor(count: number): string {
    if (count === 0) return "transparent";
    if (count === 1) return "#1a2a1a";
    if (count === 2) return "rgba(34,197,94,0.25)";
    return "#22c55e";
  }

  return (
    <div>
      <SectionTitle>Agent Run Heatmap (7d)</SectionTitle>
      <div style={{ display: "flex", gap: 3 }}>
        {/* Hour axis */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              style={{
                height: 8,
                width: 20,
                fontFamily: "monospace",
                fontSize: 8,
                color: hourLabels.includes(String(h).padStart(2, "0")) ? "#555555" : "transparent",
                display: "flex",
                alignItems: "center",
              }}
            >
              {String(h).padStart(2, "0")}
            </div>
          ))}
        </div>
        {/* Day columns */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Day labels */}
          <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
            {days.map((d) => (
              <div
                key={d}
                style={{
                  width: 10,
                  fontFamily: "monospace",
                  fontSize: 8,
                  color: "#555555",
                  textAlign: "center",
                }}
              >
                {d}
              </div>
            ))}
          </div>
          {/* Rows = hours */}
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ display: "flex", gap: 2, marginBottom: 2 }}>
              {Array.from({ length: 7 }, (_, d) => (
                <div
                  key={d}
                  title={`${days[d]} ${String(h).padStart(2, "0")}:00 — ${grid[d][h]} runs`}
                  style={{
                    width: 10,
                    height: 8,
                    background: cellColor(grid[d][h]),
                    border: "1px solid #1a1a1a",
                    borderRadius: 1,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40 }}>
      {values.map((v, i) => {
        const h = Math.max(3, Math.round((v / max) * 40));
        return (
          <div
            key={i}
            style={{
              width: 14,
              height: h,
              background: i === values.length - 1 ? "#22c55e" : "#1f3a1f",
              borderRadius: "2px 2px 0 0",
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomeClient() {
  // ── State ──
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [lastFiveRuns, setLastFiveRuns] = useState<AgentRun[]>([]);
  const [quotas, setQuotas] = useState<ApiQuota>({ gemini: 0, groq: 0, tavily: 0 });
  const [railwayHeartbeat, setRailwayHeartbeat] = useState<string | null>(null);
  const [chairmanQueue, setChairmanQueue] = useState<ChairmanItem[]>([]);
  const [agentsRunning, setAgentsRunning] = useState(0);
  const [agentsFailed, setAgentsFailed] = useState(0);
  const [uptime, setUptime] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [revenueChange, setRevenueChange] = useState(0);
  const [topEarner, setTopEarner] = useState<{ name: string; revenue: number } | null>(null);
  const [sparklineData, setSparklineData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [orderText, setOrderText] = useState("");
  const [orderSent, setOrderSent] = useState(false);
  const [tickerRuns, setTickerRuns] = useState<AgentRun[]>([]);
  const [heatmapRuns, setHeatmapRuns] = useState<AgentRun[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const agentsTotal = 47;

  // ── Data fetching ──
  async function fetchAll() {
    const [bizRes, runsRecentRes, runs24hRes, runs7dRes, memRes, queueRes] = await Promise.all([
      supabase.from("businesses").select("*").order("war_room_score", { ascending: false }),
      supabase
        .from("agent_runs")
        .select("*")
        .gte("created_at", new Date(Date.now() - 3600 * 1000).toISOString())
        .order("created_at", { ascending: false }),
      supabase
        .from("agent_runs")
        .select("*")
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .order("created_at", { ascending: false }),
      supabase
        .from("agent_runs")
        .select("*")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("agent_memory")
        .select("*")
        .eq("agent", "system")
        .in("key", ["gemini_calls_today", "groq_calls_today", "tavily_calls_today", "railway_heartbeat"]),
      supabase
        .from("chairman_queue")
        .select("*")
        .eq("requires_action", true)
        .eq("sent_in_brief", false)
        .order("priority", { ascending: false }),
    ]);

    // Businesses
    const bizData = bizRes.data ?? [];
    const biz: Business[] = bizData.map((b) => ({
      id: b.id,
      name: b.name,
      score: b.war_room_score ?? 0,
      revenue7d: b.revenue_7d ?? 0,
      trend:
        (b.revenue_7d ?? 0) > (b.revenue_prev_7d ?? 0)
          ? "up"
          : (b.revenue_7d ?? 0) < (b.revenue_prev_7d ?? 0)
          ? "down"
          : "flat",
      status: b.status ?? "active",
    }));
    setBusinesses(biz);

    const total7d = bizData.reduce((s, b) => s + (b.revenue_7d ?? 0), 0);
    const prev7d = bizData.reduce((s, b) => s + (b.revenue_prev_7d ?? 0), 0);
    const dailyRev = Math.round(total7d / 7);
    setRevenue(dailyRev);
    setRevenueChange(prev7d > 0 ? Math.round(((total7d - prev7d) / prev7d) * 100) : 0);

    if (bizData.length > 0) {
      const top = bizData.reduce((a, b) => ((b.revenue_7d ?? 0) > (a.revenue_7d ?? 0) ? b : a), bizData[0]);
      setTopEarner({ name: top.name, revenue: top.revenue_7d ?? 0 });
    }

    // Sparkline: 7 equal slices of total7d as placeholder (real data would need daily rows)
    const baseDaily = total7d / 7;
    setSparklineData(
      Array.from({ length: 7 }, (_, i) =>
        Math.max(0, baseDaily * (0.8 + Math.random() * 0.4))
      )
    );

    // Agent runs — last hour
    const recentRuns = runsRecentRes.data ?? [];
    const successCount = recentRuns.filter((r) => r.status === "success").length;
    setAgentsRunning(Math.min(successCount, agentsTotal));

    // Runs last 24h for failed count
    const runs24 = runs24hRes.data ?? [];
    const failedCount = runs24.filter((r) => r.status === "failed").length;
    const totalCount = runs24.length;
    setAgentsFailed(failedCount);
    setUptime(
      totalCount > 0 ? Math.round(((totalCount - failedCount) / totalCount) * 100) : 100
    );

    // Last 5 runs
    const allRecentRuns: AgentRun[] = (runs24hRes.data ?? []).slice(0, 20).map((r) => ({
      id: r.id,
      agent: r.agent,
      status: r.status,
      summary: r.summary,
      created_at: r.created_at,
    }));
    setAgentRuns(allRecentRuns);
    setTickerRuns(allRecentRuns.slice(0, 20));
    setLastFiveRuns(allRecentRuns.slice(0, 5));

    // Heatmap: 7d runs
    const runs7d: AgentRun[] = (runs7dRes.data ?? []).map((r) => ({
      id: r.id,
      agent: r.agent,
      status: r.status,
      summary: r.summary,
      created_at: r.created_at,
    }));
    setHeatmapRuns(runs7d);

    // API quotas from agent_memory
    const memData = memRes.data ?? [];
    const getVal = (key: string): number => {
      const row = memData.find((m) => m.key === key);
      return row ? Number(row.value) || 0 : 0;
    };
    setQuotas({
      gemini: getVal("gemini_calls_today"),
      groq: getVal("groq_calls_today"),
      tavily: getVal("tavily_calls_today"),
    });

    // Railway heartbeat
    const hbRow = memData.find((m) => m.key === "railway_heartbeat");
    setRailwayHeartbeat(hbRow ? hbRow.value : null);

    // Chairman queue
    setChairmanQueue((queueRes.data ?? []) as ChairmanItem[]);
  }

  useEffect(() => {
    fetchAll();

    const interval = setInterval(fetchAll, 60000);

    const runsSub = supabase
      .channel("home-runs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_runs" }, () =>
        fetchAll()
      )
      .subscribe();

    const queueSub = supabase
      .channel("home-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "chairman_queue" }, () =>
        fetchAll()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(runsSub);
      supabase.removeChannel(queueSub);
    };
  }, []);

  // ── Chairman order submit ──
  async function handleOrderSubmit() {
    if (!orderText.trim()) return;
    await supabase.from("task_queue").insert({
      from_agent: "chairman",
      to_agent: "war_room",
      task_type: "chairman_order",
      payload: { order: orderText.trim() },
      priority: 10,
      status: "pending",
    });
    setOrderSent(true);
    setOrderText("");
    setTimeout(() => setOrderSent(false), 3000);
  }

  // ── Dismiss chairman item ──
  async function dismissItem(id: string) {
    await supabase.from("chairman_queue").update({ sent_in_brief: true }).eq("id", id);
    setChairmanQueue((prev) => prev.filter((item) => item.id !== id));
  }

  // ── Railway status ──
  const railwayOnline =
    railwayHeartbeat !== null &&
    Date.now() - new Date(railwayHeartbeat).getTime() < 5 * 60 * 1000;
  const railwayMinsAgo = railwayHeartbeat
    ? Math.floor((Date.now() - new Date(railwayHeartbeat).getTime()) / 60000)
    : null;

  // ── Styles ──
  const mono: React.CSSProperties = { fontFamily: "monospace" };
  const monoSm: React.CSSProperties = { fontFamily: "monospace", fontSize: 12 };
  const monoXs: React.CSSProperties = { fontFamily: "monospace", fontSize: 11 };

  // Ticker text
  const tickerText = tickerRuns
    .map((r) => `${r.agent.replace(/_/g, " ")} · ${r.summary ?? r.status} · ${relativeTime(r.created_at)}`)
    .join("  ·····  ");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#f5f5f5",
        ...mono,
        paddingBottom: 48,
      }}
    >
      {/* Banner */}
      <Banner
        revenue={revenue}
        revenueChange={revenueChange}
        agentsRunning={agentsRunning}
        agentsTotal={agentsTotal}
        attentionCount={chairmanQueue.length}
      />

      {/* ── Feature 1: Empire Health Bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 24px",
          background: "#0d0d0d",
          borderBottom: "1px solid #1f1f1f",
          fontSize: 12,
          ...mono,
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: "#555555" }}>◈</span>
        <span style={{ color: "#f5f5f5" }}>
          <span style={{ color: "#555555" }}>AGENTS </span>
          <span style={{ color: "#22c55e" }}>{agentsTotal}</span>
        </span>
        <span style={{ color: "#333333" }}>|</span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#22c55e",
              marginRight: 6,
            }}
          />
          <span style={{ color: "#f5f5f5" }}>{agentsRunning}</span>
          <span style={{ color: "#555555" }}> RUNNING</span>
        </span>
        <span style={{ color: "#333333" }}>|</span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: agentsFailed > 0 ? "#ef4444" : "#1a1a1a",
              marginRight: 6,
            }}
          />
          <span style={{ color: agentsFailed > 0 ? "#ef4444" : "#555555" }}>
            {agentsFailed}
          </span>
          <span style={{ color: "#555555" }}> FAILED TODAY</span>
        </span>
        <span style={{ color: "#333333" }}>|</span>
        <span>
          <span style={{ color: uptime >= 90 ? "#22c55e" : uptime >= 70 ? "#f59e0b" : "#ef4444" }}>
            {uptimeBar(uptime)}
          </span>
          <span style={{ color: "#555555" }}> UPTIME </span>
          <span style={{ color: "#f5f5f5" }}>{uptime}%</span>
        </span>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Row 1: [API Quotas + Railway] | [Decision Box + Pending] */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Left: API Quotas + Railway */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Feature 2: API Quota Meters */}
            <Card>
              <SectionTitle>API Quota Meters</SectionTitle>
              <QuotaMeter label="Gemini" value={quotas.gemini} max={1500} />
              <QuotaMeter label="Groq" value={quotas.groq} max={14400} />
              <QuotaMeter label="Tavily" value={quotas.tavily} max={1000} />
            </Card>

            {/* Feature 3: Railway Worker Status */}
            <Card>
              <SectionTitle>Railway Workers</SectionTitle>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: railwayOnline ? "#22c55e" : "#ef4444",
                  }}
                />
                <span style={{ ...monoSm, color: railwayOnline ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                  {railwayOnline ? "UP" : "DOWN"}
                </span>
                <span style={{ ...monoXs, color: "#555555" }}>
                  {railwayHeartbeat === null
                    ? "No heartbeat received"
                    : railwayMinsAgo === 0
                    ? "Last heartbeat: just now"
                    : `Last heartbeat: ${railwayMinsAgo}m ago`}
                </span>
              </div>
            </Card>
          </div>

          {/* Right: Decision Box + Pending Decisions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Feature 9: Decision Box */}
            <Card style={{ flex: 1 }}>
              <SectionTitle>Chairman Order</SectionTitle>
              <textarea
                value={orderText}
                onChange={(e) => setOrderText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleOrderSubmit();
                }}
                placeholder="Issue a direct order to the empire..."
                rows={4}
                style={{
                  width: "100%",
                  background: "#0a0a0a",
                  border: "1px solid #2a2a2a",
                  borderRadius: 3,
                  color: "#f5f5f5",
                  fontFamily: "monospace",
                  fontSize: 12,
                  padding: "10px 12px",
                  resize: "none",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ ...monoXs, color: "#555555" }}>⌘+Enter to send</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {orderSent && (
                    <span style={{ ...monoXs, color: "#22c55e" }}>✓ Order issued</span>
                  )}
                  <button
                    onClick={handleOrderSubmit}
                    style={{
                      background: "#22c55e",
                      color: "#0a0a0a",
                      border: "none",
                      borderRadius: 3,
                      padding: "6px 16px",
                      fontFamily: "monospace",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      letterSpacing: "0.05em",
                    }}
                  >
                    SEND
                  </button>
                </div>
              </div>
            </Card>

            {/* Feature 10: Pending Decisions Counter */}
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: chairmanQueue.length > 0 ? 12 : 0 }}>
                <SectionTitle style={{ marginBottom: 0 }}>Pending Decisions</SectionTitle>
                {chairmanQueue.length > 0 && (
                  <span
                    style={{
                      background: "#ef4444",
                      color: "#fff",
                      borderRadius: 10,
                      padding: "1px 7px",
                      fontSize: 11,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      marginTop: -2,
                    }}
                  >
                    {chairmanQueue.length}
                  </span>
                )}
              </div>
              {chairmanQueue.length === 0 ? (
                <span style={{ ...monoXs, color: "#555555" }}>All clear — no decisions needed</span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {chairmanQueue.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        background: "#0d0d0d",
                        border: "1px solid #2a1a1a",
                        borderRadius: 3,
                        padding: "8px 10px",
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <span style={{ ...monoXs, color: "#f5f5f5", flex: 1, lineHeight: 1.5 }}>
                        {item.message}
                      </span>
                      <button
                        onClick={() => dismissItem(item.id)}
                        style={{
                          background: "transparent",
                          border: "1px solid #333333",
                          borderRadius: 2,
                          color: "#555555",
                          fontFamily: "monospace",
                          fontSize: 10,
                          padding: "2px 8px",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        DISMISS
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Row 2: [Revenue Sparkline + Top Earner] | [Last 5 Runs + Heatmap] */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Left: Revenue Sparkline + Top Earner */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Feature 4: Revenue Sparkline */}
            <Card>
              <SectionTitle>7-Day Revenue</SectionTitle>
              <div style={{ ...mono, fontSize: 22, color: "#f5f5f5", fontWeight: 600, marginBottom: 10 }}>
                ${sparklineData.reduce((s, v) => s + v, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                <span style={{ ...monoXs, color: "#555555", marginLeft: 8, fontWeight: 400 }}>7d total</span>
              </div>
              <Sparkline values={sparklineData} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span key={i} style={{ fontSize: 9, color: "#333333", fontFamily: "monospace", width: 14, textAlign: "center" }}>
                    {d}
                  </span>
                ))}
              </div>
            </Card>

            {/* Feature 5: Top Earner Today */}
            <Card>
              <SectionTitle>Top Earner (7d)</SectionTitle>
              {topEarner ? (
                <div>
                  <div style={{ ...mono, fontSize: 13, color: "#22c55e", marginBottom: 4 }}>
                    {topEarner.name}
                  </div>
                  <div style={{ ...mono, fontSize: 28, color: "#f5f5f5", fontWeight: 700, lineHeight: 1 }}>
                    ${topEarner.revenue.toLocaleString()}
                  </div>
                  <div style={{ ...monoXs, color: "#555555", marginTop: 4 }}>revenue last 7 days</div>
                </div>
              ) : (
                <span style={{ ...monoXs, color: "#555555" }}>No businesses yet</span>
              )}
            </Card>
          </div>

          {/* Right: Last 5 Runs + Heatmap */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Feature 8: Last 5 Agent Runs */}
            <Card>
              <SectionTitle>Last 5 Agent Runs</SectionTitle>
              {lastFiveRuns.length === 0 ? (
                <span style={{ ...monoXs, color: "#555555" }}>No runs yet</span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {lastFiveRuns.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        fontFamily: "monospace",
                      }}
                    >
                      <StatusDot status={r.status} />
                      <span style={{ color: "#f5f5f5", minWidth: 120, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.agent.replace(/_/g, " ")}
                      </span>
                      <span style={{ color: "#555555", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {(r.summary ?? r.status).slice(0, 50)}
                      </span>
                      <span style={{ color: "#333333", flexShrink: 0, marginLeft: 6 }}>
                        {relativeTime(r.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Feature 7: Agent Run Heatmap */}
            <Card>
              <Heatmap runs={heatmapRuns} />
            </Card>
          </div>
        </div>

        {/* Row 3: Businesses Grid */}
        <div>
          <div
            style={{
              ...monoXs,
              color: "#555555",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Portfolio — {businesses.length} businesses
          </div>
          <BusinessesGrid businesses={businesses} />
        </div>

        {/* Features 11-20 */}

        {/* Row: Empire Score + Top Intel + Trend Alert */}
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 16, alignItems: "start" }}>
          <EmpireScore />
          <TopIntelCard />
          <TrendAlert />
        </div>

        {/* Row: Sales Funnel + Ideas Scoreboard */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <SalesFunnelMini />
          <IdeasScoreboard />
        </div>

        {/* Row: War Room Scores Grid (full width) */}
        <WarRoomScoresGrid />

        {/* Row: Businesses Needing Attention */}
        <BusinessesNeedingAttention />

        {/* Row: Publishing Queue + Cost Tracker */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <PublishingQueue />
          <CostTracker />
        </div>

        {/* Row: Last Chairman Brief */}
        <LastChairmanBrief />

        {/* bottom padding so ticker doesn't cover content */}
        <div style={{ height: 48 }} />
      </div>

      {/* Feature 6: Live Agent Ticker — fixed at bottom */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 36,
          background: "#0d0d0d",
          borderTop: "1px solid #1f1f1f",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          zIndex: 50,
        }}
      >
        {tickerRuns.length === 0 ? (
          <span style={{ ...monoXs, color: "#333333", padding: "0 24px" }}>
            ◈ No agent activity yet — ticker will populate when agents run
          </span>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              whiteSpace: "nowrap",
              animation: "ticker-scroll 60s linear infinite",
              fontSize: 11,
              fontFamily: "monospace",
              color: "#555555",
            }}
          >
            <span style={{ color: "#22c55e", marginRight: 16 }}>◈</span>
            {tickerText}
            <span style={{ marginLeft: 40, marginRight: 16 }}>◈</span>
            {tickerText}
          </div>
        )}
        <style>{`
          @keyframes ticker-scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}</style>
      </div>
    </div>
  );
}
