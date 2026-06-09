"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { supabase } from "@/lib/supabase";

interface AgentNode {
  id: string;
  name: string;
  tier: number;
  status: "success" | "failed" | "skipped" | "idle" | "running";
  lastRun?: string;
  summary?: string;
}

interface AgentLink {
  source: string;
  target: string;
  active: boolean;
}

const AGENTS: AgentNode[] = [
  // Tier 1
  { id: "chairman", name: "Chairman", tier: 1, status: "idle" },
  { id: "war_room_judge", name: "War Room Judge", tier: 1, status: "idle" },
  { id: "architect", name: "Architect", tier: 1, status: "idle" },
  { id: "oracle", name: "Oracle", tier: 1, status: "idle" },
  { id: "capital_allocator", name: "Capital Allocator", tier: 1, status: "idle" },
  // Tier 2
  { id: "idea_hunter", name: "Idea Hunter", tier: 2, status: "idle" },
  { id: "market_validator", name: "Market Validator", tier: 2, status: "idle" },
  { id: "coder", name: "Coder", tier: 2, status: "idle" },
  { id: "tester", name: "Tester", tier: 2, status: "idle" },
  { id: "deployer", name: "Deployer", tier: 2, status: "idle" },
  { id: "skill_builder", name: "Skill Builder", tier: 2, status: "idle" },
  // Tier 3
  { id: "prospector", name: "Prospector", tier: 3, status: "idle" },
  { id: "researcher", name: "Researcher", tier: 3, status: "idle" },
  { id: "copywriter", name: "Copywriter", tier: 3, status: "idle" },
  { id: "outreach_agent", name: "Outreach", tier: 3, status: "idle" },
  { id: "deal_closer", name: "Deal Closer", tier: 3, status: "idle" },
  { id: "upsell_agent", name: "Upsell", tier: 3, status: "idle" },
  { id: "retention_agent", name: "Retention", tier: 3, status: "idle" },
  // Tier 4
  { id: "crypto_watcher", name: "Crypto", tier: 4, status: "idle" },
  { id: "trend_surfer", name: "Trend Surfer", tier: 4, status: "idle" },
  { id: "competitor_tracker", name: "Competitor", tier: 4, status: "idle" },
  { id: "macro_watcher", name: "Macro", tier: 4, status: "idle" },
  { id: "real_estate_scout", name: "Real Estate", tier: 4, status: "idle" },
  // Tier 5
  { id: "content_strategist", name: "Strategist", tier: 5, status: "idle" },
  { id: "writer", name: "Writer", tier: 5, status: "idle" },
  { id: "social_agent", name: "Social", tier: 5, status: "idle" },
  { id: "video_scripter", name: "Video", tier: 5, status: "idle" },
  { id: "seo_agent", name: "SEO", tier: 5, status: "idle" },
  { id: "email_marketer", name: "Email", tier: 5, status: "idle" },
  // Tier 6
  { id: "product_scout", name: "Product Scout", tier: 6, status: "idle" },
  { id: "listing_agent", name: "Listing", tier: 6, status: "idle" },
  { id: "pricing_agent", name: "Pricing", tier: 6, status: "idle" },
  { id: "ad_agent", name: "Ads", tier: 6, status: "idle" },
  { id: "inventory_agent", name: "Inventory", tier: 6, status: "idle" },
  { id: "support_agent", name: "Support", tier: 6, status: "idle" },
  // Tier 7
  { id: "web_crawler", name: "Web Crawler", tier: 7, status: "idle" },
  { id: "news_aggregator", name: "News", tier: 7, status: "idle" },
  { id: "data_scientist", name: "Data Sci", tier: 7, status: "idle" },
  { id: "memory_keeper", name: "Memory", tier: 7, status: "idle" },
  // Tier 8
  { id: "systems_monitor", name: "Monitor", tier: 8, status: "idle" },
  { id: "quality_inspector", name: "QA", tier: 8, status: "idle" },
  { id: "finance_tracker", name: "Finance", tier: 8, status: "idle" },
  { id: "compliance_agent", name: "Compliance", tier: 8, status: "idle" },
  { id: "security_agent", name: "Security", tier: 8, status: "idle" },
  // Tier 9
  { id: "prompt_engineer", name: "Prompt Eng", tier: 9, status: "idle" },
  { id: "evolution_agent", name: "Evolution", tier: 9, status: "idle" },
];

