"""
Video Scripter — Tier 5 Content.
Reads trending topics from oracle_intelligence. Writes YouTube/TikTok script
(hook + 3 points + CTA). 3x per week.
"""
import asyncio
import os
import json
from datetime import datetime, timezone, timedelta

from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

SCRIPT_PROMPT = """Write a YouTube/TikTok video script on this trending topic.

Topic: {topic}
Trend signal: {signal}
Audience: AI-curious builders and entrepreneurs

Script structure:
1. HOOK (0-5 seconds): Bold claim or shocking stat that stops scrolling
2. PROBLEM SETUP (5-30 seconds): Why this matters RIGHT NOW
3. POINT 1 (30-90 seconds): Key insight with example
4. POINT 2 (90-150 seconds): Key insight with example
5. POINT 3 (150-210 seconds): Key insight with example
6. CTA (210-240 seconds): Follow/subscribe + what's next

Format as a script with speaker cues. Target: 3-4 minutes.
Return ONLY the script."""


async def write_script(trend: dict, supabase) -> bool:
    topic = trend.get("headline", "")
    signal = json.dumps(trend.get("data") or {})[:400]

    print(f"[VideoScripter] Writing script for: {topic[:50]}")

    script = await agent_llm(
        SCRIPT_PROMPT.format(topic=topic, signal=signal),
        max_tokens=1200,
    )

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    supabase.table("agent_memory").insert({
        "agent": "video_scripter",
        "key": f"script_{ts}",
        "value": {
            "topic": topic,
            "script": script,
            "source_intelligence_id": trend.get("id"),
            "written_at": datetime.now(timezone.utc).isoformat(),
        },
    }).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[VideoScripter] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    cutoff = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    trends = (
        supabase.table("oracle_intelligence")
        .select("*")
        .in_("category", ["trend", "macro", "crypto"])
        .gte("created_at", cutoff)
        .gte("confidence", 7)
        .order("confidence", desc=True)
        .limit(3)
        .execute()
    )

    if not trends.data:
        print("[VideoScripter] No high-confidence trends to script")
        await log_agent_run("video_scripter", "skipped", "No trends", duration_ms=0)
        return

    print(f"[VideoScripter] Writing {len(trends.data)} scripts")

    results = await asyncio.gather(*[write_script(t, supabase) for t in trends.data])

    success_count = sum(1 for r in results if r)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("video_scripter", "success", f"Wrote {success_count} scripts", duration_ms=duration_ms)
    print(f"[VideoScripter] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
