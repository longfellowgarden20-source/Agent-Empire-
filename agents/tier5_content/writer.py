"""
Writer — Tier 5 Content.
Reads task_queue tasks assigned to 'writer'. Writes full blog post (800-1200 words).
Saves to agent_memory table. Passes to social_agent via task_queue.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

WRITER_PROMPT = """You are a sharp content writer for an AI business publication. Write for smart builders, entrepreneurs, and investors.

Title: {title}
Hook: {hook}
Angle: {angle}
Audience: {audience}
Primary keyword: {keyword}
CTA: {cta}

Rules:
- 800-1200 words
- Open with the hook (no "In today's world" or "In conclusion")
- 3 main sections with subheadings
- Specific, concrete — no vague claims
- End with a punchy CTA tied to AI automation

Write the complete article. No preamble."""


async def write_article(task: dict, supabase) -> str | None:
    payload = task.get("payload", {})
    topic = payload.get("topic", {})

    title = topic.get("title", "")
    hook = topic.get("hook", "")
    angle = topic.get("angle", "how-to")
    audience = topic.get("audience", "entrepreneurs")
    keyword = topic.get("keyword", "")
    cta = payload.get("cta", "Subscribe to our AI automation newsletter")

    print(f"[Writer] Writing: {title}")

    article = await agent_llm(
        WRITER_PROMPT.format(
            title=title, hook=hook, angle=angle,
            audience=audience, keyword=keyword, cta=cta,
        ),
        max_tokens=1500,
    )

    # save to agent_memory
    result = supabase.table("agent_memory").insert({
        "agent": "writer",
        "key": f"article_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}",
        "value": {
            "title": title,
            "content": article,
            "keyword": keyword,
            "format": topic.get("format", "blog"),
            "written_at": datetime.now(timezone.utc).isoformat(),
            "task_payload": payload,
        },
    }).execute()

    memory_id = result.data[0]["id"] if result.data else None

    # route to social agent
    if memory_id:
        supabase.table("task_queue").insert({
            "from_agent": "writer",
            "to_agent": "social_agent",
            "task_type": "adapt_content",
            "payload": {"memory_id": memory_id, "title": title, "keyword": keyword},
            "priority": task.get("priority", 5),
            "status": "pending",
        }).execute()

        # also route to email marketer
        supabase.table("task_queue").insert({
            "from_agent": "writer",
            "to_agent": "email_marketer",
            "task_type": "write_newsletter",
            "payload": {"memory_id": memory_id, "title": title},
            "priority": task.get("priority", 5),
            "status": "pending",
        }).execute()

    return article


async def run():
    start = datetime.now(timezone.utc)
    print(f"[Writer] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    tasks = supabase.table("task_queue").select("*").eq("to_agent", "writer").eq("status", "pending").order("priority", desc=True).limit(5).execute()
    if not tasks.data:
        print("[Writer] No tasks in queue")
        await log_agent_run("writer", "skipped", "No tasks", duration_ms=0)
        return

    task_ids = [t["id"] for t in tasks.data]
    supabase.table("task_queue").update({"status": "in_progress", "picked_up_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    results = []
    for task in tasks.data:
        try:
            article = await write_article(task, supabase)
            results.append(bool(article))
        except Exception as e:
            print(f"[Writer] Error on task {task.get('id')}: {e}")
            supabase.table("task_queue").insert({
                "from_agent": "writer", "to_agent": "dlq", "task_type": "dlq",
                "payload": {"task_id": task["id"], "error": str(e)}, "priority": 1, "status": "failed",
            }).execute()
            results.append(False)

    supabase.table("task_queue").update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    success_count = sum(1 for r in results if r)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("writer", "success", f"Wrote {success_count} articles", duration_ms=duration_ms)
    print(f"[Writer] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
