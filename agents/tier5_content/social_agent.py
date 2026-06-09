"""
Social Agent — Tier 5 Content.
Reads writer output from agent_memory. Adapts to Twitter thread (10 tweets),
LinkedIn post, Instagram caption. Saves each to agent_memory.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

TWITTER_PROMPT = """Convert this article into a viral Twitter/X thread of exactly 10 tweets.

Title: {title}
Article: {content}

Rules:
- Tweet 1: Hook — bold claim or surprising stat. Must make them stop scrolling.
- Tweets 2-9: One key insight each. Short. Punchy. No filler.
- Tweet 10: CTA — follow for more, or share if valuable.
- Max 280 chars per tweet.
- Use numbers (1/, 2/) to mark each tweet.

Return ONLY the thread, tweet by tweet. No preamble."""

LINKEDIN_PROMPT = """Write a LinkedIn post from this article. 150-300 words.

Title: {title}
Article: {content}

Format:
- Strong opening line (no "I'm excited to share")
- 3-4 short paragraphs
- End with a question to drive comments
- 3-5 relevant hashtags

Return ONLY the LinkedIn post."""

INSTAGRAM_PROMPT = """Write an Instagram caption from this article. Max 150 words.

Title: {title}
Article: {content}

Format:
- Hook in first line (before the "more" cutoff)
- Key value in 2-3 short paragraphs
- 5-8 relevant hashtags at the end

Return ONLY the caption."""


async def adapt_content(task: dict, supabase) -> bool:
    payload = task.get("payload", {})
    memory_id = payload.get("memory_id")
    title = payload.get("title", "")

    memory = supabase.table("agent_memory").select("*").eq("id", memory_id).single().execute()
    if not memory.data:
        print(f"[SocialAgent] Memory {memory_id} not found")
        return False

    content = memory.data.get("value", {}).get("content", "")[:3000]
    print(f"[SocialAgent] Adapting: {title}")

    twitter_thread, linkedin_post, instagram_caption = await asyncio.gather(
        agent_llm(TWITTER_PROMPT.format(title=title, content=content), max_tokens=800),
        agent_llm(LINKEDIN_PROMPT.format(title=title, content=content), max_tokens=400),
        agent_llm(INSTAGRAM_PROMPT.format(title=title, content=content), max_tokens=250),
    )

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    supabase.table("agent_memory").insert([
        {
            "agent": "social_agent",
            "key": f"twitter_{ts}",
            "value": {"platform": "twitter", "title": title, "content": twitter_thread, "source_memory_id": memory_id},
        },
        {
            "agent": "social_agent",
            "key": f"linkedin_{ts}",
            "value": {"platform": "linkedin", "title": title, "content": linkedin_post, "source_memory_id": memory_id},
        },
        {
            "agent": "social_agent",
            "key": f"instagram_{ts}",
            "value": {"platform": "instagram", "title": title, "content": instagram_caption, "source_memory_id": memory_id},
        },
    ]).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[SocialAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    tasks = supabase.table("task_queue").select("*").eq("to_agent", "social_agent").eq("status", "pending").order("priority", desc=True).limit(10).execute()
    if not tasks.data:
        print("[SocialAgent] No tasks in queue")
        await log_agent_run("social_agent", "skipped", "No tasks", duration_ms=0)
        return

    task_ids = [t["id"] for t in tasks.data]
    supabase.table("task_queue").update({"status": "in_progress", "picked_up_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    results = await asyncio.gather(*[adapt_content(t, supabase) for t in tasks.data])

    supabase.table("task_queue").update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    success_count = sum(1 for r in results if r)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("social_agent", "success", f"Adapted {success_count} articles to social formats", duration_ms=duration_ms)
    print(f"[SocialAgent] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
