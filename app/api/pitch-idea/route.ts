import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const REFINE_PROMPT = (pitch: string) => `You are a startup analyst for an AI business empire. A founder just pitched you a raw idea.

Their pitch: "${pitch}"

Extract the core business idea and return a structured analysis.

Return ONLY valid JSON (no markdown):
{
  "title": "3-5 word product name",
  "description": "2-3 sentences: the problem, the solution, why now",
  "score": <1-10>,
  "market_size": "small|medium|large",
  "revenue_model": "exact pricing model e.g. $49/mo SaaS or $299 one-time",
  "target_customer": "specific person who buys this",
  "reasoning": "2 sentences: why this could work and what makes it viable",
  "risks": "biggest risk in one sentence",
  "refined_pitch": "one sentence elevator pitch"
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pitch, preview_only, refined_override } = body;

    if (!pitch || typeof pitch !== "string" || pitch.trim().length < 5) {
      return NextResponse.json({ ok: false, error: "Pitch too short" }, { status: 400 });
    }

    // if we have an override (user edited preview), skip Groq and just save
    if (refined_override) {
      const r = refined_override;
      const { data, error } = await sb.from("ideas").insert({
        title: r.title,
        description: r.description,
        source: "chairman",
        raw_score: Math.min(100, Math.round((r.score ?? 5) * 10)),
        status: "raw",
        market_data: {
          market_size: r.market_size,
          revenue_model: r.revenue_model,
          reasoning: r.reasoning,
          risks: r.risks,
          target_customer: r.target_customer,
          refined_pitch: r.refined_pitch,
          original_pitch: pitch,
        },
      }).select("id, title").single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, title: data.title, id: data.id });
    }

    // call Groq
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: REFINE_PROMPT(pitch) }],
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return NextResponse.json({ ok: false, error: `Groq error: ${err}` }, { status: 500 });
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/```$/, "").trim();
    const refined = JSON.parse(cleaned);

    // preview_only — return refined without saving
    if (preview_only) {
      return NextResponse.json({ ok: true, refined });
    }

    // save directly
    const { data, error } = await sb.from("ideas").insert({
      title: refined.title,
      description: refined.description,
      source: "chairman",
      raw_score: Math.min(100, Math.round((refined.score ?? 5) * 10)),
      status: "raw",
      market_data: {
        market_size: refined.market_size,
        revenue_model: refined.revenue_model,
        reasoning: refined.reasoning,
        risks: refined.risks,
        target_customer: refined.target_customer,
        refined_pitch: refined.refined_pitch,
        original_pitch: pitch,
      },
    }).select("id, title").single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, title: data.title, id: data.id });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
