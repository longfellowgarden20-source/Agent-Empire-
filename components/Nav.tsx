"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const groups = [
  {
    label: "Command",
    links: [
      { href: "/", label: "Home" },
      { href: "/brief", label: "Brief" },
      { href: "/decisions", label: "Decisions" },
    ],
  },
  {
    label: "Empire",
    links: [
      { href: "/companies", label: "Companies" },
      { href: "/revenue", label: "Revenue" },
      { href: "/builds", label: "Builds" },
    ],
  },
  {
    label: "Intelligence",
    links: [
      { href: "/oracle", label: "Intel" },
      { href: "/trends", label: "Trends" },
      { href: "/competitors", label: "Competitors" },
    ],
  },
  {
    label: "Sales",
    links: [
      { href: "/prospects", label: "Prospects" },
      { href: "/outreach", label: "Outreach" },
      { href: "/deals", label: "Deals" },
    ],
  },
  {
    label: "Content",
    links: [
      { href: "/content", label: "Content" },
      { href: "/social", label: "Social" },
      { href: "/ideas", label: "Ideas" },
    ],
  },
  {
    label: "Ops",
    links: [
      { href: "/agents", label: "Agents" },
      { href: "/tasks", label: "Tasks" },
      { href: "/logs", label: "Logs" },
      { href: "/health", label: "Health" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

export default function Nav() {
  const pathname = usePathname();
  const [paused, setPaused] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);

  React.useEffect(() => {
    supabase.from("agent_memory").select("value").eq("agent", "system").eq("key", "paused").single()
      .then(({ data }) => { if (data) setPaused(data.value === true); });
  }, []);

  async function togglePause() {
    setToggling(true);
    const next = !paused;
    await supabase.from("agent_memory").upsert({ agent: "system", key: "paused", value: next }, { onConflict: "agent,key" });
    setPaused(next);
    setToggling(false);
  }

  return (
    <nav
      style={{
        display: "flex", alignItems: "center", gap: 16, paddingLeft: 16, paddingRight: 16,
        borderBottom: "1px solid #1f1f1f", background: "#0a0a0a", height: 48,
        flexShrink: 0, minWidth: 0, overflowX: "auto", overflowY: "hidden",
      }}
    >
      <span
        style={{ color: "#6366f1", fontFamily: "var(--font-geist-mono)", fontSize: 13, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", flexShrink: 0 }}
      >
        ◈ WAR ROOM
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 0, flex: 1, overflowX: "auto" }}>
        {groups.map((group, gi) => (
          <div key={group.label} style={{ display: "flex", alignItems: "center" }}>
            {gi > 0 && (
              <span style={{ color: "#222", padding: "0 6px", fontSize: 10, userSelect: "none" }}>│</span>
            )}
            {group.links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    padding: "4px 8px",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontFamily: "var(--font-geist-mono)",
                    color: active ? "#f5f5f5" : "#444",
                    borderBottom: active ? "1px solid #6366f1" : "1px solid transparent",
                    whiteSpace: "nowrap",
                    textDecoration: "none",
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={togglePause}
          disabled={toggling}
          style={{
            fontFamily: "monospace", fontSize: 10, letterSpacing: 1,
            padding: "4px 12px", borderRadius: 2, cursor: toggling ? "wait" : "pointer",
            background: paused ? "#1a0000" : "#001a00",
            color: paused ? "#ef4444" : "#22c55e",
            border: `1px solid ${paused ? "#ef444440" : "#22c55e40"}`,
            textTransform: "uppercase",
          }}
        >
          {toggling ? "..." : paused ? "⏸ PAUSED" : "▶ RUNNING"}
        </button>

        <span
          className="text-xs shrink-0 tabular-nums"
          style={{ color: "#555555", fontFamily: "var(--font-geist-mono)" }}
          suppressHydrationWarning
        >
          <Clock />
        </span>
      </div>
    </nav>
  );
}

function Clock() {
  "use client";
  const [time, setTime] = React.useState("");

  React.useEffect(() => {
    function tick() {
      const now = new Date();
      const et = now.toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const day = now.toLocaleDateString("en-US", {
        timeZone: "America/New_York",
        day: "2-digit",
        month: "short",
      });
      setTime(`${day}  ${et} ET`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return <>{time}</>;
}

import React from "react";
