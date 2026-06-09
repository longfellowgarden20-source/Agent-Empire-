"use client";

export type AttentionItem = {
  id: string;
  message: string;
  detail: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
};

type Props = {
  items: AttentionItem[];
};

export default function AttentionPanel({ items }: Props) {
  return (
    <div
      className="flex flex-col rounded-sm"
      style={{ background: "#111111", border: "1px solid #1f1f1f" }}
    >
      <div
        className="px-4 py-3 text-xs uppercase tracking-wider border-b"
        style={{
          color: "#f59e0b",
          borderColor: "#1f1f1f",
          fontFamily: "var(--font-geist-mono)",
        }}
      >
        ⚠ Attention
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-xs" style={{ color: "#555555" }}>
          All clear — nothing needs your input.
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "#1f1f1f" }}>
          {items.map((item) => (
            <AttentionRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm" style={{ color: "#f5f5f5" }}>
          {item.message}
        </p>
        <p className="text-xs" style={{ color: "#555555" }}>
          {item.detail}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={item.onPrimary}
          className="px-3 py-1 text-xs rounded-sm transition-colors"
          style={{
            background: "#6366f1",
            color: "#f5f5f5",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {item.primaryLabel}
        </button>
        <button
          onClick={item.onSecondary}
          className="px-3 py-1 text-xs rounded-sm transition-colors"
          style={{
            background: "transparent",
            color: "#555555",
            border: "1px solid #1f1f1f",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {item.secondaryLabel}
        </button>
      </div>
    </div>
  );
}
