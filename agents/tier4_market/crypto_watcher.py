"""
Crypto Watcher — Tier 4 Market.
Tavily search for crypto whale moves, on-chain signals, narrative shifts every 30min.
Writes to oracle_intelligence table category='crypto'.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

CRYPTO_QUERIES = [
    "crypto whale wallet moves large transactions today",
    "bitcoin ethereum altcoin narrative shift trending 2026",
    "on-chain signals defi tvl stablecoin flows today",
    "crypto exchange inflows outflows funding rates",
]

SIGNAL_PROMPT = """Analyze these crypto market signals and extract actionable intelligence.

Raw signals:
{signals}

Return JSON:
{{
  "top_signal": "<most important development in one sentence>",
  "sentiment": "<BULLISH|BEARISH|NEUTRAL|VOLATILE>",
  "key_assets": ["<asset1>", "<asset2>"],
  "whale_activity": "<summary or null>",
  "narrative": "<dominant narrative>",
  "actionable": "<what to watch or do>",
  "confidence": <1-10>
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[CryptoWatcher] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    batches = await asyncio.gather(*[live_search(q, max_results=5) for q in CRYPTO_QUERIES])

    signals_text = ""
    for batch in batches:
        for r in batch:
            signals_text += f"\n[{r.get('title', '')}]\n{r.get('content', '')[:300]}\n"

    raw = await fast_llm(
        SIGNAL_PROMPT.format(signals=signals_text[:3000]),
        max_tokens=300,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        intel = json.loads(cleaned)
    except Exception:
        intel = {"top_signal": signals_text[:200], "sentiment": "NEUTRAL", "confidence": 3}

    supabase.table("oracle_intelligence").insert({
        "category": "crypto",
        "ticker_or_topic": intel.get("top_signal", ""),
        "summary": f"{intel.get('sentiment', 'NEUTRAL')} — {intel.get('narrative', '')} — {intel.get('actionable', '')}",
        "raw_data": intel,
        "relevance_score": intel.get("confidence", 5),
    }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("crypto_watcher", "success", intel.get("top_signal", "Done"), duration_ms=duration_ms)
    print(f"[CryptoWatcher] Done in {duration_ms}ms — {intel.get('sentiment')}")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
