"""
Email Marketer — Tier 5 Content.
Reads writer output. Adapts into email newsletter format.
Writes to agent_memory. Weekly.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

EMAIL_PROMPT = """Convert this article into a high-converting email newsletter.

Title: {title}
Article content: {content}

Newsletter format:
- Subject line (max 50 chars, curiosity-driven, no clickbait)
- Preview text (max 90 chars)
- Opening: Personal, direct. 2-3 sentences.
- Body: 3 key points from the article. Tight. No fluff.
- CTA: One clear action. Bold and specific.
- Signature: "— The Empire Team"

Target: 300-400 words total. Friendly but authoritative tone.

Return JSON:
{{
  "subject_line": "<subject>",
  "preview_text": "<preview>",
  "body": "<full email body in plain text>",
  "cta_text": "<button text>",
  "cta_url": "<url placeholder>"
}}"""


async def write_email(task: dict, supabase) -> bool:
    payload = task.get("payload", {})
    memory_id = payload.get("memory_id")
    title = payload.get("title", "")

    memory = supabase.table("agent_memory").select("*").eq("id", memory_id).single().execute()
    if not memory.data:
        print(f"[EmailMarketer] Memory {memory_id} not found")
        return False

    content = memory.data.get("value", {}).get("content", "")[:2500]
    print(f"[EmailMarketer] Writing email for: {title}")

    raw = await agent_llm(
        EMAIL_PROMPT.format(title=title, content=content),
        max_tokens=600,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        email = json.loads(cleaned)
    except Exception:
        email = {"subject_line": title, "body": raw[:800], "cta_text": "Read More"}

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    supabase.table("agent_memory").insert({
        "agent": "email_marketer",
        "key": f"email_{ts}",
        "value": {
            **email,
            "title": title,
            "source_memory_id": memory_id,
            "written_at": datetime.now(timezone.utc).isoformat(),
        },
    }).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[EmailMarketer] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    tasks = supabase.table("task_queue").select("*").eq("to_agent", "email_marketer").eq("status", "pending").order("priority", desc=True).limit(5).execute()
    if not tasks.data:
        print("[EmailMarketer] No tasks in queue")
        await log_agent_run("email_marketer", "skipped", "No tasks", duration_ms=0)
        return

    task_ids = [t["id"] for t in tasks.data]
    supabase.table("task_queue").update({"status": "in_progress", "picked_up_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    results = await asyncio.gather(*[write_email(t, supabase) for t in tasks.data])

    supabase.table("task_queue").update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    success_count = sum(1 for r in results if r)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("email_marketer", "success", f"Wrote {success_count} email newsletters", duration_ms=duration_ms)
    print(f"[EmailMarketer] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
