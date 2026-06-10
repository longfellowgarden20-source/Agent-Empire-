import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

async function getEmpireContext() {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const [bizRes, runsRes, prospectsRes, ideasRes, intelRes] = await Promise.all([
      sb.from("businesses").select("name,status,war_room_score,revenue_7d").order("war_room_score", { ascending: false }),
      sb.from("agent_runs").select("agent,status,summary,created_at").order("created_at", { ascending: false }).limit(10),
      sb.from("prospects").select("company_name,score,outreach_status").order("score", { ascending: false }).limit(10),
      sb.from("ideas").select("title,status,validated_score").order("validated_score", { ascending: false }).limit(10),
      sb.from("oracle_intelligence").select("category,summary,relevance_score").order("created_at", { ascending: false }).limit(5),
    ]);

    const businesses = bizRes.data || [];
    const runs = runsRes.data || [];
    const prospects = prospectsRes.data || [];
    const ideas = ideasRes.data || [];
    const intel = intelRes.data || [];

    const avgScore = businesses.length
      ? Math.round(businesses.reduce((s, b) => s + (b.war_room_score ?? 0), 0) / businesses.length)
      : 0;

    const recentFailed = runs.filter((r) => r.status === "failed").length;
    const recentSuccess = runs.filter((r) => r.status === "success").length;

    return `
EMPIRE STATE (live data as of ${new Date().toISOString()}):

BUSINESSES (${businesses.length} total, avg war room score: ${avgScore}/100):
${businesses.map((b) => `  - ${b.name} | status: ${b.status} | score: ${b.war_room_score ?? "unscored"} | 7d revenue: $${b.revenue_7d ?? 0}`).join("\n") || "  No businesses yet"}

RECENT AGENT ACTIVITY (last 10 runs):
${runs.map((r) => `  - ${r.agent} | ${r.status} | ${r.summary || "no summary"}`).join("\n") || "  No recent runs"}
  Success: ${recentSuccess} | Failed: ${recentFailed}

TOP PROSPECTS (${prospects.length}):
${prospects.map((p) => `  - ${p.company_name} | score: ${p.score}/10 | status: ${p.outreach_status}`).join("\n") || "  No prospects yet"}

IDEAS PIPELINE (${ideas.length}):
${ideas.map((i) => `  - ${i.title} | status: ${i.status} | score: ${i.validated_score ?? "unscored"}`).join("\n") || "  No ideas yet"}

LATEST INTEL (${intel.length} items):
${intel.map((i) => `  - [${i.category}] score:${i.relevance_score} — ${i.summary?.slice(0, 120) ?? "no summary"}`).join("\n") || "  No intel yet"}
`.trim();
  } catch {
    return "Empire context unavailable (database connection issue)";
  }
}

const SYSTEM_PROMPT = `You are the War Room AI — the internal intelligence system for Agent Empire, a fully autonomous AI holding company.

You have direct access to live empire data (injected below). You help the Chairman (the user) make decisions, analyze performance, write copy, review deals, and command the empire.

Personality: Sharp, direct, Bloomberg terminal energy. No fluff. Give concrete numbers and recommendations. When the user issues commands, acknowledge and suggest how to implement them via the agent system.

Slash commands you recognize:
/status — full empire health summary
/prospects — analyze the prospects pipeline
/ideas — review the ideas pipeline
/agents — summarize recent agent activity
/brief — write a morning brief from the data
/help — list all commands

Always use the live empire data when answering questions about the business. If data is empty, say so directly and explain what agent needs to run to populate it.`;

export async function POST(req: NextRequest) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "GROQ_API_KEY not set" }, { status: 500 });
  }

  const { messages } = await req.json();
  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const empireContext = await getEmpireContext();

  const systemWithContext = `${SYSTEM_PROMPT}\n\n--- LIVE EMPIRE DATA ---\n${empireContext}\n--- END EMPIRE DATA ---`;

  const response = await fetch(GROQ_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemWithContext },
        ...messages,
      ],
      max_tokens: 1024,
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return NextResponse.json({ error: `Groq error: ${err}` }, { status: response.status });
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return NextResponse.json({ content });
}
