"""Learner — reviews what worked, improves agent prompts, saves lessons."""
import asyncio, os, json
from datetime import datetime, timezone, timedelta
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run

REFLECT_PROMPT = """You are an AI systems optimizer reviewing agent performance.

Recent agent run summaries:
{summaries}

Based on these results:
1. What is working well?
2. What patterns lead to failures?
3. Give 2 concrete prompt improvements for the worst-performing agent

Return ONLY valid JSON (no markdown):
{{
  "working_well": ["...", "..."],
  "failure_patterns": ["...", "..."],
  "improvements": [
    {{"agent": "...", "suggestion": "..."}}
  ]
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print("[Learner] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    runs = sb.table("agent_runs").select("agent, status, summary").gte("created_at", cutoff).limit(30).execute()

    if not runs.data or len(runs.data) < 5:
        await log_agent_run("learner", "skipped", "Not enough data yet", duration_ms=0)
        return

    summaries = "\n".join(f"- [{r['agent']}] {r['status']}: {r.get('summary','')}" for r in runs.data)

    try:
        raw = await groq_llm(REFLECT_PROMPT.format(summaries=summaries[:2000]), max_tokens=600)
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        insights = json.loads(cleaned)

        sb.table("agent_memory").upsert({
            "agent": "learner",
            "key": "last_reflection",
            "value": insights,
        }, on_conflict="agent,key").execute()

        duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        await log_agent_run("learner", "success", f"{len(insights.get('improvements',[]))} improvements suggested", duration_ms=duration_ms)
        print(f"[Learner] Done")

    except Exception as e:
        print(f"[Learner] Failed: {e}")
        await log_agent_run("learner", "failed", str(e), duration_ms=0)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
