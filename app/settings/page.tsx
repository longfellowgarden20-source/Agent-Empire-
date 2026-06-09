"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type MemoryRow = {
  agent: string;
  key: string;
  value: unknown;
};

type AgentSchedule = {
  name: string;
  tier: number;
  schedule: string;
  lastRunKey: string;
};

const AGENT_SCHEDULES: AgentSchedule[] = [
  { name: "Oracle", tier: 1, schedule: "Every 8h", lastRunKey: "oracle_last_run" },
  { name: "Capital Allocator", tier: 1, schedule: "Every 24h", lastRunKey: "capital_allocator_last_run" },
  { name: "War Room Judge", tier: 1, schedule: "Every 6h", lastRunKey: "war_room_judge_last_run" },
  { name: "Idea Hunter", tier: 2, schedule: "Every 6h", lastRunKey: "idea_hunter_last_run" },
  { name: "Market Validator", tier: 2, schedule: "Every 12h", lastRunKey: "market_validator_last_run" },
  { name: "Architect", tier: 2, schedule: "On demand", lastRunKey: "architect_last_run" },
  { name: "Coder", tier: 2, schedule: "On demand", lastRunKey: "coder_last_run" },
  { name: "Tester", tier: 2, schedule: "On demand", lastRunKey: "tester_last_run" },
  { name: "Deployer", tier: 2, schedule: "On demand", lastRunKey: "deployer_last_run" },
  { name: "Prospector", tier: 3, schedule: "Every 24h", lastRunKey: "prospector_last_run" },
  { name: "Researcher", tier: 3, schedule: "Every 12h", lastRunKey: "researcher_last_run" },
  { name: "Copywriter", tier: 3, schedule: "Every 24h", lastRunKey: "copywriter_last_run" },
  { name: "Outreach", tier: 3, schedule: "Every 4h", lastRunKey: "outreach_last_run" },
  { name: "Deal Closer", tier: 3, schedule: "Every 2h", lastRunKey: "deal_closer_last_run" },
  { name: "Stock Intelligence", tier: 4, schedule: "Every 1h", lastRunKey: "stock_intelligence_last_run" },
  { name: "Crypto Watcher", tier: 4, schedule: "Every 30m", lastRunKey: "crypto_watcher_last_run" },
  { name: "Trend Surfer", tier: 4, schedule: "Every 4h", lastRunKey: "trend_surfer_last_run" },
  { name: "Competitor Tracker", tier: 4, schedule: "Every 12h", lastRunKey: "competitor_tracker_last_run" },
  { name: "Content Strategist", tier: 5, schedule: "Every 24h", lastRunKey: "content_strategist_last_run" },
  { name: "Writer", tier: 5, schedule: "Every 6h", lastRunKey: "writer_last_run" },
  { name: "Social Agent", tier: 5, schedule: "Every 4h", lastRunKey: "social_agent_last_run" },
  { name: "SEO Agent", tier: 5, schedule: "Every 24h", lastRunKey: "seo_agent_last_run" },
  { name: "Email Marketer", tier: 5, schedule: "Every 24h", lastRunKey: "email_marketer_last_run" },
  { name: "Web Crawler", tier: 7, schedule: "Every 6h", lastRunKey: "web_crawler_last_run" },
  { name: "Memory Keeper", tier: 7, schedule: "Every 24h", lastRunKey: "memory_keeper_last_run" },
  { name: "Systems Monitor", tier: 8, schedule: "Every 5m", lastRunKey: "systems_monitor_last_run" },
  { name: "Finance Tracker", tier: 8, schedule: "Every 1h", lastRunKey: "finance_tracker_last_run" },
  { name: "Security Agent", tier: 8, schedule: "Every 6h", lastRunKey: "security_agent_last_run" },
  { name: "Evolution Agent", tier: 9, schedule: "Every 72h", lastRunKey: "evolution_agent_last_run" },
];

