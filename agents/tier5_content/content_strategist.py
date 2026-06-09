"""
Content Strategist — Tier 5 Content.
Reads oracle_intelligence where category='trend'.
Produces weekly content plan (5 topics with angles).
Writes to task_queue for writer agent. Monday 7am.
"""
import asyncio
import os
import json
from datetime import datetime, timezone, timedelta

from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

STRATEGY_PROMPT = """You are a content strategist for an AI holding company building authority in AI, automation, and business.

Trending topics this week:
{trends}

Create a 5-topic content plan for the week. For each topic:
- Hook that stops the scroll
- Core angle (contrarian, how-to, case study, or prediction)
- Target audience
- Primary keyword
- Content format (blog, thread, video, email)

Return JSON:
{{
  "week_theme": "<overarching weekly theme>",
  "topics": [
    {{
      "title": "<article/post title>",
      "hook": "<opening line>",
      "angle": "<contrarian|how-to|case-study|prediction>",
      "audience": "<who this is for>",
      "keyword": "<primary SEO keyword>",
      "format": "<blog|thread|video|email>",
      "priority": <1-10>
    }}
  ],
  "cta_theme": "<consistent call to action for the week>"
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[ContentStrategist] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    trends = (
        supabase.table("oracle_intelligence")
        .select("headline, data, confidence")
        .eq("category", "trend")
        .gte("created_at", cutoff)
        .order("confidence", desc=True)
        .limit(15)
        .execute()
    )

    if not trends.data:
        print("[ContentStrategist] No recent trend data")
        await log_agent_run("content_strategist", "skipped", "No trend data", duration_ms=0)
        return

    trends_text = "\n".join([
        f"- {t.get('headline', '')} (virality: {t.get('confidence', 5)}/10)"
        for t in trends.data
    ])

    raw = await agent_llm(
        STRATEGY_PROMPT.format(trends=trends_text),
        max_tokens=1000,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        plan = json.loads(cleaned)
    except Exception as e:
        print(f"[ContentStrategist] Parse error: {e}")
        await log_agent_run("content_strategist", "failed", str(e), duration_ms=0)
        return

    for topic in plan.get("topics", []):
        supabase.table("task_queue").insert({
            "from_agent": "content_strategist",
            "to_agent": "writer",
            "task_type": "write_article",
            "payload": {
                "topic": topic,
                "week_theme": plan.get("week_theme", ""),
                "cta": plan.get("cta_theme", ""),
            },
            "priority": topic.get("priority", 5),
            "status": "pending",
        }).execute()

    topic_count = len(plan.get("topics", []))
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("content_strategist", "success", f"Planned {topic_count} topics. Theme: {plan.get('week_theme', '')}", duration_ms=duration_ms)
    print(f"[ContentStrategist] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
