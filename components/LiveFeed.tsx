"use client";

export type FeedEvent = {
  id: string;
  time: string;
  agent: string;
  message: string;
};

type Props = {
  events: FeedEvent[];
};

export default function LiveFeed({ events }: Props) {
  return (
    <div
      className="flex flex-col rounded-sm"
      style={{ background: "#111111", border: "1px solid #1f1f1f" }}
    >
      <div
        className="px-4 py-3 text-xs uppercase tracking-wider border-b flex items-center gap-2"
        style={{
          color: "#555555",
          borderColor: "#1f1f1f",
          fontFamily: "var(--font-geist-mono)",
        }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "#22c55e" }}
        />
        Live
      </div>

      <div className="flex flex-col divide-y overflow-auto" style={{ borderColor: "#1f1f1f", maxHeight: 280 }}>
        {events.length === 0 ? (
          <div className="px-4 py-6 text-xs" style={{ color: "#555555" }}>
            No recent activity.
          </div>
        ) : (
          events.map((e) => <FeedRow key={e.id} event={e} />)
        )}
      </div>
    </div>
  );
}

function FeedRow({ event: e }: { event: FeedEvent }) {
  return (
    <div className="px-4 py-2.5 flex items-baseline gap-3">
      <span
        className="text-xs tabular-nums shrink-0"
        style={{ color: "#333333", fontFamily: "var(--font-geist-mono)" }}
      >
        {e.time}
      </span>
      <span
        className="text-xs shrink-0"
        style={{ color: "#6366f1", fontFamily: "var(--font-geist-mono)" }}
      >
        {e.agent}
      </span>
      <span className="text-xs" style={{ color: "#555555" }}>
        {e.message}
      </span>
    </div>
  );
}
