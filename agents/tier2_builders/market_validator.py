"""
Market Validator — Tier 2 Builders.
Stress-tests ideas from ideas table where status='raw'.
Tavily search for market size + competitors. Scores 1-100.
Updates ideas table status to 'validated' or 'killed'.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search, deep_research
from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run, score_idea

VALIDATION_PROMPT = """You are validating a business idea for an AI holding company. Be ruthless — most ideas should fail.

Idea: {idea}

Live market research:
{market_data}

Score 1-100 on these dimensions (25 pts each):
- Market size: Is there a real, growing market? ($1B+ TAM = 25pts)
- Buildability: Can AI agents run this with <2hr/week human input? (fully autonomous = 25pts)
- Competition: Is there room to enter? (blue ocean = 25pts, monopolized = 0pts)
- Revenue clarity: Clear path to $5k/month in 90 days? (proven model = 25pts)

Threshold: 80+ = validate, <80 = kill

Return JSON:
{{
  "score": <1-100>,
  "market": <0-25>,
  "buildability": <0-25>,
  "competition": <0-25>,
  "revenue": <0-25>,
  "market_size_estimate": "<TAM estimate>",
  "top_competitors": ["<comp1>", "<comp2>", "<comp3>"],
  "kill_reason": "<why it fails, or null if validated>",
  "validation_summary": "<two sentences>"
}}"""


async def validate_idea(idea_record: dict, supabase) -> bool:
    idea_id = idea_record["id"]
    idea_text = idea_record.get("idea", "")
    print(f"[MarketValidator] Validating: {idea_text[:60]}")

    queries = [
        f"market size {idea_text} TAM revenue 2024 2025",
        f"top competitors {idea_text} companies funding",
        f"{idea_text} business model how to monetize",
    ]
    search_batches = await asyncio.gather(*[live_search(q, max_results=5) for q in queries])

    market_data = ""
    for batch in search_batches:
        for r in batch:
            market_data += f"\n[{r.get('title', '')}]\n{r.get('content', '')[:300]}\n"

    raw = await agent_llm(
        VALIDATION_PROMPT.format(idea=idea_text, market_data=market_data[:3000]),
        max_tokens=600,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
    except Exception as e:
        print(f"[MarketValidator] Parse error for idea {idea_id}: {e}")
        supabase.table("ideas").update({"status": "validation_failed", "error": str(e)}).eq("id", idea_id).execute()
        return False

    score = int(result.get("score", 0))
    new_status = "validated" if score >= 80 else "killed"

    supabase.table("ideas").update({
        "status": new_status,
        "score": score,
        "validation_data": result,
        "validated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", idea_id).execute()

    print(f"[MarketValidator] Idea '{idea_text[:40]}' scored {score} → {new_status}")

    if new_status == "validated":
        supabase.table("task_queue").insert({
            "from_agent": "market_validator",
            "to_agent": "architect",
            "task_type": "spec_idea",
            "payload": {"idea_id": idea_id},
            "priority": min(10, score // 10),
            "status": "pending",
        }).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[MarketValidator] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    ideas = supabase.table("ideas").select("*").eq("status", "raw").order("created_at").limit(10).execute()
    if not ideas.data:
        print("[MarketValidator] No raw ideas to validate")
        await log_agent_run("market_validator", "skipped", "No raw ideas", duration_ms=0)
        return

    print(f"[MarketValidator] Validating {len(ideas.data)} ideas")
    idea_ids = [i["id"] for i in ideas.data]
    supabase.table("ideas").update({"status": "validating"}).in_("id", idea_ids).execute()

    results = []
    for idea in ideas.data:
        ok = await validate_idea(idea, supabase)
        results.append(ok)

    success_count = sum(1 for r in results if r)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("market_validator", "success", f"Validated {success_count} ideas", duration_ms=duration_ms)
    print(f"[MarketValidator] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
