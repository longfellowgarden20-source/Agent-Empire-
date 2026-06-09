"""
War Room Judge — Tier 1 Gods.
Scores every business 0-100 every Sunday. Kill <20, flag <40, scale >80.
Reads businesses table, writes war_room_score back.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.llm_skills import smart_llm
from shared.skills.scoring_skills import log_agent_run, score_business

JUDGE_PROMPT = """You are the War Room Judge scoring a business for the AI holding company.

Business: {name}
Revenue last 7 days: ${revenue_7d}
Revenue prior 7 days: ${revenue_prev_7d}
Agent health: {agent_health_pct}%
Market growing: {market_growing}
Quantitative score: {quant_score}/100

Additional context:
{context}

Based on the quantitative score and context, provide your final assessment.
Return JSON:
{{
  "final_score": <0-100>,
  "recommendation": "<SHUTDOWN|REVIEW|HOLD|SCALE>",
  "key_risks": ["<risk1>", "<risk2>"],
  "key_strengths": ["<strength1>", "<strength2>"],
  "action_items": ["<action1>", "<action2>"],
  "reasoning": "<two sentences max>"
}}"""


async def judge_business(business: dict, supabase) -> dict:
    company_id = business["id"]
    name = business.get("name", company_id)
    revenue_7d = float(business.get("revenue_7d") or 0)
    revenue_prev_7d = float(business.get("revenue_prev_7d") or 1)
    agent_health_pct = float(business.get("agent_health_pct") or 100)
    market_growing = bool(business.get("market_growing", True))
    context = json.dumps(business.get("metadata") or {})[:600]

    quant = await score_business(company_id, revenue_7d, revenue_prev_7d, agent_health_pct, market_growing)

    raw = await smart_llm(
        JUDGE_PROMPT.format(
            name=name,
            revenue_7d=revenue_7d,
            revenue_prev_7d=revenue_prev_7d,
            agent_health_pct=agent_health_pct,
            market_growing=market_growing,
            quant_score=quant["score"],
            context=context,
        ),
        max_tokens=400,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
    except Exception:
        result = {"final_score": quant["score"], "recommendation": quant["recommendation"], "reasoning": "Parse error — used quant score"}

    supabase.table("businesses").update({
        "war_room_score": result.get("final_score", quant["score"]),
        "war_room_recommendation": result.get("recommendation", quant["recommendation"]),
        "war_room_data": {
            **quant,
            **result,
            "scored_at": datetime.now(timezone.utc).isoformat(),
        },
    }).eq("id", company_id).execute()

    if result.get("recommendation") in ("SHUTDOWN", "REVIEW", "SCALE"):
        supabase.table("chairman_queue").insert({
            "agent": "war_room_judge",
            "priority": 9 if result.get("recommendation") == "SHUTDOWN" else 7,
            "message": f"[{result.get('recommendation')}] {name} scored {result.get('final_score')}/100. {result.get('reasoning', '')}",
            "data": result,
            "status": "pending",
        }).execute()

    return result


async def run():
    start = datetime.now(timezone.utc)
    print(f"[WarRoomJudge] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    businesses = supabase.table("businesses").select("*").eq("active", True).execute()
    if not businesses.data:
        print("[WarRoomJudge] No active businesses to score")
        await log_agent_run("war_room_judge", "skipped", "No active businesses", duration_ms=0)
        return

    print(f"[WarRoomJudge] Scoring {len(businesses.data)} businesses")

    results = await asyncio.gather(*[
        judge_business(b, supabase) for b in businesses.data
    ])

    shutdown_count = sum(1 for r in results if r.get("recommendation") == "SHUTDOWN")
    scale_count = sum(1 for r in results if r.get("recommendation") == "SCALE")

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run(
        "war_room_judge", "success",
        f"Scored {len(results)} businesses. SHUTDOWN: {shutdown_count}, SCALE: {scale_count}",
        duration_ms=duration_ms,
    )
    print(f"[WarRoomJudge] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
