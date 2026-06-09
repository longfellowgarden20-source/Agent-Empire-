"""
Macro Watcher — Tier 4 Market.
Tavily search for Fed decisions, inflation data, jobs data, geopolitical events.
Writes to oracle_intelligence category='macro'. Every 2 hours on weekdays.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

MACRO_QUERIES = [
    "Federal Reserve interest rate decision statement today",
    "inflation CPI PPI data release today 2026",
    "jobs report unemployment nonfarm payrolls today",
    "geopolitical risk market impact today",
    "treasury yield curve economic data today",
]

MACRO_PROMPT = """You are a macro economic analyst. Extract the most market-relevant signals.

Raw data:
{signals}

Return JSON:
{{
  "headline_event": "<most important macro event today>",
  "market_impact": "<RISK_ON|RISK_OFF|NEUTRAL>",
  "fed_stance": "<HAWKISH|DOVISH|NEUTRAL|N/A>",
  "key_data": ["<data point 1>", "<data point 2>"],
  "geopolitical_risk": "<LOW|MEDIUM|HIGH>",
  "sectors_affected": ["<sector1>", "<sector2>"],
  "summary": "<two sentences>",
  "confidence": <1-10>
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[MacroWatcher] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    batches = await asyncio.gather(*[live_search(q, max_results=4) for q in MACRO_QUERIES])

    signals_text = ""
    for batch in batches:
        for r in batch:
            signals_text += f"\n[{r.get('title', '')}]\n{r.get('content', '')[:250]}\n"

    raw = await fast_llm(
        MACRO_PROMPT.format(signals=signals_text[:3000]),
        max_tokens=350,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        intel = json.loads(cleaned)
    except Exception:
        intel = {"headline_event": signals_text[:150], "market_impact": "NEUTRAL", "confidence": 4}

    supabase.table("oracle_intelligence").insert({
        "category": "macro",
        "source_agent": "macro_watcher",
        "headline": intel.get("headline_event", ""),
        "sentiment": intel.get("market_impact", "NEUTRAL"),
        "data": intel,
        "confidence": intel.get("confidence", 5),
    }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("macro_watcher", "success", intel.get("summary", intel.get("headline_event", "Done")), duration_ms=duration_ms)
    print(f"[MacroWatcher] Done in {duration_ms}ms — {intel.get('market_impact')}")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
