"""
Architect — Tier 1 Gods.
Takes a validated idea from ideas table → produces complete tech spec, agent roster, revenue model.
Writes company_specs back to ideas table. Triggered when ideas.status='validated'.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.llm_skills import smart_llm
from shared.skills.scoring_skills import log_agent_run

SPEC_PROMPT = """You are the Architect for an autonomous AI holding company. Design the complete technical blueprint for this business.

Business Idea: {idea}
Validation Score: {score}/100
Market Data: {market_data}

Produce a complete company spec:
1. Business model (how it makes money, pricing)
2. Agent roster (list each agent, their job, which LLM tier)
3. Tech stack (what services, APIs, databases)
4. Revenue model (realistic MRR target at 90 days)
5. Build order (which agents to build first)
6. File structure (companies/[name]/ layout)

Return JSON:
{{
  "company_slug": "<kebab-case-name>",
  "company_name": "<Human Name>",
  "description": "<one sentence>",
  "business_model": "<how it makes money>",
  "pricing": "<pricing tiers>",
  "agents": [
    {{"name": "<agent_name>", "job": "<one sentence>", "llm": "<fast|agent|smart|cheap>", "schedule": "<cron or trigger>"}}
  ],
  "tech_stack": ["<service1>", "<service2>"],
  "revenue_target_90d": <monthly_usd>,
  "build_order": ["<agent1>", "<agent2>"],
  "file_structure": "<tree as string>",
  "reasoning": "<two sentences>"
}}"""


async def spec_idea(idea_record: dict, supabase) -> bool:
    idea_id = idea_record["id"]
    idea_text = idea_record.get("title", "") or idea_record.get("description", "")
    score = idea_record.get("raw_score", 80)
    market_data = json.dumps(idea_record.get("market_data") or {})[:800]

    print(f"[Architect] Speccing idea: {idea_text[:60]}")

    raw = await smart_llm(
        SPEC_PROMPT.format(
            idea=idea_text,
            score=score,
            market_data=market_data,
        ),
        max_tokens=1500,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        spec = json.loads(cleaned)
    except Exception as e:
        print(f"[Architect] JSON parse failed for idea {idea_id}: {e}")
        supabase.table("ideas").update({
            "status": "spec_failed",
            "error": str(e),
        }).eq("id", idea_id).execute()
        return False

    supabase.table("ideas").update({
        "status": "specced",
        "spec": spec,
    }).eq("id", idea_id).execute()

    # queue for coder agent
    supabase.table("task_queue").insert({
        "from_agent": "architect",
        "to_agent": "coder",
        "task_type": "build_company",
        "payload": {"idea_id": idea_id, "company_slug": spec.get("company_slug", "")},
        "priority": 8,
        "status": "pending",
    }).execute()

    # notify chairman
    supabase.table("chairman_queue").insert({
        "priority": 6,
        "message": f"[SPEC READY] {spec.get('company_name')} — target ${spec.get('revenue_target_90d')}/mo at 90 days. {len(spec.get('agents', []))} agents designed. Ready to build.",
        "requires_action": False,
    }).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[Architect] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    ideas = supabase.table("ideas").select("*").eq("status", "validated").order("validated_score", desc=True).limit(5).execute()
    if not ideas.data:
        print("[Architect] No validated ideas to spec")
        await log_agent_run("architect", "skipped", "No validated ideas", duration_ms=0)
        return

    print(f"[Architect] Speccing {len(ideas.data)} ideas")

    # mark as in_progress
    idea_ids = [i["id"] for i in ideas.data]
    supabase.table("ideas").update({"status": "speccing"}).in_("id", idea_ids).execute()

    results = []
    for idea in ideas.data:
        ok = await spec_idea(idea, supabase)
        results.append(ok)

    success_count = sum(1 for r in results if r)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("architect", "success", f"Specced {success_count} ideas", duration_ms=duration_ms)
    print(f"[Architect] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
