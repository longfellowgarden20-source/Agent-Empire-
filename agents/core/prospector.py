"""Prospector — finds leads, researches them, queues for outreach. One Groq call."""
import asyncio, os, json
from datetime import datetime, timezone
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run

PROMPT = """You are a B2B sales prospector for an AI automation agency.

Generate 8 realistic potential client companies that would pay for AI automation services.
Target: small-to-mid businesses spending too much time on repetitive tasks.

Return ONLY valid JSON array (no markdown):
[
  {
    "company_name": "...",
    "website": "https://...",
    "industry": "...",
    "score": <6-10>,
    "pain_points": ["...", "..."],
    "decision_maker_title": "...",
    "reasoning": "One sentence why they'd buy"
  }
]"""


async def run():
    start = datetime.now(timezone.utc)
    print("[Prospector] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    try:
        raw = await groq_llm(PROMPT, max_tokens=1500)
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        prospects = json.loads(cleaned)

        if not isinstance(prospects, list):
            prospects = []

        qualified = [p for p in prospects if isinstance(p.get("score"), (int, float)) and p["score"] >= 7]
        print(f"[Prospector] {len(qualified)} qualified prospects")

        for p in qualified:
            result = sb.table("prospects").insert({
                "company_name": p.get("company_name", "Unknown"),
                "website": p.get("website", ""),
                "industry": p.get("industry", ""),
                "score": int(p.get("score", 7)),
                "outreach_status": "new",
                "intel": {
                    "pain_points": p.get("pain_points", []),
                    "decision_maker_title": p.get("decision_maker_title", ""),
                    "reasoning": p.get("reasoning", ""),
                },
            }).execute()

            if result.data:
                sb.table("task_queue").insert({
                    "from_agent": "prospector",
                    "to_agent": "closer",
                    "task_type": "write_outreach",
                    "payload": {"prospect_id": result.data[0]["id"]},
                    "priority": int(p.get("score", 7)),
                    "status": "pending",
                }).execute()

        duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        await log_agent_run("prospector", "success", f"{len(qualified)} prospects queued", duration_ms=duration_ms)
        print(f"[Prospector] Done")

    except Exception as e:
        print(f"[Prospector] Failed: {e}")
        await log_agent_run("prospector", "failed", str(e), duration_ms=0)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
