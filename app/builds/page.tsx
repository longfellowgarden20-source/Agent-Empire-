"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Idea = {
  id: string;
  title: string;
  description: string;
  status: string;
  raw_score: number | null;
  validated_score: number | null;
  spec: Record<string, unknown> | null;
  created_at: string;
};

type Task = {
  id: string;
  from_agent: string;
  to_agent: string;
  task_type: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const PIPELINE_STAGES = [
  { agent: "idea_hunter", label: "Idea Hunter" },
  { agent: "market_validator", label: "Market Validator" },
  { agent: "architect", label: "Architect" },
  { agent: "coder", label: "Coder" },
  { agent: "tester", label: "Tester" },
  { agent: "deployer", label: "Deployer" },
];

const STATUS_STAGE: Record<string, number> = {
  raw: 0,
  validating: 1,
  validated: 2,
  building: 3,
  live: 5,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StageBox({ label, count, active }: { label: string; count: number; active: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "10px 14px",
        border: `1px solid ${active ? "#6366f1" : "#1f1f1f"}`,
        borderRadius: 4,
        background: active ? "#0d0d1a" : "#0d0d0d",
        minWidth: 100,
        flex: 1,
      }}
    >
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: active ? "#6366f1" : "#555",
          fontFamily: "var(--font-geist-mono)",
        }}
      >
        {count}
      </span>
      <span
        style={{
          fontSize: 9,
          color: active ? "#a5b4fc" : "#555",
          fontFamily: "var(--font-geist-mono)",
          letterSpacing: 1,
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function BuildCard({ idea, tasks }: { idea: Idea; tasks: Task[] }) {
  const activeTasks = tasks.filter(
    (t) => t.status === "pending" || t.status === "running"
  );
  const currentAgent = activeTasks[0]?.to_agent ?? null;
  const stageIdx = PIPELINE_STAGES.findIndex((s) => s.agent === currentAgent);

  const spec = idea.spec as Record<string, unknown> | null;
  const revenueModel =
    spec && typeof spec.revenue_model === "string" ? spec.revenue_model : null;
  const agentRoster = spec && Array.isArray(spec.agent_roster) ? spec.agent_roster as string[] : null;

  return (
    <div
      style={{
        border: "1px solid #1e3a5f",
        borderRadius: 4,
        padding: 16,
        background: "#080d12",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#f5f5f5",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            {idea.title}
          </span>
          {idea.description && (
            <p
              style={{
                fontSize: 11,
                color: "#777",
                marginTop: 4,
                fontFamily: "var(--font-geist-mono)",
                lineHeight: 1.5,
              }}
            >
              {idea.description.slice(0, 120)}{idea.description.length > 120 ? "…" : ""}
            </p>
          )}
        </div>
        <span
          style={{
            fontSize: 9,
            color: "#555",
            fontFamily: "var(--font-geist-mono)",
            marginLeft: 12,
            whiteSpace: "nowrap",
          }}
        >
          {timeAgo(idea.created_at)}
        </span>
      </div>

      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {PIPELINE_STAGES.map((s, i) => (
          <div key={s.agent} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                padding: "2px 8px",
                borderRadius: 2,
                fontSize: 9,
                fontFamily: "var(--font-geist-mono)",
                letterSpacing: 0.5,
                textTransform: "uppercase",
                background:
                  i === stageIdx
                    ? "#6366f1"
                    : i < stageIdx
                    ? "#0a2a0a"
                    : "#111",
                color:
                  i === stageIdx
                    ? "#fff"
                    : i < stageIdx
                    ? "#22c55e"
                    : "#444",
                border:
                  i === stageIdx
                    ? "1px solid #6366f1"
                    : i < stageIdx
                    ? "1px solid #22c55e30"
                    : "1px solid #1f1f1f",
              }}
            >
              {s.label}
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <span style={{ color: "#333", fontSize: 9 }}>→</span>
            )}
          </div>
        ))}
      </div>

      {(revenueModel || agentRoster) && (
        <div
          style={{
            borderTop: "1px solid #1a1a1a",
            paddingTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {revenueModel && (
            <div style={{ display: "flex", gap: 8 }}>
              <span
                style={{
                  fontSize: 9,
                  color: "#444",
                  fontFamily: "var(--font-geist-mono)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  minWidth: 80,
                }}
              >
                Revenue
              </span>
              <span style={{ fontSize: 10, color: "#aaa", fontFamily: "var(--font-geist-mono)" }}>
                {revenueModel}
              </span>
            </div>
          )}
          {agentRoster && (
            <div style={{ display: "flex", gap: 8 }}>
              <span
                style={{
                  fontSize: 9,
                  color: "#444",
                  fontFamily: "var(--font-geist-mono)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  minWidth: 80,
                }}
              >
                Agents
              </span>
              <span style={{ fontSize: 10, color: "#aaa", fontFamily: "var(--font-geist-mono)" }}>
                {agentRoster.join(", ")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BuildsPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    const [{ data: ideaData }, { data: taskData }] = await Promise.all([
      supabase.from("ideas").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("task_queue").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setIdeas(ideaData || []);
    setTasks(taskData || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
    const sub = supabase
      .channel("builds-ch")
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_queue" }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const stageCounts = PIPELINE_STAGES.map((s, i) => {
    return ideas.filter((idea) => STATUS_STAGE[idea.status] === i).length;
  });

  const building = ideas.filter((i) => i.status === "building");
  const live = ideas.filter((i) => i.status === "live");
  const queued = ideas.filter((i) => i.status === "validated").sort(
    (a, b) => (b.validated_score ?? 0) - (a.validated_score ?? 0)
  );

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1100,
        display: "flex",
        flexDirection: "column",
        gap: 28,
        fontFamily: "var(--font-geist-mono)",
      }}
    >
      <div>
        <h1 style={{ color: "#f5f5f5", fontSize: 15, fontWeight: 600, letterSpacing: 1 }}>
          BUILD PIPELINE
        </h1>
        <p style={{ color: "#555", fontSize: 11, marginTop: 4 }}>
          {building.length} building · {live.length} live · {queued.length} queued
        </p>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {PIPELINE_STAGES.map((s, i) => (
          <StageBox key={s.agent} label={s.label} count={stageCounts[i]} active={stageCounts[i] > 0} />
        ))}
      </div>

      {loading ? (
        <p style={{ color: "#555", fontSize: 11 }}>Loading...</p>
      ) : (
        <>
          {building.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2
                style={{
                  fontSize: 10,
                  color: "#3b82f6",
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  borderBottom: "1px solid #1a2a3a",
                  paddingBottom: 6,
                }}
              >
                Active Builds ({building.length})
              </h2>
              {building.map((idea) => (
                <BuildCard
                  key={idea.id}
                  idea={idea}
                  tasks={tasks.filter(
                    (t) =>
                      (t.payload as Record<string, unknown> | null)?.idea_id === idea.id
                  )}
                />
              ))}
            </section>
          )}

          {live.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2
                style={{
                  fontSize: 10,
                  color: "#22c55e",
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  borderBottom: "1px solid #0a2a0a",
                  paddingBottom: 6,
                }}
              >
                Live ({live.length})
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {live.map((idea) => (
                  <div
                    key={idea.id}
                    style={{
                      border: "1px solid #22c55e30",
                      borderRadius: 4,
                      padding: "10px 14px",
                      background: "#040d04",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      minWidth: 200,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 8,
                          background: "#22c55e",
                          color: "#000",
                          padding: "1px 6px",
                          borderRadius: 2,
                          letterSpacing: 1,
                          fontWeight: 700,
                        }}
                      >
                        LIVE
                      </span>
                      <span style={{ fontSize: 11, color: "#f5f5f5" }}>{idea.title}</span>
                    </div>
                    <span style={{ fontSize: 10, color: "#555" }}>{timeAgo(idea.created_at)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {queued.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2
                style={{
                  fontSize: 10,
                  color: "#6366f1",
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  borderBottom: "1px solid #1a1a2a",
                  paddingBottom: 6,
                }}
              >
                Build Queue ({queued.length})
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {queued.map((idea, idx) => (
                  <div
                    key={idea.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 12px",
                      border: "1px solid #1f1f1f",
                      borderRadius: 4,
                      background: "#0a0a0a",
                    }}
                  >
                    <span style={{ fontSize: 10, color: "#444", minWidth: 20 }}>
                      #{idx + 1}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "#6366f1",
                        minWidth: 36,
                        textAlign: "right",
                      }}
                    >
                      {idea.validated_score?.toFixed(1) ?? "—"}
                    </span>
                    <span style={{ fontSize: 11, color: "#ccc", flex: 1 }}>{idea.title}</span>
                    <span style={{ fontSize: 10, color: "#444" }}>
                      {timeAgo(idea.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {building.length === 0 && live.length === 0 && queued.length === 0 && (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                border: "1px dashed #222",
                borderRadius: 4,
              }}
            >
              <p style={{ color: "#555", fontSize: 12, lineHeight: 1.8 }}>
                Coder agent builds businesses from validated ideas automatically
              </p>
              <p style={{ color: "#333", fontSize: 11, marginTop: 8 }}>
                No active builds · Submit ideas to the pipeline to get started
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
