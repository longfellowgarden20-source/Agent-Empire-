"""
Researcher — Tier 3 Revenue.
Deep intel file on each qualified prospect.
Their pain points, decision makers, budget signals, recent news.
Triggered by Prospector via task_queue.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search, deep_research
from shared.skills.llm_skills import smart_llm
from shared.skills.scoring_skills import log_agent_run

INTEL_PROMPT = """You are building a sales intelligence file for a prospect.
Company: {company}
Website: {website}
Search findings: {findings}

Write a concise intel file covering:
1. What they do and their business model
2. Likely pain points AI automation can solve
3. Decision maker names/titles if found
4. Budget signals (team size, funding, revenue hints)
5. Recent news or triggers for outreach
6. Recommended outreach angle (one sentence)

Be specific. No fluff. This is used to write a personalized cold email."""


async def research_prospect(prospect_id: str, supabase) -> bool:
    # fetch prospect from DB
    result = supabase.table("prospects").select("*").eq("id", prospect_id).single().execute()
    if not result.data:
        print(f"[Researcher] Prospect {prospect_id} not found")
        return False

    prospect = result.data
    company = prospect["company_name"]
    website = prospect.get("website", "")

    print(f"[Researcher] Researching {company}")

    # parallel searches
    queries = [
        f"{company} company news funding team size 2026",
        f"{company} {website} CEO founder decision maker LinkedIn",
        f"{company} pain points challenges reviews complaints",
    ]
    search_results = await asyncio.gather(*[live_search(q, max_results=4) for q in queries])

    combined_findings = ""
    for results in search_results:
        for r in results:
            combined_findings += f"\n[{r.get('title', '')}]\n{r.get('content', '')[:300]}\n"

    # deep research for high-score prospects
    if prospect.get("score", 0) >= 9:
        try:
            deep = await deep_research(f"{company} company profile decision makers pain points AI automation")
            combined_findings += f"\n[DEEP RESEARCH]\n{deep[:800]}\n"
        except Exception:
            pass

    intel_text = await smart_llm(
        INTEL_PROMPT.format(
            company=company,
            website=website,
            findings=combined_findings[:3000],
        ),
        max_tokens=600,
    )

    # update prospect with intel
    supabase.table("prospects").update({
        "intel": {
            **(prospect.get("intel") or {}),
            "full_intel": intel_text,
            "researched_at": datetime.now(timezone.utc).isoformat(),
        },
        "outreach_status": "researched",
    }).eq("id", prospect_id).execute()

    # route to Copywriter
    supabase.table("task_queue").insert({
        "from_agent": "researcher",
        "to_agent": "copywriter",
        "task_type": "write_outreach",
        "payload": {"prospect_id": prospect_id},
        "priority": prospect.get("score", 7),
        "status": "pending",
    }).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[Researcher] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    # pull pending tasks from queue
    tasks = supabase.table("task_queue").select("*").eq("to_agent", "researcher").eq("status", "pending").order("priority", desc=True).limit(20).execute()

    if not tasks.data:
        print("[Researcher] No tasks in queue")
        await log_agent_run("researcher", "skipped", "No tasks", duration_ms=0)
        return

    print(f"[Researcher] Processing {len(tasks.data)} prospects")

    # mark as in_progress
    task_ids = [t["id"] for t in tasks.data]
    supabase.table("task_queue").update({"status": "in_progress", "picked_up_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    # research each prospect
    results = await asyncio.gather(*[
        research_prospect(t["payload"]["prospect_id"], supabase)
        for t in tasks.data
        if t.get("payload", {}).get("prospect_id")
    ])

    success_count = sum(1 for r in results if r)

    # mark tasks complete
    supabase.table("task_queue").update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("researcher", "success", f"Researched {success_count} prospects", duration_ms=duration_ms)
    print(f"[Researcher] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
