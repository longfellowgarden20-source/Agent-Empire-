"""Idea Hunter — generates 8 business ideas every run, saves to DB."""
import asyncio
import os
import json
from datetime import datetime, timezone
from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

IDEA_PROMPT = """Generate 8 high-quality AI-automatable business ideas that could make money within 30 days.

Focus on:
- Real problems people are actively paying to solve
- SaaS, automation, lead gen, content, ecommerce
- Ideas where AI agents do 90%+ of the work
- Revenue model that's clear

Return ONLY valid JSON array (no markdown fences):
[
  {
    "title": "Idea name",
    "description": "2-3 sentences on problem and solution",
    "score": <6-10>,
    "market_size": "<small|medium|large>",
    "reasoning": "One sentence why this makes money",
    "revenue_model": "How we charge",
    "source": "llm_generated"
  }
]"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[IdeaHunter] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    try:
        raw = await fast_llm(IDEA_PROMPT, max_tokens=2000)
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        ideas = json.loads(cleaned)

        if not isinstance(ideas, list):
            ideas = []

        winners = [i for i in ideas if isinstance(i.get("score"), (int, float)) and i["score"] >= 6]
        print(f"[IdeaHunter] Generated {len(winners)} ideas")

        for idea in winners:
            sb.table("ideas").insert({
                "title": idea.get("title", "Untitled"),
                "description": idea.get("description", ""),
                "source": idea.get("source", "llm"),
                "raw_score": int(idea.get("score", 6) * 10),
                "status": "raw",
                "market_data": {
                    "market_size": idea.get("market_size"),
                    "reasoning": idea.get("reasoning"),
                    "revenue_model": idea.get("revenue_model"),
                },
            }).execute()

        if winners:
            top = max(winners, key=lambda x: x.get("score", 0))
            sb.table("chairman_queue").insert({
                "message": f"💡 {len(winners)} ideas. Top: {top['title']} ({top.get('score')}/10)",
                "priority": 6,
                "requires_action": False,
            }).execute()

        duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        await log_agent_run("idea_hunter", "success", f"Found {len(winners)} ideas", duration_ms=duration_ms)

    except Exception as e:
        print(f"[IdeaHunter] Failed: {e}")
        await log_agent_run("idea_hunter", "failed", str(e), duration_ms=0)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
