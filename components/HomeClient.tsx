"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import WarRoom from "@/components/WarRoom";
import { AttentionItem } from "@/components/AttentionPanel";
import { Business } from "@/components/BusinessesGrid";
import { World } from "@/components/WorldsPanel";
import { FeedEvent } from "@/components/LiveFeed";

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export default function HomeClient() {
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [worlds, setWorlds] = useState<World[]>([]);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [revenueChange, setRevenueChange] = useState(0);
  const [agentsRunning, setAgentsRunning] = useState(0);
  const [agentsTotal] = useState(47);

  async function fetchAll() {
    const [bizRes, attentionRes, feedRes] = await Promise.all([
      supabase.from("businesses").select("*").order("war_room_score", { ascending: false }),
      supabase.from("chairman_queue").select("*").eq("sent_in_brief", false).eq("requires_action", true).order("priority", { ascending: false }).limit(3),
      supabase.from("agent_runs").select("*").order("created_at", { ascending: false }).limit(10),
    ]);

    // businesses
    const bizData = bizRes.data || [];
    const biz: Business[] = bizData.map((b) => ({
      id: b.id,
      name: b.name,
      score: b.war_room_score ?? 0,
      revenue7d: b.revenue_7d ?? 0,
      trend: b.revenue_7d > b.revenue_prev_7d ? "up" : b.revenue_7d < b.revenue_prev_7d ? "down" : "flat",
      status: b.status ?? "active",
    }));
    setBusinesses(biz);

    // worlds from businesses
    const w: World[] = bizData.map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status ?? "active",
    }));
    setWorlds(w);

    // revenue
    const total = bizData.reduce((sum, b) => sum + (b.revenue_7d ?? 0) / 7, 0);
    const prevTotal = bizData.reduce((sum, b) => sum + (b.revenue_prev_7d ?? 0) / 7, 0);
    setRevenue(Math.round(total));
    setRevenueChange(prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0);

    // attention items
    const att: AttentionItem[] = (attentionRes.data || []).map((a) => ({
      id: a.id,
      message: a.message,
      detail: "",
      primaryLabel: "DISMISS",
      secondaryLabel: "REVIEW",
      onPrimary: async () => {
        await supabase.from("chairman_queue").update({ sent_in_brief: true }).eq("id", a.id);
        fetchAll();
      },
      onSecondary: () => {},
    }));
    setAttention(att);

    // live feed from agent_runs
    const feedData: FeedEvent[] = (feedRes.data || []).map((r) => ({
      id: r.id,
      time: new Date(r.created_at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/New_York",
      }),
      agent: r.agent.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
      message: r.summary || r.status,
    }));
    setFeed(feedData);

    // agents running = successful runs in last hour
    const recentSuccess = (feedRes.data || []).filter((r) => {
      const age = Date.now() - new Date(r.created_at).getTime();
      return r.status === "success" && age < 60 * 60 * 1000;
    });
    setAgentsRunning(Math.min(recentSuccess.length, agentsTotal));
  }

  useEffect(() => {
    fetchAll();

    // realtime subscriptions
    const bizSub = supabase
      .channel("businesses-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "businesses" }, () => fetchAll())
      .subscribe();

    const queueSub = supabase
      .channel("queue-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chairman_queue" }, () => fetchAll())
      .subscribe();

    const runsSub = supabase
      .channel("runs-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_runs" }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(bizSub);
      supabase.removeChannel(queueSub);
      supabase.removeChannel(runsSub);
    };
  }, []);

  return (
    <WarRoom
      attention={attention}
      businesses={businesses}
      worlds={worlds}
      feed={feed}
      revenue={revenue}
      revenueChange={revenueChange}
      agentsRunning={agentsRunning}
      agentsTotal={agentsTotal}
    />
  );
}
