"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ChairmanItem = {
  id: string;
  message: string;
  priority: number;
  category: string | null;
  read: boolean;
  created_at: string;
};

type AgentRun = {
  id: string;
  status: string;
  created_at: string;
};

type Task = {
  id: string;
  status: string;
  task_type: string;
  created_at: string;
};

type Business = {
  id: string;
  revenue_today: number | null;
  name: string;
};

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0 });
}

export default function BriefPage() {
  const [items, setItems] = useState<ChairmanItem[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  async function fetchData() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const [
      { data: itemData },
      { data: runData },
      { data: taskData },
      { data: bizData },
    ] = await Promise.all([
      supabase.from("chairman_queue").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("agent_runs").select("id,status,created_at").gte("created_at", todayIso).limit(500),
      supabase.from("task_queue").select("id,status,task_type,created_at").gte("created_at", todayIso).limit(500),
      supabase.from("businesses").select("id,name,revenue_today").limit(50),
    ]);

    setItems(itemData || []);
    setRuns(runData || []);
    setTasks(taskData || []);
    setBusinesses(bizData || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
    const sub = supabase
      .channel("brief-ch")
      .on("postgres_changes", { event: "*", schema: "public", table: "chairman_queue" }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  async function markRead(id: string) {
    setMarkingId(id);
    await supabase.from("chairman_queue").update({ read: true }).eq("id", id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)));
    setMarkingId(null);
  }

  const todayKey = dayKey(new Date().toISOString());
  const activeDay = selectedDay ?? todayKey;

  const groupedByDay: Record<string, ChairmanItem[]> = {};
  items.forEach((item) => {
    const k = dayKey(item.created_at);
    if (!groupedByDay[k]) groupedByDay[k] = [];
    groupedByDay[k].push(item);
  });

  const sortedDays = Object.keys(groupedByDay).sort((a, b) => (b > a ? 1 : -1));

  const todayItems = groupedByDay[activeDay] || [];
  const attentionItems = todayItems
    .filter((i) => !i.read)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);

  const totalRevenue = businesses.reduce((s, b) => s + (b.revenue_today ?? 0), 0);
  const revenueBusinesses = businesses.filter((b) => (b.revenue_today ?? 0) > 0);

  const totalRuns = runs.length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const leadsFound = tasks.filter((t) => t.task_type === "find_leads" && t.status === "completed").length;
  const articlesPublished = tasks.filter(
    (t) => t.task_type === "publish_article" && t.status === "completed"
  ).length;

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 860,
        display: "flex",
        flexDirection: "column",
        gap: 28,
        fontFamily: "var(--font-geist-mono)",
      }}
    >
      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <h1 style={{ color: "#f5f5f5", fontSize: 15, fontWeight: 600, letterSpacing: 1 }}>
              CHAIRMAN BRIEF
            </h1>
            <p style={{ color: "#555", fontSize: 11, marginTop: 4 }}>
              {selectedDay ? formatDate(new Date(activeDay).toISOString()) : "Today · " + formatDate(new Date().toISOString())}
            </p>
          </div>

          {loading ? (
            <p style={{ color: "#555", fontSize: 11 }}>Loading...</p>
          ) : (
            <div
              style={{
                border: "1px solid #22c55e30",
                borderRadius: 4,
                padding: 20,
                background: "#040d04",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#22c55e",
                  letterSpacing: 1,
                  fontWeight: 700,
                  borderBottom: "1px solid #22c55e20",
                  paddingBottom: 10,
                }}
              >
                EMPIRE BRIEF — {formatDate(new Date().toISOString()).toUpperCase()}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 12, color: "#f5f5f5" }}>
                  💰 REVENUE LAST 24H: {totalRevenue > 0 ? formatCurrency(totalRevenue) : "$0"}
                </div>
                {revenueBusinesses.length > 0 ? (
                  <div style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 2 }}>
                    {revenueBusinesses.map((b) => (
                      <div key={b.id} style={{ fontSize: 11, color: "#aaa" }}>
                        {b.name}: {formatCurrency(b.revenue_today ?? 0)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ paddingLeft: 20, fontSize: 11, color: "#555" }}>
                    No revenue data yet
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 12, color: "#f5f5f5" }}>🤖 AGENT ACTIVITY</div>
                <div style={{ paddingLeft: 20, fontSize: 11, color: "#aaa" }}>
                  {completedTasks} tasks completed | {leadsFound} leads found | {articlesPublished} articles published
                </div>
                <div style={{ paddingLeft: 20, fontSize: 11, color: "#555" }}>
                  {totalRuns} agent runs today
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#f59e0b" }}>
                  ⚠️ NEEDS YOUR ATTENTION
                </div>
                {attentionItems.length > 0 ? (
                  <div style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                    {attentionItems.map((item, idx) => (
                      <div
                        key={item.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "8px 10px",
                          border: "1px solid #f59e0b20",
                          borderRadius: 3,
                          background: "#0d0a00",
                        }}
                      >
                        <span style={{ fontSize: 11, color: "#f59e0b", minWidth: 14 }}>
                          {idx + 1}.
                        </span>
                        <span style={{ fontSize: 11, color: "#ddd", flex: 1, lineHeight: 1.5 }}>
                          {item.message}
                        </span>
                        <button
                          onClick={() => markRead(item.id)}
                          disabled={markingId === item.id}
                          style={{
                            fontSize: 8,
                            padding: "2px 8px",
                            background: "#111",
                            color: "#555",
                            border: "1px solid #333",
                            borderRadius: 2,
                            cursor: "pointer",
                            letterSpacing: 1,
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {markingId === item.id ? "..." : "Mark Read"}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ paddingLeft: 20, fontSize: 11, color: "#555" }}>
                    No unread items
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, color: "#22c55e" }}>
                ✅ EVERYTHING ELSE RUNNING FINE
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            width: 180,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <h3
            style={{
              fontSize: 9,
              color: "#444",
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Brief Archive
          </h3>
          {sortedDays.length === 0 && !loading && (
            <p style={{ fontSize: 10, color: "#444" }}>No history yet</p>
          )}
          {sortedDays.map((day) => {
            const isToday = day === todayKey;
            const isActive = day === activeDay;
            const dayItems = groupedByDay[day];
            const unread = dayItems.filter((i) => !i.read).length;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(isToday && !selectedDay ? null : day)}
                style={{
                  padding: "7px 10px",
                  border: `1px solid ${isActive ? "#6366f1" : "#1f1f1f"}`,
                  borderRadius: 3,
                  background: isActive ? "#0d0d1a" : "#0a0a0a",
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: isActive ? "#a5b4fc" : "#aaa",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    {isToday ? "Today" : day}
                  </span>
                  {unread > 0 && (
                    <span
                      style={{
                        fontSize: 8,
                        background: "#f59e0b",
                        color: "#000",
                        borderRadius: 8,
                        padding: "1px 5px",
                        fontWeight: 700,
                      }}
                    >
                      {unread}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 9, color: "#444", fontFamily: "var(--font-geist-mono)" }}>
                  {dayItems.length} items
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && selectedDay !== todayKey && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            {formatDate(new Date(selectedDay).toISOString())}
          </h2>
          {(groupedByDay[selectedDay] || []).map((item) => (
            <div
              key={item.id}
              style={{
                padding: "10px 14px",
                border: `1px solid ${item.read ? "#1a1a1a" : "#f59e0b20"}`,
                borderRadius: 4,
                background: item.read ? "#0a0a0a" : "#0d0a00",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: item.read ? "#333" : "#f59e0b",
                  marginTop: 3,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, color: item.read ? "#666" : "#ddd", lineHeight: 1.5 }}>
                  {item.message}
                </p>
                <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                  {item.category && (
                    <span style={{ fontSize: 9, color: "#444" }}>{item.category}</span>
                  )}
                  <span style={{ fontSize: 9, color: "#333" }}>
                    priority {item.priority}
                  </span>
                  <span style={{ fontSize: 9, color: "#333" }}>
                    {new Date(item.created_at).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
