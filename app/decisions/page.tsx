"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Order = {
  id: string;
  to_agent: string;
  task_type: string;
  payload: Record<string, unknown> | null;
  status: string;
  created_at: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "#f59e0b",
  running: "#3b82f6",
  completed: "#22c55e",
  failed: "#ef4444",
};

export default function DecisionsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderText, setOrderText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function fetchOrders() {
    const { data } = await supabase
      .from("task_queue")
      .select("*")
      .eq("from_agent", "chairman")
      .order("created_at", { ascending: false })
      .limit(100);
    setOrders(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchOrders();
    const sub = supabase
      .channel("decisions-ch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_queue" },
        fetchOrders
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  async function issueOrder() {
    if (!orderText.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase.from("task_queue").insert({
      from_agent: "chairman",
      to_agent: "war_room",
      task_type: "chairman_order",
      payload: { order: orderText.trim() },
      priority: 10,
      status: "pending",
    });
    if (error) {
      setSubmitError(error.message);
    } else {
      setOrderText("");
      await fetchOrders();
    }
    setSubmitting(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      issueOrder();
    }
  }

  const pending = orders.filter((o) => o.status === "pending").length;
  const completed = orders.filter((o) => o.status === "completed").length;

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
      <div>
        <h1 style={{ color: "#f5f5f5", fontSize: 15, fontWeight: 600, letterSpacing: 1 }}>
          COMMAND CENTER
        </h1>
        <p style={{ color: "#555", fontSize: 11, marginTop: 4 }}>
          Issue direct orders to the War Room
        </p>
      </div>

      <div
        style={{
          border: "1px solid #6366f130",
          borderRadius: 4,
          padding: 20,
          background: "#0a0a10",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <label
          style={{
            fontSize: 9,
            color: "#6366f1",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          Issue Order
        </label>
        <textarea
          value={orderText}
          onChange={(e) => setOrderText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Scale up the content agents. Increase publishing frequency to 3x per day..."
          rows={4}
          style={{
            background: "#050508",
            border: "1px solid #1f1f1f",
            borderRadius: 3,
            color: "#f5f5f5",
            fontSize: 12,
            padding: "10px 12px",
            fontFamily: "var(--font-geist-mono)",
            resize: "vertical",
            outline: "none",
            lineHeight: 1.6,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={issueOrder}
            disabled={submitting || !orderText.trim()}
            style={{
              padding: "8px 20px",
              background: submitting || !orderText.trim() ? "#111" : "#6366f1",
              color: submitting || !orderText.trim() ? "#444" : "#fff",
              border: `1px solid ${submitting || !orderText.trim() ? "#222" : "#6366f1"}`,
              borderRadius: 3,
              cursor: submitting || !orderText.trim() ? "not-allowed" : "pointer",
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              fontFamily: "var(--font-geist-mono)",
              fontWeight: 600,
            }}
          >
            {submitting ? "ISSUING..." : "ISSUE ORDER"}
          </button>
          <span style={{ fontSize: 10, color: "#333" }}>⌘+Enter to submit</span>
          {submitError && (
            <span style={{ fontSize: 10, color: "#ef4444" }}>{submitError}</span>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
        }}
      >
        {[
          { label: "Total Orders", value: orders.length, color: "#f5f5f5" },
          { label: "Pending", value: pending, color: "#f59e0b" },
          { label: "Completed", value: completed, color: "#22c55e" },
        ].map((stat) => (
          <div
            key={stat.label}
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
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: stat.color,
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {stat.value}
            </span>
            <span
              style={{
                fontSize: 9,
                color: "#555",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {stat.label}
            </span>
          </div>
        ))}
      </div>

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
          Decision Log
        </h2>
        {loading ? (
          <p style={{ fontSize: 11, color: "#555" }}>Loading...</p>
        ) : orders.length === 0 ? (
          <p style={{ fontSize: 11, color: "#444", padding: "20px 0" }}>
            No orders issued yet
          </p>
        ) : (
          orders.map((order) => {
            const orderText = (order.payload?.order as string) ?? "(no text)";
            const outcome = (order.payload?.outcome as string) ?? null;
            const statusColor = STATUS_COLOR[order.status] ?? "#555";

            return (
              <div
                key={order.id}
                style={{
                  border: "1px solid #1a1a1a",
                  borderRadius: 4,
                  padding: "14px 16px",
                  background: "#0a0a0a",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      color: "#e5e5e5",
                      lineHeight: 1.5,
                      flex: 1,
                    }}
                  >
                    {orderText}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: 8,
                        padding: "2px 8px",
                        borderRadius: 2,
                        background: statusColor + "20",
                        color: statusColor,
                        border: `1px solid ${statusColor}30`,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        fontWeight: 700,
                      }}
                    >
                      {order.status}
                    </span>
                    <span style={{ fontSize: 9, color: "#444" }}>
                      {timeAgo(order.created_at)}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: 1 }}>
                      To:
                    </span>
                    <span style={{ fontSize: 9, color: "#6366f1" }}>
                      {order.to_agent}
                    </span>
                  </div>
                  {outcome ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: 1 }}>
                        Outcome:
                      </span>
                      <span style={{ fontSize: 9, color: "#aaa" }}>
                        {outcome}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ fontSize: 9, color: "#333" }}>
                        Pending response
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
