"""
Deployer — Tier 2 Builders.
Reads completed test tasks. Registers new business in businesses table.
Notifies chairman. Triggered by tester passing.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

DEPLOY_SUMMARY_PROMPT = """Write a one-sentence deployment announcement for the chairman.
Company: {company_name}
Description: {description}
Agents deployed: {agent_count}
Revenue target (90 days): ${revenue_target}/month

Format: "[DEPLOYED] <company_name> is live — <what it does> — targeting $<amount>/mo in 90 days."
Return ONLY that one sentence."""


async def deploy_company(idea_id: str, company_slug: str, test_results: dict, supabase) -> bool:
    idea = supabase.table("ideas").select("*").eq("id", idea_id).single().execute()
    if not idea.data:
        print(f"[Deployer] Idea {idea_id} not found")
        return False

    spec = idea.data.get("company_specs") or {}
    company_name = spec.get("company_name", company_slug)
    description = spec.get("description", "")
    agent_count = len(spec.get("agents", []))
    revenue_target = spec.get("revenue_target_90d", 0)

    print(f"[Deployer] Registering {company_name}")

    # register in businesses table
    existing = supabase.table("businesses").select("id").eq("slug", company_slug).execute()
    if existing.data:
        business_id = existing.data[0]["id"]
        supabase.table("businesses").update({
            "active": True,
            "deployed_at": datetime.now(timezone.utc).isoformat(),
            "metadata": {**(spec or {}), "test_results": test_results},
        }).eq("id", business_id).execute()
    else:
        result = supabase.table("businesses").insert({
            "name": company_name,
            "slug": company_slug,
            "description": description,
            "active": True,
            "revenue_7d": 0,
            "revenue_prev_7d": 0,
            "agent_health_pct": 100,
            "market_growing": True,
            "deployed_at": datetime.now(timezone.utc).isoformat(),
            "metadata": {**(spec or {}), "test_results": test_results},
        }).execute()
        business_id = result.data[0]["id"] if result.data else None

    # update idea status
    supabase.table("ideas").update({
        "status": "deployed",
        "business_id": business_id,
        "deployed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", idea_id).execute()

    # notify chairman
    announcement = await fast_llm(
        DEPLOY_SUMMARY_PROMPT.format(
            company_name=company_name,
            description=description,
            agent_count=agent_count,
            revenue_target=revenue_target,
        ),
        max_tokens=100,
    )

    supabase.table("chairman_queue").insert({
        "agent": "deployer",
        "priority": 7,
        "message": announcement.strip(),
        "data": {"idea_id": idea_id, "business_id": business_id, "company_slug": company_slug, "spec": spec},
        "status": "pending",
    }).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[Deployer] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    tasks = supabase.table("task_queue").select("*").eq("to_agent", "deployer").eq("status", "pending").order("priority", desc=True).limit(10).execute()
    if not tasks.data:
        print("[Deployer] No tasks in queue")
        await log_agent_run("deployer", "skipped", "No tasks", duration_ms=0)
        return

    task_ids = [t["id"] for t in tasks.data]
    supabase.table("task_queue").update({"status": "in_progress", "picked_up_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    results = []
    for task in tasks.data:
        payload = task.get("payload", {})
        ok = await deploy_company(
            payload.get("idea_id", ""),
            payload.get("company_slug", ""),
            payload.get("test_results", {}),
            supabase,
        )
        results.append(ok)

    supabase.table("task_queue").update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    success_count = sum(1 for r in results if r)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("deployer", "success", f"Deployed {success_count} companies", duration_ms=duration_ms)
    print(f"[Deployer] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
