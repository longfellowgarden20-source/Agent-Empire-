import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { groqCall } from "@/lib/groq";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { idea_id, idea } = await req.json();
    if (!idea_id || !idea) return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });

    const md = idea.market_data || {};

    const prompt = `You are a startup market validator. Validate this idea with fresh eyes.

Title: ${idea.title}
Description: ${idea.description}
Revenue model: ${md.revenue_model || "unknown"}
Target customer: ${md.target_customer || "unknown"}

Assess:
1. Is this market real and paying? (people actively spend money here)
2. Can AI agents actually build and operate this?
3. Is the monetization clear and realistic?
4. Is the competition beatable?

Return ONLY valid JSON (no markdown):
{
  "validated_score": <0-100>,
  "market_real": true|false,
  "ai_buildable": true|false,
  "monetization_clear": true|false,
  "competition_beatable": true|false,
  "verdict": "one sentence — pass or fail and why",
  "status": "validated|raw"
}

Set status to "validated" only if score >= 60 and market_real and ai_buildable are both true.`;

    const raw = await groqCall(prompt, 300, 0.5);
    const cleaned = raw.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/```$/, "").trim();
    const result = JSON.parse(cleaned);

    await sb.from("ideas").update({
      validated_score: result.validated_score,
      status: result.status || "raw",
      market_data: {
        ...md,
        validation: {
          market_real: result.market_real,
          ai_buildable: result.ai_buildable,
          monetization_clear: result.monetization_clear,
          competition_beatable: result.competition_beatable,
          verdict: result.verdict,
        },
      },
    }).eq("id", idea_id);

    return NextResponse.json({ ok: true, status: result.status, score: result.validated_score, verdict: result.verdict });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
