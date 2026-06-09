"use client";

type BannerProps = {
  revenue: number;
  revenueChange: number;
  agentsRunning: number;
  agentsTotal: number;
  attentionCount: number;
};

export default function Banner({
  revenue,
  revenueChange,
  agentsRunning,
  agentsTotal,
  attentionCount,
}: BannerProps) {
  const up = revenueChange >= 0;

  return (
    <div
      className="flex items-center gap-10 px-6 py-4 border-b shrink-0"
      style={{ borderColor: "#1f1f1f", background: "#0a0a0a" }}
    >
      <div className="flex items-baseline gap-3">
        <span
          className="text-3xl font-semibold tabular-nums"
          style={{ fontFamily: "var(--font-geist-mono)", color: "#f5f5f5" }}
        >
          ${revenue.toLocaleString()}
        </span>
        <span
          className="text-sm tabular-nums"
          style={{ color: up ? "#22c55e" : "#ef4444", fontFamily: "var(--font-geist-mono)" }}
        >
          {up ? "▲" : "▼"} {Math.abs(revenueChange)}%
        </span>
        <span className="text-xs" style={{ color: "#555555" }}>
          today
        </span>
      </div>

      <Divider />

      <div className="flex items-baseline gap-2">
        <span
          className="text-sm tabular-nums"
          style={{ fontFamily: "var(--font-geist-mono)", color: "#f5f5f5" }}
        >
          {agentsRunning}
          <span style={{ color: "#555555" }}>/{agentsTotal}</span>
        </span>
        <span className="text-xs" style={{ color: "#555555" }}>
          agents running
        </span>
      </div>

      <Divider />

      <div className="flex items-baseline gap-2">
        <span
          className="text-sm tabular-nums"
          style={{
            fontFamily: "var(--font-geist-mono)",
            color: attentionCount > 0 ? "#f59e0b" : "#22c55e",
          }}
        >
          {attentionCount}
        </span>
        <span className="text-xs" style={{ color: "#555555" }}>
          {attentionCount === 1 ? "needs attention" : "need attention"}
        </span>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div
      className="h-4 w-px shrink-0"
      style={{ background: "#1f1f1f" }}
    />
  );
}