const LINKS: AgentLink[] = [
  { source: "oracle", target: "chairman", active: false },
  { source: "oracle", target: "trend_surfer", active: false },
  { source: "oracle", target: "capital_allocator", active: false },
  { source: "idea_hunter", target: "market_validator", active: false },
  { source: "market_validator", target: "architect", active: false },
  { source: "architect", target: "coder", active: false },
  { source: "coder", target: "tester", active: false },
  { source: "tester", target: "deployer", active: false },
  { source: "prospector", target: "researcher", active: false },
  { source: "researcher", target: "copywriter", active: false },
  { source: "copywriter", target: "outreach_agent", active: false },
  { source: "outreach_agent", target: "deal_closer", active: false },
  { source: "trend_surfer", target: "content_strategist", active: false },
  { source: "content_strategist", target: "writer", active: false },
  { source: "writer", target: "social_agent", active: false },
  { source: "writer", target: "email_marketer", active: false },
  { source: "product_scout", target: "listing_agent", active: false },
  { source: "listing_agent", target: "ad_agent", active: false },
  { source: "news_aggregator", target: "oracle", active: false },
  { source: "systems_monitor", target: "chairman", active: false },
  { source: "quality_inspector", target: "skill_builder", active: false },
  { source: "skill_builder", target: "prompt_engineer", active: false },
  { source: "prompt_engineer", target: "evolution_agent", active: false },
];

const TIER_COLORS: Record<number, string> = {
  1: "#a855f7", // purple — gods
  2: "#3b82f6", // blue — builders
  3: "#10b981", // green — revenue
  4: "#f59e0b", // amber — market
  5: "#ec4899", // pink — content
  6: "#06b6d4", // cyan — ecommerce
  7: "#8b5cf6", // violet — intelligence
  8: "#ef4444", // red — watchdogs
  9: "#f97316", // orange — meta
};

const TIER_LABELS: Record<number, string> = {
  1: "GODS",
  2: "BUILDERS",
  3: "REVENUE",
  4: "MARKET",
  5: "CONTENT",
  6: "ECOMMERCE",
  7: "INTELLIGENCE",
  8: "WATCHDOGS",
  9: "META",
};

