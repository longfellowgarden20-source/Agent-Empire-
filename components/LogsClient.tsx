"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Run = {
  id: string;
  agent: string;
  status: "success" | "failed" | "skipped";
  summary: string;
  duration_ms: number;
  cost_usd: number;
  created_at: string;
};

type QueueItem = {
  id: string;
  from_agent: string;
  to_agent: string;
  task_type: string;
  status: string;
  priority: number;
  created_at: string;
};

function formatAgent(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LogsClient() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [failed, setFailed] = useState<QueueItem[]>([]);
  const [tab, setTab] = useState<"runs" | "queue" | "dlq">("runs");

  async function fetchLogs() {
    const [runsRes, dlqRes] = await Promise.all([
      supabase.from("agent_runs").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("task_queue").select("*").eq("status", "failed").order("created_at", { ascending: false }).limit(50),
    ]);
    setRuns(runsRes.data || []);
    setFailed(dlqRes.data || []);
  }

  useEffect(() => {
    fetchLogs();
    const sub = supabase
      .channel("logs-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_runs" }, fetchLogs)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const tabs = [
    { key: "runs", label: `Agent Runs (${runs.length})` },
    { key: "dlq", label: `Failed Tasks (${failed.length})` },
  ] as const;

  return (
    <div className="flex flex-col gap-4 p-6" style={{ maxWidth: 1000 }}>
      <h1 className="text-lg font-semibold" style={{ color: "#f5f5f5" }}>Logs</h1>

      <div className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-3 py-1 text-xs uppercase tracking-wider rounded-sm"
            style={{
              fontFamily: "var(--font-geist-mono)",
              background: tab === t.key ? "#1f1f1f" : "transparent",
              color: tab === t.key ? "#f5f5f5" : "#555555",
              border: `1px solid ${tab === t.key ? "#2a2a2a" : "#1f1f1f"}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "runs" && (
        <div className="flex flex-col rounded-sm" style={{ background: "#111111", border: "1px solid #1f1f1f" }}>
          <div
            className="grid px-4 py-2 text-xs uppercase tracking-wider border-b"
            style={{ gridTemplateColumns: "120px 1fr 70px 70px 60px", color: "#333333", borderColor: "#1f1f1f", fontFamily: "var(--font-geist-mono)" }}
          >
            <span>Time</span><span>Agent</span><span className="text-right">Duration</span><span className="text-right">Cost</span><span className="text-right">Status</span>
          </div>
          <div className="divide-y overflow-auto" style={{ borderColor: "#1f1f1f", maxHeight: 600 }}>
            {runs.length === 0 ? (
              <p className="px-4 py-6 text-xs" style={{ color: "#555555" }}>No runs yet.</p>
            ) : runs.map((r) => (
              <div key={r.id} className="grid px-4 py-2.5 items-center" style={{ gridTemplateColumns: "120px 1fr 70px 70px 60px" }}>
                <span className="text-xs tabular-nums" style={{ color: "#333333", fontFamily: "var(--font-geist-mono)" }}>
                  {new Date(r.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/New_York" })}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs" style={{ color: "#f5f5f5" }}>{formatAgent(r.agent)}</span>
                  {r.summary && <span className="text-xs truncate" style={{ color: "#555555" }}>{r.summary}</span>}
                </div>
                <span className="text-xs tabular-nums text-right" style={{ color: "#333333", fontFamily: "var(--font-geist-mono)" }}>{r.duration_ms ? `${r.duration_ms}ms` : "—"}</span>
                <span className="text-xs tabular-nums text-right" style={{ color: "#333333", fontFamily: "var(--font-geist-mono)" }}>{r.cost_usd ? `$${r.cost_usd.toFixed(4)}` : "—"}</span>
                <span className="text-xs text-right uppercase" style={{ color: r.status === "success" ? "#22c55e" : r.status === "failed" ? "#ef4444" : "#555555", fontFamily: "var(--font-geist-mono)" }}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "dlq" && (
        <div className="flex flex-col rounded-sm" style={{ background: "#111111", border: "1px solid #1f1f1f" }}>
          {failed.length === 0 ? (
            <p className="px-4 py-6 text-xs" style={{ color: "#22c55e" }}>No failed tasks — all clear.</p>
          ) : failed.map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-4 py-3 border-b" style={{ borderColor: "#1f1f1f" }}>
              <span className="text-xs tabular-nums shrink-0" style={{ color: "#333333", fontFamily: "var(--font-geist-mono)" }}>
                {new Date(item.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" })}
              </span>
              <span className="text-xs" style={{ color: "#ef4444" }}>{formatAgent(item.from_agent)} → {formatAgent(item.to_agent)}</span>
              <span className="text-xs flex-1" style={{ color: "#555555" }}>{item.task_type}</span>
              <button
                onClick={async () => {
                  await supabase.from("task_queue").update({ status: "pending" }).eq("id", item.id);
                  fetchLogs();
                }}
                className="text-xs px-2 py-0.5 rounded-sm shrink-0"
                style={{ color: "#6366f1", border: "1px solid #6366f1", fontFamily: "var(--font-geist-mono)" }}
              >
                RETRY
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
