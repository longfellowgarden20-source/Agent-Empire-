"use client";

import React, { useState, useRef, useEffect } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: string;
};

const SLASH_COMMANDS = [
  { cmd: "/status", desc: "Full empire health summary" },
  { cmd: "/prospects", desc: "Analyze prospects pipeline" },
  { cmd: "/ideas", desc: "Review ideas pipeline" },
  { cmd: "/agents", desc: "Recent agent activity" },
  { cmd: "/brief", desc: "Generate morning brief" },
  { cmd: "/help", desc: "List all commands" },
];

const SUGGESTIONS = [
  "What should I focus on today?",
  "Which prospects are most likely to close?",
  "Write a cold email for a SaaS company",
  "How is the empire performing this week?",
  "What businesses should I kill?",
];

function timestamp() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    timeZone: "America/New_York",
  });
}

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function TerminalPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      role: "assistant",
      content: `WAR ROOM TERMINAL — ONLINE\nModel: llama-3.3-70b-versatile via Groq\nEmpire context: injected automatically\n\nType a message or use a slash command. Type /help to see all commands.`,
      ts: timestamp(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (input.startsWith("/") && !input.includes(" ")) {
      setShowCommands(true);
    } else {
      setShowCommands(false);
    }
  }, [input]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setInput("");
    setShowCommands(false);

    const userMsg: Message = { id: uid(), role: "user", content, ts: timestamp() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...history, { role: "user", content }] }),
      });

      const data = await res.json();
      const reply = data.content || data.error || "No response";

      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: reply, ts: timestamp() },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: `Error: ${e}`, ts: timestamp() },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.key === "Escape") {
      setShowCommands(false);
    }
  }

  const mono: React.CSSProperties = { fontFamily: "var(--font-geist-mono)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)", background: "#0a0a0a", ...mono }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: "1px solid #1a1a1a", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#22c55e", fontSize: 11 }}>●</span>
          <span style={{ color: "#555", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>
            War Room Terminal
          </span>
          <span style={{ color: "#1f1f1f", fontSize: 11 }}>|</span>
          <span style={{ color: "#333", fontSize: 11 }}>llama-3.3-70b-versatile</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {SLASH_COMMANDS.slice(0, 4).map((c) => (
            <button
              key={c.cmd}
              onClick={() => send(c.cmd)}
              style={{
                background: "transparent", border: "1px solid #1f1f1f", borderRadius: 2,
                color: "#444", fontSize: 10, padding: "3px 8px", cursor: "pointer",
                letterSpacing: 1, textTransform: "uppercase", fontFamily: "monospace",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1f1f1f")}
            >
              {c.cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

        {messages.map((msg) => (
          <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
                color: msg.role === "user" ? "#6366f1" : "#22c55e",
              }}>
                {msg.role === "user" ? "► CHAIRMAN" : "◈ WAR ROOM"}
              </span>
              <span style={{ color: "#222", fontSize: 10 }}>{msg.ts}</span>
            </div>
            <div style={{
              fontSize: 13, lineHeight: 1.7, color: msg.role === "user" ? "#ccc" : "#e5e5e5",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              paddingLeft: msg.role === "assistant" ? 12 : 0,
              borderLeft: msg.role === "assistant" ? "1px solid #1f1f1f" : "none",
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "#22c55e" }}>
                ◈ WAR ROOM
              </span>
              <span style={{ color: "#222", fontSize: 10 }}>{timestamp()}</span>
            </div>
            <div style={{ paddingLeft: 12, borderLeft: "1px solid #1f1f1f" }}>
              <span style={{ color: "#444", fontSize: 13, animation: "blink 1s step-end infinite" }}>
                thinking...
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 2 && (
        <div style={{ padding: "0 20px 12px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              style={{
                background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 2,
                color: "#555", fontSize: 11, padding: "4px 10px", cursor: "pointer",
                fontFamily: "monospace", letterSpacing: 0.5,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#f5f5f5"; e.currentTarget.style.borderColor = "#333"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#555"; e.currentTarget.style.borderColor = "#1a1a1a"; }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Slash command autocomplete */}
      {showCommands && (
        <div style={{
          margin: "0 20px", border: "1px solid #1f1f1f", background: "#0d0d0d",
          borderRadius: 2, overflow: "hidden",
        }}>
          {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input)).map((c) => (
            <div
              key={c.cmd}
              onClick={() => { setInput(c.cmd); setShowCommands(false); inputRef.current?.focus(); }}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                cursor: "pointer", borderBottom: "1px solid #111",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#111")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: "#6366f1", fontSize: 12, fontFamily: "monospace", minWidth: 100 }}>{c.cmd}</span>
              <span style={{ color: "#444", fontSize: 11, fontFamily: "monospace" }}>{c.desc}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "12px 20px 16px", borderTop: "1px solid #1a1a1a", flexShrink: 0,
        display: "flex", gap: 10, alignItems: "flex-end",
      }}>
        <span style={{ color: "#6366f1", fontSize: 14, paddingBottom: 10, flexShrink: 0 }}>►</span>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a message or /command... (Enter to send, Shift+Enter for newline)"
          rows={1}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none", resize: "none",
            color: "#f5f5f5", fontSize: 13, fontFamily: "var(--font-geist-mono)",
            lineHeight: 1.6, padding: "8px 0", caretColor: "#6366f1",
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 120) + "px";
          }}
          autoFocus
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          style={{
            background: loading || !input.trim() ? "#111" : "#6366f1",
            border: "none", borderRadius: 2, color: "#fff", fontSize: 11,
            padding: "8px 16px", cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            fontFamily: "monospace", letterSpacing: 1, textTransform: "uppercase",
            flexShrink: 0, transition: "background 0.15s",
          }}
        >
          {loading ? "..." : "SEND"}
        </button>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}
