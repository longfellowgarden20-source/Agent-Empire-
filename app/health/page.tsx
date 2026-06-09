"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ServiceStatus = {
  key: string;
  label: string;
  memoryKey: string;
  alwaysUp?: boolean;
};

type StatusData = {
  status: "UP" | "DOWN" | "UNKNOWN";
  last_checked: string | null;
  response_ms: number | null;
};

type AgentRun = {
  id: string;
  agent_name: string;
  status: string;
  duration_ms: number | null;
  cost_usd: number | null;
  error: string | null;
  created_at: string;
};

type MemoryRow = {
  key: string;
  value: unknown;
};

const SERVICES: ServiceStatus[] = [
  { key: "gemini", label: "Gemini API", memoryKey: "gemini_status" },
  { key: "groq", label: "Groq API", memoryKey: "groq_status" },
  { key: "tavily", label: "Tavily API", memoryKey: "tavily_status" },
  { key: "supabase", label: "Supabase", memoryKey: "supabase_status", alwaysUp: true },
  { key: "railway", label: "Railway", memoryKey: "railway_status" },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function startOf(unit: "day" | "week" | "month"): string {
  const now = new Date();
  if (unit === "day") {
    now.setHours(0, 0, 0, 0);
  } else if (unit === "week") {
    const day = now.getDay();
    now.setDate(now.getDate() - day);
    now.setHours(0, 0, 0, 0);
  } else {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
  }
  return now.toISOString();
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(usd: number): string {
  return "$" + usd.toFixed(4);
}

export default function HealthPage() {
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, StatusData>>({});
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [allRuns, setAllRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function fetchData() {
    const todayIso = startOf("day");

    const [{ data: memData }, { data: runData }, { data: allRunData }] =
      await Promise.all([
        supabase
          .from("agent_memory")
          .select("key,value")
          .eq("agent", "system")
          .in(
            "key",
            SERVICES.map((s) => s.memoryKey)
          ),
        supabase
          .from("agent_runs")
          .select("id,agent_name,status,duration_ms,cost_usd,error,created_at")
          .gte("created_at", todayIso)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("agent_runs")
          .select("id,agent_name,status,duration_ms,cost_usd,error,created_at")
          .gte("created_at", startOf("month"))
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);

    const memMap: Record<string, StatusData> = {};
    SERVICES.forEach((s) => {
      if (s.alwaysUp) {
        memMap[s.key] = { status: "UP", last_checked: new Date().toISOString(), response_ms: null };
        return;
      }
      const row = (memData || []).find((r: MemoryRow) => r.key === s.memoryKey);
      if (row && row.value && typeof row.value === "object") {
        const v = row.value as Record<string, unknown>;
        memMap[s.key] = {
          status: (v.status as "UP" | "DOWN" | "UNKNOWN") ?? "UNKNOWN",
          last_checked: (v.last_checked as string) ?? null,
          response_ms: typeof v.response_ms === "number" ? v.response_ms : null,
        };
      } else {
        memMap[s.key] = { status: "UNKNOWN", last_checked: null, response_ms: null };
      }
    });

    setServiceStatuses(memMap);
    setRuns((runData || []).filter((r: AgentRun) => r.status === "failed").slice(0, 10));
    setAllRuns(allRunData || []);
    setLoading(false);
    setLastRefresh(new Date());
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const todayRuns = allRuns.filter((r) => r.created_at >= startOf("day"));
  const weekRuns = allRuns.filter((r) => r.created_at >= startOf("week"));

  const todayCost = todayRuns.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  const weekCost = weekRuns.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  const monthCost = allRuns.reduce((s, r) => s + (r.cost_usd ?? 0), 0);

  const successCount = todayRuns.filter((r) => r.status === "success" || r.status === "completed").length;
  const failedCount = todayRuns.filter((r) => r.status === "failed").length;
  const totalCount = todayRuns.length;
  const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : "—";
  const durations = todayRuns
    .map((r) => r.duration_ms)
    .filter((d): d is number => d !== null);
  const avgDuration =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  const recentFailures = allRuns
    .filter((r) => r.status === "failed")
    .slice(0, 10);

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 28,
        fontFamily: "var(--font-geist-mono)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ color: "#f5f5f5", fontSize: 15, fontWeight: 600, letterSpacing: 1 }}>
            SYSTEM HEALTH
          </h1>
          <p style={{ color: "#555", fontSize: 11, marginTop: 4 }}>
            Auto-refresh every 30s
          </p>
        </div>
        <span style={{ fontSize: 10, color: "#444" }}>
          Last refreshed: {lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>

      {loading ? (
        <p style={{ color: "#555", fontSize: 11 }}>Loading...</p>
      ) : (
        <>
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2
              style={{
                fontSize: 10,
                color: "#555",
                letterSpacing: 2,
                textTransform: "uppercase",
                borderBottom: "1px solid #1a1a1a",
                paddingBottom: 6,
              }}
            >
              API Status
            </h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {SERVICES.map((svc) => {
                const data = serviceStatuses[svc.key];
                const isUp = data?.status === "UP";
                const isDown = data?.status === "DOWN";
                const statusColor = isUp ? "#22c55e" : isDown ? "#ef4444" : "#555";
                const statusBg = isUp ? "#001a00" : isDown ? "#1a0000" : "#0a0a0a";
                const statusBorder = isUp ? "#22c55e30" : isDown ? "#ef444430" : "#1f1f1f";

                return (
                  <div
                    key={svc.key}
                    style={{
                      border: `1px solid ${statusBorder}`,
                      borderRadius: 4,
                      padding: "12px 16px",
                      background: statusBg,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      minWidth: 160,
                      flex: 1,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#ccc" }}>{svc.label}</span>
                      <span
                        style={{
                          fontSize: 8,
                          padding: "2px 8px",
                          borderRadius: 2,
                          background: statusColor + "20",
                          color: statusColor,
                          border: `1px solid ${statusColor}30`,
                          fontWeight: 700,
                          letterSpacing: 1,
                        }}
                      >
                        {data?.status ?? "UNKNOWN"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 9, color: "#444" }}>
                        {data?.last_checked ? timeAgo(data.last_checked) : "never checked"}
                      </span>
                      {data?.response_ms !== null && data?.response_ms !== undefined && (
                        <span style={{ fontSize: 9, color: "#555" }}>
                          {formatMs(data.response_ms)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2
              style={{
                fontSize: 10,
                color: "#555",
                letterSpacing: 2,
                textTransform: "uppercase",
                borderBottom: "1px solid #1a1a1a",
                paddingBottom: 6,
              }}
            >
              Agent Run Stats — Last 24h
            </h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { label: "Total Runs", value: totalCount.toString(), color: "#f5f5f5" },
                { label: "Success Rate", value: successRate + "%", color: "#22c55e" },
                { label: "Failed", value: failedCount.toString(), color: failedCount > 0 ? "#ef4444" : "#555" },
                { label: "Avg Duration", value: formatMs(avgDuration), color: "#6366f1" },
                { label: "Total Cost", value: formatCost(todayCost), color: "#f59e0b" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    border: "1px solid #1f1f1f",
                    borderRadius: 4,
                    padding: "12px 16px",
                    background: "#0a0a0a",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    flex: 1,
                    minWidth: 130,
                  }}
                >
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: stat.color,
                    }}
                  >
                    {stat.value}
                  </span>
                  <span style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2
              style={{
                fontSize: 10,
                color: "#ef4444",
                letterSpacing: 2,
                textTransform: "uppercase",
                borderBottom: "1px solid #2a0000",
                paddingBottom: 6,
              }}
            >
              Recent Failures
            </h2>
            {recentFailures.length === 0 ? (
              <p style={{ fontSize: 11, color: "#555", padding: "12px 0" }}>
                No failures — all agents running cleanly
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {recentFailures.map((run) => (
                  <div
                    key={run.id}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #2a0000",
                      borderRadius: 4,
                      background: "#0d0000",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>
                          {run.agent_name}
                        </span>
                        <span style={{ fontSize: 9, color: "#555" }}>
                          {timeAgo(run.created_at)}
                        </span>
                      </div>
                      {run.error && (
                        <p style={{ fontSize: 10, color: "#888", lineHeight: 1.5 }}>
                          {run.error.slice(0, 200)}{run.error.length > 200 ? "…" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2
              style={{
                fontSize: 10,
                color: "#555",
                letterSpacing: 2,
                textTransform: "uppercase",
                borderBottom: "1px solid #1a1a1a",
                paddingBottom: 6,
              }}
            >
              Cost Tracker
            </h2>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { label: "Today", value: formatCost(todayCost) },
                { label: "This Week", value: formatCost(weekCost) },
                { label: "This Month", value: formatCost(monthCost) },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    flex: 1,
                    border: "1px solid #1f1f1f",
                    borderRadius: 4,
                    padding: "12px 16px",
                    background: "#0a0a0a",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>
                    {item.value}
                  </span>
                  <span style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
