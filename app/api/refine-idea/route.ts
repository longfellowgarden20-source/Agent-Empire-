import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { idea_id, message, idea } = await req.json();
    if (!message || !idea) return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });

    const md = idea.market_data || {};

    const prompt = `You are a startup analyst. A founder is asking about this idea:

Title: ${idea.title}
Description: ${idea.description}
Revenue model: ${md.revenue_model || "unknown"}
Target customer: ${md.target_customer || "unknown"}
Score: ${idea.validated_score || idea.raw_score}/100
Reasoning: ${md.reasoning || ""}
Risks: ${md.risks || ""}

The founder says: "${message}"

Respond directly and honestly. If they push back on a risk, engage with it. If they suggest a pivot, evaluate it. If they ask a question, answer it specifically.

If your response leads to a meaningfully updated idea (better title, description, or score), include an "updated" field. Otherwise omit it.

Return ONLY valid JSON (no markdown):
{
  "reply": "your response (2-4 sentences, direct, no fluff)",
  "updated": {
    "title": "...",
    "description": "...",
    "raw_score": <0-100>
  }
}

Only include "updated" if something genuinely changed. If nothing changed, return just { "reply": "..." }`;

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ ok: false, error: "GROQ_API_KEY not set on server" }, { status: 500 });
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.8,
      }),
    });

    if (!groqRes.ok) {
      return NextResponse.json({ ok: false, error: "Groq error" }, { status: 500 });
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/```$/, "").trim();
    const result = JSON.parse(cleaned);

    if (result.updated && idea_id) {
      await sb.from("ideas").update(result.updated).eq("id", idea_id);
    }

    return NextResponse.json({ ok: true, reply: result.reply, updated: result.updated || null });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
