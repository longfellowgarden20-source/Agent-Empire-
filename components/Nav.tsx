"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/oracle", label: "Oracle" },
  { href: "/agents", label: "Agents" },
  { href: "/finance", label: "Finance" },
  { href: "/logs", label: "Logs" },
  { href: "/security", label: "Security" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex items-center gap-8 px-6 border-b shrink-0"
      style={{ borderColor: "#1f1f1f", background: "#0a0a0a", height: 48 }}
    >
      <span
        className="text-sm font-semibold tracking-widest uppercase shrink-0"
        style={{ color: "#6366f1", fontFamily: "var(--font-geist-mono)" }}
      >
        ◈ WAR ROOM
      </span>

      <div className="flex items-center gap-1 flex-1">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-1 text-xs uppercase tracking-wider transition-colors rounded-sm"
              style={{
                color: active ? "#f5f5f5" : "#555555",
                borderBottom: active ? "1px solid #6366f1" : "1px solid transparent",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      <span
        className="text-xs shrink-0 tabular-nums"
        style={{ color: "#555555", fontFamily: "var(--font-geist-mono)" }}
        suppressHydrationWarning
      >
        <Clock />
      </span>
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
