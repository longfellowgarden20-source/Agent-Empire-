"""
Prospector — Tier 3 Revenue.
Finds 50 qualified potential clients every day. Scores each 1-10. Only passes 7+ forward.
Runs daily 9am ET weekdays.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

TARGET_INDUSTRIES = [
    "e-commerce stores doing $1M-$50M revenue",
    "SaaS companies seed to series A",
]

SCORE_PROMPT = """Score this prospect as a potential client for an AI automation agency.
Company: {company}
Website: {website}
Context: {context}

Score 1-10 based on:
- Budget signals (size, funding, revenue)
- Pain points that AI can solve
- Decision maker accessibility
- Industry fit

Respond ONLY with JSON:
{{
  "score": <1-10>,
  "industry": "<industry>",
  "pain_points": ["<pain1>", "<pain2>"],
  "decision_maker_title": "<likely title>",
  "reasoning": "<one sentence>"
}}"""


async def find_prospects_for_industry(industry: str) -> list[dict]:
    query = f"company {industry} website contact hiring 2026"
    try:
        results = await live_search(query, max_results=3)
        prospects = []
        for r in results:
            if r.get("url") and r.get("title"):
                prospects.append({
                    "company_name": r.get("title", "").split(" - ")[0].split(" | ")[0][:60],
                    "website": r.get("url", ""),
                    "industry": industry,
                    "context": r.get("content", "")[:400],
                })
        return prospects
    except Exception as e:
        print(f"[Prospector] Failed industry '{industry}': {e}")
        return []


async def score_prospect(prospect: dict) -> dict | None:
    try:
        raw = await fast_llm(
            SCORE_PROMPT.format(
                company=prospect["company_name"],
                website=prospect["website"],
                context=prospect["context"],
            ),
            max_tokens=200,
        )
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(cleaned)
        prospect.update(data)
        return prospect
    except Exception:
        return None


async def run():
    start = datetime.now(timezone.utc)
    print(f"[Prospector] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    # find prospects across all industries concurrently
    batches = await asyncio.gather(*[find_prospects_for_industry(ind) for ind in TARGET_INDUSTRIES])
    all_prospects = [p for batch in batches for p in batch]
    print(f"[Prospector] Found {len(all_prospects)} raw prospects")

    # score all concurrently
    scored = await asyncio.gather(*[score_prospect(p) for p in all_prospects])
    scored = [s for s in scored if s is not None]

    # only pass 7+ to Researcher
    qualified = [s for s in scored if isinstance(s.get("score"), (int, float)) and s["score"] >= 7]
    print(f"[Prospector] {len(qualified)} prospects scored 7+")

    for p in qualified:
        # write to prospects table
        result = supabase.table("prospects").insert({
            "company_name": p["company_name"],
            "website": p["website"],
            "industry": p.get("industry", ""),
            "score": int(p.get("score", 0)),
            "outreach_status": "new",
            "intel": {
                "pain_points": p.get("pain_points", []),
                "decision_maker_title": p.get("decision_maker_title", ""),
                "reasoning": p.get("reasoning", ""),
            },
        }).execute()

        if result.data:
            prospect_id = result.data[0]["id"]
            # route to Researcher
            supabase.table("task_queue").insert({
                "from_agent": "prospector",
                "to_agent": "researcher",
                "task_type": "research_prospect",
                "payload": {"prospect_id": prospect_id},
                "priority": int(p.get("score", 7)),
                "status": "pending",
            }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("prospector", "success", f"Qualified {len(qualified)} prospects", duration_ms=duration_ms)
    print(f"[Prospector] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
