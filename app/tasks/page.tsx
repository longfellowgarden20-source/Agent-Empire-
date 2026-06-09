"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type Task = {
  id: string;
  from_agent: string;
  to_agent: string;
  task_type: string;
  payload: Record<string, unknown>;
  priority: number;
  status: string;
  created_at: string;
};

type StatusFilter = "all" | "pending" | "running" | "done" | "failed";

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function priorityColor(p: number): string {
  if (p >= 9) return "#ef4444";
  if (p >= 7) return "#f97316";
  return "#6b7280";
}

function statusColor(s: string): string {
  if (s === "pending") return "#555555";
  if (s === "running") return "#3b82f6";
  if (s === "done") return "#22c55e";
  if (s === "failed") return "#ef4444";
  return "#6b7280";
}

function todayCount(tasks: Task[]): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return tasks.filter(
    (t) => t.status === "done" && new Date(t.created_at) >= start
  ).length;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from("task_queue")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });
    if (data) setTasks(data as Task[]);
  }, []);

  useEffect(() => {
    fetchTasks();
    const channel = supabase
      .channel("task_queue_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_queue" },
        () => fetchTasks()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTasks]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered =
    filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const pending = tasks.filter((t) => t.status === "pending").length;
  const running = tasks.filter((t) => t.status === "running").length;
  const doneToday = todayCount(tasks);

  const tabs: StatusFilter[] = ["all", "pending", "running", "done", "failed"];

  return (
    <div
      style={{
        background: "#0a0a0a",
        minHeight: "100vh",
        color: "#e5e7eb",
        fontFamily: "monospace",
        padding: "32px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "24px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "#f9fafb",
            letterSpacing: "0.05em",
            margin: 0,
          }}
        >
          TASK QUEUE
        </h1>
        <span style={{ color: "#6b7280", fontSize: "13px" }}>
          <span style={{ color: "#f97316" }}>{pending}</span> pending
          &nbsp;&nbsp;
          <span style={{ color: "#3b82f6" }}>{running}</span> running
          &nbsp;&nbsp;
          <span style={{ color: "#22c55e" }}>{doneToday}</span> done today
        </span>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              padding: "6px 14px",
              background: filter === tab ? "#1a1a1a" : "transparent",
              border: `1px solid ${filter === tab ? "#6366f1" : "#333"}`,
              borderRadius: "4px",
              color: filter === tab ? "#a5b4fc" : "#6b7280",
              fontFamily: "monospace",
              fontSize: "12px",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {filtered.length === 0 && (
          <div
            style={{
              color: "#4b5563",
              fontSize: "13px",
              padding: "32px",
              textAlign: "center",
            }}
          >
            no tasks
          </div>
        )}
        {filtered.map((task) => (
          <div
            key={task.id}
            style={{
              background: "#111111",
              border: "1px solid #1f1f1f",
              borderRadius: "6px",
              overflow: "hidden",
            }}
          >
            <div
              onClick={() => toggleExpand(task.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                cursor: "pointer",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  background: priorityColor(task.priority),
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: "3px",
                  minWidth: "28px",
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {task.priority}
              </span>

              <span style={{ fontSize: "13px", flex: "1 1 200px" }}>
                <span style={{ color: "#6366f1" }}>
                  {task.from_agent ?? "—"}
                </span>
                <span style={{ color: "#4b5563", margin: "0 6px" }}>→</span>
                <span style={{ color: "#22c55e" }}>{task.to_agent ?? "—"}</span>
              </span>

              <span
                style={{
                  color: "#a5b4fc",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  flex: "0 0 auto",
                }}
              >
                {task.task_type}
              </span>

              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flex: "0 0 auto",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: statusColor(task.status),
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    color: statusColor(task.status),
                    fontSize: "12px",
                    textTransform: "uppercase",
                  }}
                >
                  {task.status}
                </span>
              </span>

              <span
                style={{
                  color: "#4b5563",
                  fontSize: "12px",
                  flex: "0 0 auto",
                  marginLeft: "auto",
                }}
              >
                {relativeTime(task.created_at)}
              </span>

              <span style={{ color: "#4b5563", fontSize: "12px" }}>
                {expanded.has(task.id) ? "▲" : "▼"}
              </span>
            </div>

            {expanded.has(task.id) && (
              <div
                style={{
                  borderTop: "1px solid #1f1f1f",
                  padding: "12px 16px",
                  background: "#0d0d0d",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "#6b7280",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  payload
                </div>
                <pre
                  style={{
                    background: "#0a0a0a",
                    border: "1px solid #1f1f1f",
                    borderRadius: "4px",
                    padding: "12px",
                    fontSize: "12px",
                    color: "#86efac",
                    overflow: "auto",
                    margin: 0,
                    maxHeight: "240px",
                  }}
                >
                  {JSON.stringify(task.payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
