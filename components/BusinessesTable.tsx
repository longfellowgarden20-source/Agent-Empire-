"use client";

export type Business = {
  id: string;
  name: string;
  score: number;
  revenue7d: number;
  trend: "up" | "flat" | "down";
  status: "active" | "review" | "shutdown" | "building";
};

type Props = {
  businesses: Business[];
};

export default function BusinessesTable({ businesses }: Props) {
  return (
    <div
      className="flex flex-col rounded-sm"
      style={{ background: "#111111", border: "1px solid #1f1f1f" }}
    >
      <div
        className="px-4 py-3 text-xs uppercase tracking-wider border-b"
        style={{
          color: "#555555",
          borderColor: "#1f1f1f",
          fontFamily: "var(--font-geist-mono)",
        }}
      >
        Businesses
      </div>

      <div className="divide-y" style={{ borderColor: "#1f1f1f" }}>
        {businesses.map((b) => (
          <BusinessRow key={b.id} business={b} />
        ))}
      </div>
    </div>
  );
}

function BusinessRow({ business: b }: { business: Business }) {
  const trendSymbol = b.trend === "up" ? "▲" : b.trend === "down" ? "▼" : "→";
  const trendColor =
    b.trend === "up" ? "#22c55e" : b.trend === "down" ? "#ef4444" : "#555555";
  const scoreColor =
    b.score >= 80 ? "#22c55e" : b.score >= 40 ? "#f5f5f5" : "#ef4444";

  return (
    <div className="px-4 py-3 flex items-center gap-4">
      <span className="flex-1 text-sm" style={{ color: "#f5f5f5" }}>
        {b.name}
      </span>

      <span
        className="text-sm tabular-nums w-8 text-right"
        style={{ color: scoreColor, fontFamily: "var(--font-geist-mono)" }}
      >
        {b.score}
      </span>

      <span
        className="text-xs tabular-nums w-14 text-right"
        style={{ color: "#555555", fontFamily: "var(--font-geist-mono)" }}
      >
        ${(b.revenue7d / 1000).toFixed(1)}k
      </span>

      <span
        className="text-xs w-4 text-center"
        style={{ color: trendColor, fontFamily: "var(--font-geist-mono)" }}
      >
        {trendSymbol}
      </span>

      {b.status !== "active" && <StatusBadge status={b.status} />}
    </div>
  );
}

function StatusBadge({ status }: { status: Business["status"] }) {
  const color =
    status === "review"
      ? "#f59e0b"
      : status === "shutdown"
      ? "#ef4444"
      : "#555555";

  return (
    <span
      className="text-xs px-2 py-0.5 rounded-sm uppercase tracking-wider"
      style={{
        color,
        border: `1px solid ${color}`,
        fontFamily: "var(--font-geist-mono)",
        opacity: 0.8,
      }}
    >
      {status}
    </span>
  );
}
