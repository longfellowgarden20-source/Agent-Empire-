"""
Real Estate Scout — Tier 4 Market.
Tavily search for real estate listings, permit filings, neighborhood trends.
Writes opportunities to oracle_intelligence category='real_estate'. Daily.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

RE_QUERIES = [
    "real estate investment opportunity undervalued market 2026",
    "commercial real estate vacancy distressed properties",
    "permit filings construction activity growing neighborhood",
    "rental yield cap rate opportunity multifamily 2026",
]

SCOUT_PROMPT = """You are a real estate intelligence analyst. Review these market signals and identify investment opportunities.

Signals:
{signals}

Identify the top 3 opportunities. For each return:
- Location/market
- Opportunity type (flip, rental, commercial, land)
- Why it's an opportunity
- Risk level

Return JSON:
{{
  "opportunities": [
    {{
      "market": "<city/region>",
      "type": "<opportunity type>",
      "signal": "<what triggered this>",
      "thesis": "<why it's an opportunity>",
      "risk": "<LOW|MEDIUM|HIGH>",
      "score": <1-10>
    }}
  ],
  "macro_theme": "<overarching real estate trend>",
  "best_opportunity": "<one sentence>"
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[RealEstateScout] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    batches = await asyncio.gather(*[live_search(q, max_results=5) for q in RE_QUERIES])

    signals_text = ""
    for batch in batches:
        for r in batch:
            signals_text += f"\n[{r.get('title', '')}]\n{r.get('content', '')[:300]}\n"

    raw = await agent_llm(
        SCOUT_PROMPT.format(signals=signals_text[:3000]),
        max_tokens=600,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
    except Exception:
        result = {"opportunities": [], "best_opportunity": signals_text[:200]}

    for opp in result.get("opportunities", []):
        supabase.table("oracle_intelligence").insert({
            "category": "real_estate",
            "ticker_or_topic": opp.get("market", ""),
            "summary": f"{'BULLISH' if opp.get('risk') == 'LOW' else 'NEUTRAL'} — {opp.get('thesis', '')}",
            "raw_data": opp,
            "relevance_score": opp.get("score", 5),
        }).execute()

    opp_count = len(result.get("opportunities", []))
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("real_estate_scout", "success", f"Found {opp_count} opportunities. {result.get('best_opportunity', '')}", duration_ms=duration_ms)
    print(f"[RealEstateScout] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
