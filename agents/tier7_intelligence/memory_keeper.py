"""
Memory Keeper — Tier 7 Intelligence.
Reads last 100 rows from all key tables. Summarizes into structured knowledge.
Upserts to agent_memory table with key='empire_state'. Every 6 hours.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

MEMORY_PROMPT = """You are the Memory Keeper for an autonomous AI empire. Synthesize the current state of the empire.

Recent agent activity:
{agent_activity}

Business status:
{business_status}

Recent intelligence:
{intelligence}

Recent chairman queue items:
{chairman_items}

Write a structured knowledge summary that any agent can use to understand the empire's current state.
Be specific — include numbers, statuses, and key facts.

Return JSON:
{{
  "empire_health": "<HEALTHY|DEGRADED|CRITICAL>",
  "active_businesses": <count>,
  "total_revenue_7d": <float>,
  "top_performing_business": "<name>",
  "most_active_agent": "<agent_name>",
  "pending_actions": ["<action1>", "<action2>"],
  "key_intelligence": ["<intel1>", "<intel2>", "<intel3>"],
  "system_summary": "<three sentences describing current state>",
  "last_updated": "<iso timestamp>"
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[MemoryKeeper] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    # read recent data from all key tables
    agent_runs = supabase.table("agent_runs").select("agent, status, summary, created_at").order("created_at", desc=True).limit(50).execute()
    businesses = supabase.table("businesses").select("name, revenue_7d, status, war_room_score, war_room_recommendation").execute()
    intelligence = supabase.table("oracle_intelligence").select("category, ticker_or_topic, summary, relevance_score, created_at").order("created_at", desc=True).limit(20).execute()
    chairman_items = supabase.table("chairman_queue").select("message, priority, created_at").eq("sent_in_brief", False).order("priority", desc=True).limit(10).execute()

    # format for prompt
    agent_activity = "\n".join([
        f"- [{r.get('created_at', '')[:16]}] {r.get('agent')}: {r.get('status')} — {str(r.get('summary', ''))[:100]}"
        for r in (agent_runs.data or [])[:30]
    ])

    business_status = "\n".join([
        f"- {b.get('name')}: {b.get('status', 'unknown').upper()}, revenue=${b.get('revenue_7d', 0)}, score={b.get('war_room_score', 'N/A')}"
        for b in (businesses.data or [])
    ])

    intel_text = "\n".join([
        f"- [{r.get('category')}] {r.get('ticker_or_topic')} — {r.get('summary', '')[:80]} ({r.get('relevance_score')}/10)"
        for r in (intelligence.data or [])
    ])

    chairman_text = "\n".join([
        f"- [P{r.get('priority')}] {r.get('message', '')[:120]}"
        for r in (chairman_items.data or [])
    ])

    raw = await agent_llm(
        MEMORY_PROMPT.format(
            agent_activity=agent_activity or "No recent activity",
            business_status=business_status or "No businesses",
            intelligence=intel_text or "No recent intelligence",
            chairman_items=chairman_text or "No pending items",
        ),
        max_tokens=600,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        state = json.loads(cleaned)
    except Exception as e:
        print(f"[MemoryKeeper] Parse error: {e}")
        state = {"system_summary": raw[:300], "empire_health": "UNKNOWN"}

    state["last_updated"] = datetime.now(timezone.utc).isoformat()

    # upsert empire_state
    existing = supabase.table("agent_memory").select("id").eq("agent", "memory_keeper").eq("key", "empire_state").execute()
    if existing.data:
        supabase.table("agent_memory").update({"value": state}).eq("id", existing.data[0]["id"]).execute()
    else:
        supabase.table("agent_memory").insert({
            "agent": "memory_keeper",
            "key": "empire_state",
            "value": state,
        }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    health = state.get("empire_health", "UNKNOWN")
    await log_agent_run("memory_keeper", "success", f"Empire state updated. Health: {health}", duration_ms=duration_ms)
    print(f"[MemoryKeeper] Done in {duration_ms}ms — {health}")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