const API_KEYS = [
  { label: "GEMINI_API_KEY", key: "gemini_key" },
  { label: "GROQ_API_KEY", key: "groq_key" },
  { label: "TAVILY_API_KEY", key: "tavily_key" },
  { label: "ANTHROPIC_API_KEY", key: "anthropic_key" },
  { label: "PERPLEXITY_API_KEY", key: "perplexity_key" },
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

export default function SettingsPage() {
  const [paused, setPaused] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [dailyBudget, setDailyBudget] = useState<string>("");
  const [budgetInput, setBudgetInput] = useState<string>("");
  const [savingBudget, setSavingBudget] = useState(false);

  const [todaySpend, setTodaySpend] = useState<number>(0);

  const [lastRuns, setLastRuns] = useState<Record<string, string>>({});

  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(true);

  async function fetchData() {
    const allKeys = [
      "paused",
      "daily_budget_usd",
      "api_key_status",
      ...AGENT_SCHEDULES.map((a) => a.lastRunKey),
    ];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [{ data: memData }, { data: runData }] = await Promise.all([
      supabase
        .from("agent_memory")
        .select("key,value")
        .eq("agent", "system")
        .in("key", allKeys),
      supabase
        .from("agent_runs")
        .select("cost_usd")
        .gte("created_at", today.toISOString()),
    ]);

    const mem: Record<string, unknown> = {};
    (memData || []).forEach((row: { key: string; value: unknown }) => { mem[row.key] = row.value; });

    setPaused(mem["paused"] === true);

    const budget = mem["daily_budget_usd"];
    if (budget !== null && budget !== undefined) {
      setDailyBudget(String(budget));
      setBudgetInput(String(budget));
    }

    const apiStatus = mem["api_key_status"];
    if (apiStatus && typeof apiStatus === "object") {
      setApiKeyStatus(apiStatus as Record<string, boolean>);
    }

    const runs: Record<string, string> = {};
    AGENT_SCHEDULES.forEach((a) => {
      const v = mem[a.lastRunKey];
      if (v && typeof v === "string") runs[a.lastRunKey] = v;
    });
    setLastRuns(runs);

    const spend = (runData || []).reduce(
      (s: number, r: { cost_usd: number | null }) => s + (r.cost_usd ?? 0),
      0
    );
    setTodaySpend(spend);

    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function togglePause() {
    setToggling(true);
    const next = !paused;
    await supabase
      .from("agent_memory")
      .upsert({ agent: "system", key: "paused", value: next }, { onConflict: "agent,key" });
    setPaused(next);
    setToggling(false);
  }

  async function saveBudget() {
    const val = parseFloat(budgetInput);
    if (isNaN(val) || val <= 0) return;
    setSavingBudget(true);
    await supabase
      .from("agent_memory")
      .upsert(
        { agent: "system", key: "daily_budget_usd", value: val },
        { onConflict: "agent,key" }
      );
    setDailyBudget(String(val));
    setSavingBudget(false);
  }

  const budgetNum = parseFloat(dailyBudget);
  const budgetPct = !isNaN(budgetNum) && budgetNum > 0 ? (todaySpend / budgetNum) * 100 : 0;
  const budgetBarColor =
    budgetPct > 90 ? "#ef4444" : budgetPct > 70 ? "#f59e0b" : "#22c55e";

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 32,
        fontFamily: "var(--font-geist-mono)",
      }}
    >
      <div>
        <h1 style={{ color: "#f5f5f5", fontSize: 15, fontWeight: 600, letterSpacing: 1 }}>
          SETTINGS
        </h1>
        <p style={{ color: "#555", fontSize: 11, marginTop: 4 }}>
          System controls and configuration
        </p>
      </div>

      {loading ? (
        <p style={{ color: "#555", fontSize: 11 }}>Loading...</p>
      ) : (
        <>
          <section
            style={{
              border: `1px solid ${paused ? "#ef444430" : "#22c55e30"}`,
              borderRadius: 4,
              padding: 24,
              background: paused ? "#0d0000" : "#040d04",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: 13, color: "#f5f5f5", letterSpacing: 1, textTransform: "uppercase" }}>
                  Kill Switch
                </h2>
                <p style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                  {paused
                    ? "All agents are paused. No tasks will be executed."
                    : "All agents are running. Tasks are being processed normally."}
                </p>
              </div>
              <button
                onClick={togglePause}
                disabled={toggling}
                style={{
                  padding: "12px 32px",
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  fontFamily: "var(--font-geist-mono)",
                  borderRadius: 4,
                  cursor: toggling ? "wait" : "pointer",
                  background: paused ? "#1a0000" : "#001a00",
                  color: paused ? "#ef4444" : "#22c55e",
                  border: `2px solid ${paused ? "#ef444450" : "#22c55e50"}`,
                  minWidth: 180,
                }}
              >
                {toggling ? "..." : paused ? "⏸ PAUSED" : "▶ RUNNING"}
              </button>
            </div>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
              Budget Limits
            </h2>
            <div
              style={{
                border: "1px solid #1f1f1f",
                borderRadius: 4,
                padding: 16,
                background: "#0a0a0a",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>
                    Daily Budget (USD)
                  </label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 14, color: "#555" }}>$</span>
                    <input
                      type="number"
                      value={budgetInput}
                      onChange={(e) => setBudgetInput(e.target.value)}
                      min={0.01}
                      step={0.01}
                      style={{
                        background: "#050505",
                        border: "1px solid #222",
                        borderRadius: 3,
                        color: "#f5f5f5",
                        fontSize: 13,
                        padding: "6px 10px",
                        fontFamily: "var(--font-geist-mono)",
                        width: 100,
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={saveBudget}
                      disabled={savingBudget || budgetInput === dailyBudget}
                      style={{
                        padding: "6px 14px",
                        fontSize: 9,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        fontFamily: "var(--font-geist-mono)",
                        borderRadius: 3,
                        cursor:
                          savingBudget || budgetInput === dailyBudget
                            ? "not-allowed"
                            : "pointer",
                        background:
                          savingBudget || budgetInput === dailyBudget ? "#111" : "#6366f1",
                        color:
                          savingBudget || budgetInput === dailyBudget ? "#444" : "#fff",
                        border: "1px solid transparent",
                      }}
                    >
                      {savingBudget ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: "#555" }}>
                      Today: ${todaySpend.toFixed(4)}
                    </span>
                    {!isNaN(budgetNum) && budgetNum > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: budgetBarColor,
                        }}
                      >
                        {budgetPct.toFixed(1)}% used
                      </span>
                    )}
                  </div>
                  {!isNaN(budgetNum) && budgetNum > 0 && (
                    <div
                      style={{
                        height: 6,
                        background: "#1a1a1a",
                        borderRadius: 3,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(budgetPct, 100)}%`,
                          background: budgetBarColor,
                          borderRadius: 3,
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
              API Key Status
            </h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {API_KEYS.map((k) => {
                const isSet = apiKeyStatus[k.key] === true;
                return (
                  <div
                    key={k.key}
                    style={{
                      border: `1px solid ${isSet ? "#22c55e20" : "#ef444420"}`,
                      borderRadius: 4,
                      padding: "10px 14px",
                      background: isSet ? "#040d04" : "#0d0000",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      flex: 1,
                      minWidth: 160,
                    }}
                  >
                    <span style={{ fontSize: 10, color: "#aaa", letterSpacing: 0.5 }}>
                      {k.label}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: 2,
                        color: isSet ? "#22c55e" : "#ef4444",
                      }}
                    >
                      {isSet ? "SET" : "MISSING"}
                    </span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 10, color: "#333" }}>
              Status written by agents on startup via agent_memory &#123;agent:&apos;system&apos;, key:&apos;api_key_status&apos;&#125;
            </p>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
              Agent Schedules
            </h2>
            <div
              style={{
                border: "1px solid #1a1a1a",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 60px 120px 1fr",
                  padding: "8px 14px",
                  background: "#0d0d0d",
                  borderBottom: "1px solid #1a1a1a",
                }}
              >
                {["Agent", "Tier", "Schedule", "Last Run"].map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: 9,
                      color: "#444",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {AGENT_SCHEDULES.map((agent, idx) => {
                const lastRun = lastRuns[agent.lastRunKey] ?? null;
                const tierColors: Record<number, string> = {
                  1: "#6366f1",
                  2: "#3b82f6",
                  3: "#22c55e",
                  4: "#f59e0b",
                  5: "#ec4899",
                  7: "#14b8a6",
                  8: "#ef4444",
                  9: "#a855f7",
                };
                const tierColor = tierColors[agent.tier] ?? "#555";

                return (
                  <div
                    key={agent.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 60px 120px 1fr",
                      padding: "8px 14px",
                      background: idx % 2 === 0 ? "#0a0a0a" : "#080808",
                      borderBottom: "1px solid #111",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#ccc" }}>{agent.name}</span>
                    <span
                      style={{
                        fontSize: 9,
                        color: tierColor,
                        fontWeight: 600,
                      }}
                    >
                      T{agent.tier}
                    </span>
                    <span style={{ fontSize: 10, color: "#777" }}>{agent.schedule}</span>
                    <span style={{ fontSize: 10, color: "#444" }}>
                      {lastRun ? timeAgo(lastRun) : "never"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
