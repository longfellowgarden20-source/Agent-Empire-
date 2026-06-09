"""
Trend Surfer — Tier 4 Market.
Tavily search Reddit/Twitter/TikTok for what's going viral.
Score virality 1-10. Write to oracle_intelligence category='trend'. Every hour.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

TREND_QUERIES = [
    "trending viral reddit today 2026",
    "twitter X trending topics right now",
    "tiktok viral trend going viral today",
    "google trends rising searches today",
]

TREND_PROMPT = """You are a trend intelligence analyst. Score these viral signals for business opportunity.

Signals:
{signals}

Identify top 5 trends. For each:
- What's trending
- Why it's gaining momentum
- Business opportunity (product, content, service)
- Virality score 1-10

Return JSON:
{{
  "trends": [
    {{
      "topic": "<trend name>",
      "platform": "<reddit|twitter|tiktok|google>",
      "momentum": "<why it's growing>",
      "opportunity": "<business angle>",
      "virality_score": <1-10>,
      "window": "<hours|days|weeks>"
    }}
  ],
  "top_trend": "<single best trend>",
  "action": "<what to do with this>"
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[TrendSurfer] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    batches = await asyncio.gather(*[live_search(q, max_results=5) for q in TREND_QUERIES])

    signals_text = ""
    for batch in batches:
        for r in batch:
            signals_text += f"\n[{r.get('title', '')}]\n{r.get('content', '')[:250]}\n"

    raw = await fast_llm(
        TREND_PROMPT.format(signals=signals_text[:2500]),
        max_tokens=400,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
    except Exception:
        result = {"trends": [], "top_trend": signals_text[:100]}

    for trend in result.get("trends", []):
        if trend.get("virality_score", 0) >= 8:
            supabase.table("oracle_intelligence").insert({
                "category": "trend",
                "source_agent": "trend_surfer",
                "headline": trend.get("topic", ""),
                "sentiment": "BULLISH",
                "data": trend,
                "confidence": trend.get("virality_score", 5),
            }).execute()

    top_trends = [t for t in result.get("trends", []) if t.get("virality_score", 0) >= 8]
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("trend_surfer", "success", f"Found {len(top_trends)} viral trends (8+). Top: {result.get('top_trend', '')}", duration_ms=duration_ms)
    print(f"[TrendSurfer] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
