"use client";

import Banner from "@/components/Banner";
import AttentionPanel, { AttentionItem } from "@/components/AttentionPanel";
import BusinessesGrid from "@/components/BusinessesGrid";
import { Business } from "@/components/BusinessesGrid";
import WorldsPanel, { World } from "@/components/WorldsPanel";
import LiveFeed, { FeedEvent } from "@/components/LiveFeed";

type Props = {
  attention: AttentionItem[];
  businesses: Business[];
  worlds: World[];
  feed: FeedEvent[];
  revenue: number;
  revenueChange: number;
  agentsRunning: number;
  agentsTotal: number;
};

export default function WarRoom({
  attention,
  businesses,
  worlds,
  feed,
  revenue,
  revenueChange,
  agentsRunning,
  agentsTotal,
}: Props) {
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 48px)" }}>
      <Banner
        revenue={revenue}
        revenueChange={revenueChange}
        agentsRunning={agentsRunning}
        agentsTotal={agentsTotal}
        attentionCount={attention.length}
      />

      <div className="flex-1 flex flex-col gap-3 p-4 overflow-auto">
        {/* Top row — attention left, live feed + worlds right */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 300px" }}>
          <AttentionPanel items={attention} />

          <div className="flex flex-col gap-3">
            <LiveFeed events={feed} />
            <WorldsPanel worlds={worlds} />
          </div>
        </div>

        {/* Bottom — business tiles full width */}
        <div>
          <div
            className="text-xs uppercase tracking-wider mb-3"
            style={{ color: "#555555", fontFamily: "var(--font-geist-mono)" }}
          >
            Businesses
          </div>
          <BusinessesGrid businesses={businesses} />
        </div>
      </div>
    </div>
  );
}
