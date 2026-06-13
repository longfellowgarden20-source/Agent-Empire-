"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const links = [
  { href: "/", label: "Home" },
  { href: "/ideas", label: "Ideas" },
  { href: "/prospects", label: "Prospects" },
  { href: "/oracle", label: "Intel" },
  { href: "/agents", label: "Agents" },
  { href: "/logs", label: "Logs" },
  { href: "/brief", label: "Brief" },
  { href: "/revenue", label: "Revenue" },
  { href: "/companies", label: "Companies" },
  { href: "/tasks", label: "Tasks" },
  { href: "/terminal", label: "Terminal" },
  { href: "/settings", label: "Settings" },
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
    <nav style={{
      display: "flex", alignItems: "center", gap: 0,
      paddingLeft: 20, paddingRight: 20,
      borderBottom: "1px solid var(--border)",
      background: "rgba(5,5,7,0.85)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      height: 52, flexShrink: 0, minWidth: 0,
      overflowX: "auto", overflowY: "hidden",
      position: "sticky", top: 0, zIndex: 100,
    }}>
      {/* Logo */}
      <span style={{
        fontFamily: "var(--font-geist-mono)", fontSize: 12, fontWeight: 700,
        letterSpacing: "0.2em", textTransform: "uppercase", flexShrink: 0,
        marginRight: 28,
        background: "linear-gradient(135deg, #7c6aff, #a78bfa)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}>
        ◈ WAR ROOM
      </span>

      {/* Nav links */}
      <div style={{ display: "flex", alignItems: "center", flex: 1, overflowX: "auto", gap: 2 }}>
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} style={{
              padding: "5px 10px",
              fontSize: 11,
              fontFamily: "var(--font-geist-mono)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              textDecoration: "none",
              borderRadius: 6,
              color: active ? "#f0f0f8" : "var(--text-muted)",
              background: active ? "rgba(124,106,255,0.15)" : "transparent",
              border: active ? "1px solid rgba(124,106,255,0.25)" : "1px solid transparent",
              transition: "all 0.15s ease",
            }}>
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 16 }}>
        <button onClick={togglePause} disabled={toggling} style={{
          fontFamily: "var(--font-geist-mono)", fontSize: 10, letterSpacing: "0.08em",
          padding: "5px 14px", borderRadius: 20, cursor: toggling ? "wait" : "pointer",
          background: paused ? "rgba(248,113,113,0.1)" : "rgba(52,211,153,0.1)",
          color: paused ? "#f87171" : "#34d399",
          border: `1px solid ${paused ? "rgba(248,113,113,0.25)" : "rgba(52,211,153,0.25)"}`,
          textTransform: "uppercase", transition: "all 0.15s",
        }}>
          {toggling ? "···" : paused ? "⏸ Paused" : "▶ Running"}
        </button>

        <span style={{
          color: "var(--text-muted)", fontFamily: "var(--font-geist-mono)", fontSize: 10,
          letterSpacing: "0.05em", flexShrink: 0,
        }} suppressHydrationWarning>
          <Clock />
        </span>
      </div>
    </nav>
  );
}

function Clock() {
  const [time, setTime] = React.useState("");
  React.useEffect(() => {
    function tick() {
      const now = new Date();
      const et = now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
      const day = now.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
      setTime(`${day} · ${et} ET`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <>{time}</>;
}
