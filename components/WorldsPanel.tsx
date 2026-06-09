"use client";

export type World = {
  id: string;
  name: string;
  status: "active" | "review" | "building" | "shutdown";
};

type Props = {
  worlds: World[];
};

export default function WorldsPanel({ worlds }: Props) {
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
        Worlds
      </div>

      <div className="flex flex-col gap-0 divide-y" style={{ borderColor: "#1f1f1f" }}>
        {worlds.map((w) => (
          <WorldRow key={w.id} world={w} />
        ))}
      </div>
    </div>
  );
}

function WorldRow({ world: w }: { world: World }) {
  const dotColor =
    w.status === "active"
      ? "#22c55e"
      : w.status === "review"
      ? "#f59e0b"
      : w.status === "building"
      ? "#555555"
      : "#ef4444";

  const label =
    w.status === "review"
      ? "REVIEW"
      : w.status === "building"
      ? "BUILDING"
      : w.status === "shutdown"
      ? "OFFLINE"
      : null;

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <span style={{ color: dotColor, fontSize: 10 }}>●</span>
      <span className="flex-1 text-sm" style={{ color: "#f5f5f5" }}>
        {w.name}
      </span>
      {label !== null && (
        <span
          className="text-xs"
          style={{ color: dotColor, fontFamily: "var(--font-geist-mono)" }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
