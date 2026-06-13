"""Content — writes tweets, LinkedIn posts, and email newsletters. One Groq call."""
import asyncio, os, json
from datetime import datetime, timezone
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run

PROMPT = """You run content for an AI automation company. Generate a week of content in one shot.

Create:
- 3 tweets (under 280 chars each, hooks about AI automation wins)
- 2 LinkedIn posts (150-200 words, thought leadership, no cringe)
- 1 email newsletter intro (200 words, subject line + body opener)

Return ONLY valid JSON (no markdown):
{
  "tweets": ["...", "...", "..."],
  "linkedin": ["...", "..."],
  "email": {
    "subject": "...",
    "body": "..."
  }
}"""


async def run():
    start = datetime.now(timezone.utc)
    print("[Content] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    try:
        raw = await groq_llm(PROMPT, max_tokens=1500)
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(cleaned)

        pieces = []
        for tweet in data.get("tweets", []):
            pieces.append({"type": "tweet", "content": tweet, "status": "draft"})
        for post in data.get("linkedin", []):
            pieces.append({"type": "linkedin", "content": post, "status": "draft"})
        email = data.get("email", {})
        if email:
            pieces.append({"type": "email", "content": json.dumps(email), "status": "draft"})

        for piece in pieces:
            sb.table("task_queue").insert({
                "from_agent": "content",
                "to_agent": "publish",
                "task_type": piece["type"],
                "payload": {"content": piece["content"]},
                "status": "pending",
                "priority": 5,
            }).execute()

        duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        await log_agent_run("content", "success", f"Created {len(pieces)} content pieces", duration_ms=duration_ms)
        print(f"[Content] Done — {len(pieces)} pieces saved")

    except Exception as e:
        print(f"[Content] Failed: {e}")
        await log_agent_run("content", "failed", str(e), duration_ms=0)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