export default function AgentNetwork() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<AgentNode[]>(AGENTS);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; agent: AgentNode } | null>(null);
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null);

  // fetch latest agent_runs and update node statuses
  async function fetchStatuses() {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // last 2 hours
    const { data } = await supabase
      .from("agent_runs")
      .select("agent, status, summary, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (!data) return;

    // latest run per agent
    const latest: Record<string, any> = {};
    for (const row of data) {
      if (!latest[row.agent]) latest[row.agent] = row;
    }

    setNodes((prev) =>
      prev.map((n) => {
        const run = latest[n.id];
        if (!run) return { ...n, status: "idle" };
        return {
          ...n,
          status: run.status as AgentNode["status"],
          lastRun: run.created_at,
          summary: run.summary,
        };
      })
    );
  }

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 15000);

    const sub = supabase
      .channel("agent-network")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_runs" }, fetchStatuses)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(sub);
    };
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const container = svgRef.current.parentElement!;
    const W = container.clientWidth || 900;
    const H = container.clientHeight || 600;

    const svg = d3.select(svgRef.current)
      .attr("width", W)
      .attr("height", H);

    svg.selectAll("*").remove();

    // defs — glow filters
    const defs = svg.append("defs");
    Object.entries(TIER_COLORS).forEach(([tier, color]) => {
      const filter = defs.append("filter").attr("id", `glow-${tier}`);
      filter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
      const merge = filter.append("feMerge");
      merge.append("feMergeNode").attr("in", "blur");
      merge.append("feMergeNode").attr("in", "SourceGraphic");
    });

    const g = svg.append("g");

    // zoom + pan
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 2])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    // build simulation nodes with tier-based initial positions
    const tierCount = 9;
    const simNodes = nodes.map((n) => ({
      ...n,
      x: (n.tier / (tierCount + 1)) * W,
      y: H / 2 + (Math.random() - 0.5) * 200,
    }));

    const nodeById = Object.fromEntries(simNodes.map((n) => [n.id, n]));

    const simLinks = LINKS.map((l) => ({
      source: nodeById[l.source],
      target: nodeById[l.target],
      active: l.active,
    })).filter((l) => l.source && l.target);

    // force simulation
    const simulation = d3.forceSimulation(simNodes)
      .force("link", d3.forceLink(simLinks).distance(80).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("x", d3.forceX<any>((d) => (d.tier / (tierCount + 1)) * W).strength(0.8))
      .force("y", d3.forceY(H / 2).strength(0.1))
      .force("collision", d3.forceCollide(30));

    simulationRef.current = simulation;

    // tier label bands
    for (let t = 1; t <= 9; t++) {
      const x = (t / (tierCount + 1)) * W;
      g.append("text")
        .attr("x", x)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .attr("fill", TIER_COLORS[t])
        .attr("font-size", "9px")
        .attr("font-family", "monospace")
        .attr("opacity", 0.5)
        .attr("letter-spacing", "2px")
        .text(TIER_LABELS[t]);
    }

    // links
    const link = g.append("g")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", "#ffffff10")
      .attr("stroke-width", 1);

    // node groups
    const node = g.append("g")
      .selectAll("g")
      .data(simNodes)
      .join("g")
      .style("cursor", "pointer")
      .call(
        d3.drag<any, any>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      );

    // outer pulse ring for active nodes
    node.append("circle")
      .attr("r", 16)
      .attr("fill", "none")
      .attr("stroke", (d) => TIER_COLORS[d.tier])
      .attr("stroke-width", 1)
      .attr("opacity", (d) => d.status === "success" ? 0.4 : 0)
      .attr("class", "pulse-ring");

    // main circle
    node.append("circle")
      .attr("r", 10)
      .attr("fill", (d) => {
        if (d.status === "success") return TIER_COLORS[d.tier];
        if (d.status === "failed") return "#ef4444";
        if (d.status === "skipped") return "#6b7280";
        return "#1a1a2e";
      })
      .attr("stroke", (d) => TIER_COLORS[d.tier])
      .attr("stroke-width", (d) => d.status === "success" ? 2 : 1)
      .attr("opacity", (d) => d.status === "idle" ? 0.4 : 1)
      .attr("filter", (d) => d.status === "success" ? `url(#glow-${d.tier})` : "none");

    // label
    node.append("text")
      .attr("dy", 22)
      .attr("text-anchor", "middle")
      .attr("fill", (d) => d.status === "idle" ? "#ffffff30" : "#ffffff90")
      .attr("font-size", "8px")
      .attr("font-family", "monospace")
      .text((d) => d.name);

    // tooltip on hover
    node
      .on("mouseenter", (event, d) => {
        setTooltip({ x: event.clientX, y: event.clientY, agent: d });
      })
      .on("mouseleave", () => setTooltip(null));

    // tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // pulse animation via setInterval
    let pulseScale = 1;
    let pulseDir = 1;
    const pulseInterval = setInterval(() => {
      pulseScale += pulseDir * 0.05;
      if (pulseScale > 1.4) pulseDir = -1;
      if (pulseScale < 1) pulseDir = 1;
      svg.selectAll(".pulse-ring").attr("r", 10 * pulseScale);
    }, 50);

    return () => {
      simulation.stop();
      clearInterval(pulseInterval);
    };
  }, [nodes]);

  const statusColor: Record<string, string> = {
    success: "#10b981",
    failed: "#ef4444",
    skipped: "#6b7280",
    idle: "#374151",
    running: "#f59e0b",
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#050510" }}>
      {/* legend */}
      <div style={{
        position: "absolute", top: 12, right: 12, zIndex: 10,
        display: "flex", flexDirection: "column", gap: 4,
        fontFamily: "monospace", fontSize: 10,
      }}>
        {[["success", "#10b981", "ACTIVE"], ["skipped", "#6b7280", "SKIPPED"], ["failed", "#ef4444", "FAILED"], ["idle", "#374151", "IDLE"]].map(([s, c, l]) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
            <span style={{ color: "#ffffff50" }}>{l}</span>
          </div>
        ))}
      </div>

      {/* stats bar */}
      <div style={{
        position: "absolute", top: 12, left: 12, zIndex: 10,
        fontFamily: "monospace", fontSize: 10, color: "#ffffff40",
      }}>
        <span style={{ color: "#a855f7", marginRight: 12 }}>◈ AGENT NETWORK</span>
        <span style={{ marginRight: 8 }}>{nodes.filter(n => n.status === "success").length} ACTIVE</span>
        <span>{nodes.filter(n => n.status === "failed").length} FAILED</span>
      </div>

      <svg ref={svgRef} style={{ width: "100%", height: "100%" }} />

      {/* tooltip */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x + 12,
          top: tooltip.y - 10,
          background: "#0d0d1a",
          border: `1px solid ${TIER_COLORS[tooltip.agent.tier]}40`,
          borderRadius: 4,
          padding: "8px 12px",
          fontFamily: "monospace",
          fontSize: 11,
          zIndex: 100,
          maxWidth: 240,
          pointerEvents: "none",
        }}>
          <div style={{ color: TIER_COLORS[tooltip.agent.tier], marginBottom: 4, fontWeight: "bold" }}>
            {tooltip.agent.name}
          </div>
          <div style={{ color: statusColor[tooltip.agent.status], marginBottom: 4 }}>
            ● {tooltip.agent.status.toUpperCase()}
          </div>
          {tooltip.agent.summary && (
            <div style={{ color: "#ffffff60", fontSize: 10, lineHeight: 1.4 }}>
              {tooltip.agent.summary}
            </div>
          )}
          {tooltip.agent.lastRun && (
            <div style={{ color: "#ffffff30", fontSize: 9, marginTop: 4 }}>
              {new Date(tooltip.agent.lastRun).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" })} ET
            </div>
          )}
        </div>
      )}
    </div>
  );
}
