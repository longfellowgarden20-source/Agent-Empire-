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

export default function BusinessesGrid({ businesses }: Props) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
      {businesses.map((b) => (
        <BusinessTile key={b.id} business={b} />
      ))}
    </div>
  );
}

function BusinessTile({ business: b }: { business: Business }) {
  const trendSymbol = b.trend === "up" ? "▲" : b.trend === "down" ? "▼" : "→";
  const trendColor = b.trend === "up" ? "#22c55e" : b.trend === "down" ? "#ef4444" : "#555555";
  const scoreColor = b.score >= 80 ? "#22c55e" : b.score >= 40 ? "#f5f5f5" : "#ef4444";

  const statusColor =
    b.status === "active" ? "#22c55e"
    : b.status === "review" ? "#f59e0b"
    : b.status === "building" ? "#555555"
    : "#ef4444";

  const dotColor =
    b.status === "active" ? "#22c55e"
    : b.status === "review" ? "#f59e0b"
    : "#333333";

  return (
    <div
      className="flex flex-col gap-4 p-4 rounded-sm cursor-pointer transition-colors"
      style={{
        background: "#111111",
        border: "1px solid #1f1f1f",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#2a2a2a";
        (e.currentTarget as HTMLDivElement).style.background = "#161616";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#1f1f1f";
        (e.currentTarget as HTMLDivElement).style.background = "#111111";
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight" style={{ color: "#f5f5f5" }}>
          {b.name}
        </span>
        <span style={{ color: dotColor, fontSize: 8, marginTop: 4, flexShrink: 0 }}>●</span>
      </div>

      {/* Score */}
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs" style={{ color: "#555555" }}>score</span>
          <span
            className="text-2xl font-semibold tabular-nums"
            style={{ color: scoreColor, fontFamily: "var(--font-geist-mono)", lineHeight: 1 }}
          >
            {b.score > 0 ? b.score : "—"}
          </span>
        </div>

        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs" style={{ color: "#555555" }}>7d rev</span>
          <span
            className="text-sm tabular-nums"
            style={{ color: "#f5f5f5", fontFamily: "var(--font-geist-mono)" }}
          >
            {b.revenue7d > 0 ? `$${(b.revenue7d / 1000).toFixed(1)}k` : "—"}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs uppercase tracking-wider"
          style={{ color: statusColor, fontFamily: "var(--font-geist-mono)" }}
        >
          {b.status}
        </span>
        <span
          className="text-sm"
          style={{ color: trendColor, fontFamily: "var(--font-geist-mono)" }}
        >
          {trendSymbol}
        </span>
      </div>
    </div>
  );
}
