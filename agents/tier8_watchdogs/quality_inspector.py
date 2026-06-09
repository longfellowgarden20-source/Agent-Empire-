"""
Quality Inspector — Tier 8 Watchdogs.
Reads random sample of agent_runs from last 24h.
Uses agent_llm to score output quality 1-10. Flags below 6 to chairman_queue.
Daily.
"""
import asyncio
import os
import json
import random
from datetime import datetime, timezone, timedelta

from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

QUALITY_PROMPT = """Score the quality of this AI agent output on a scale of 1-10.

Agent: {agent_name}
Task type: {task_type}
Output: {output}

Criteria:
- Completeness (did it finish the job?)
- Accuracy (does it make sense / contain real data?)
- Format (well-structured JSON/text as expected?)
- Actionability (can a human or agent act on this?)

Return JSON:
{{
  "quality_score": <1-10>,
  "completeness": <1-10>,
  "accuracy": <1-10>,
  "format": <1-10>,
  "actionability": <1-10>,
  "issues": ["<issue1>", "<issue2>"],
  "summary": "<one sentence>"
}}"""


async def inspect_run(run_row: dict, supabase) -> dict | None:
    agent_name = run_row.get("agent_name", "unknown")
    output = str(run_row.get("output") or "")[:1000]
    task_type = run_row.get("task_type", "general")

    if not output or output in ("None", ""):
        return None

    raw = await agent_llm(
        QUALITY_PROMPT.format(agent_name=agent_name, task_type=task_type, output=output),
        max_tokens=300,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
        result["agent_name"] = agent_name
        result["run_id"] = run_row.get("id")
        return result
    except Exception:
        return None


async def run():
    start = datetime.now(timezone.utc)
    print(f"[QualityInspector] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    runs = (
        supabase.table("agent_runs")
        .select("id, agent_name, status, output, task_type")
        .eq("status", "success")
        .gte("created_at", cutoff)
        .execute()
    )

    if not runs.data:
        print("[QualityInspector] No successful runs in last 24h")
        await log_agent_run("quality_inspector", "skipped", "No runs to inspect", duration_ms=0)
        return

    # random sample — max 20
    sample = random.sample(runs.data, min(20, len(runs.data)))
    print(f"[QualityInspector] Inspecting {len(sample)} runs")

    results = await asyncio.gather(*[inspect_run(r, supabase) for r in sample])
    results = [r for r in results if r is not None]

    low_quality = [r for r in results if r.get("quality_score", 10) < 6]
    avg_score = sum(r.get("quality_score", 5) for r in results) / max(1, len(results))

    for low in low_quality:
        supabase.table("chairman_queue").insert({
            "agent": "quality_inspector",
            "priority": 6,
            "message": f"[QUALITY ALERT] {low.get('agent_name')} scored {low.get('quality_score')}/10. {low.get('summary', '')}",
            "data": low,
            "status": "pending",
        }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    msg = f"Inspected {len(results)} runs. Avg quality: {avg_score:.1f}/10. Flagged {len(low_quality)} low-quality outputs."
    await log_agent_run("quality_inspector", "success", msg, duration_ms=duration_ms)
    print(f"[QualityInspector] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
