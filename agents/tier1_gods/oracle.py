"""
Oracle — Tier 1 God agent.
Reads everything happening in the world right now.
Runs every 30 min during market hours, every 2 hours otherwise.
Writes to oracle_intelligence table. All other agents read from here first.
"""
import asyncio
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from shared.skills.search_skills import live_search, deep_research
from shared.skills.llm_skills import fast_llm
from shared.skills.memory_skills import save_to_memory, get_from_memory
from shared.skills.scoring_skills import log_agent_run

ET = ZoneInfo("America/New_York")

CATEGORIES = [
    {
        "category": "market",
        "query": "stock market news today S&P 500 NASDAQ major movers",
        "deep": False,
    },
    {
        "category": "macro",
        "query": "Federal Reserve interest rates inflation CPI jobs data economic news today",
        "deep": True,
    },
    {
        "category": "trend",
        "query": "trending business opportunities AI SaaS tools viral products 2026",
        "deep": False,
    },
    {
        "category": "news",
        "query": "breaking business technology news today",
        "deep": False,
    },
    {
        "category": "competitor",
        "query": "AI agent platforms autonomous business software new launches funding 2026",
        "deep": False,
    },
]


def is_market_hours() -> bool:
    now = datetime.now(ET)
    return (
        now.weekday() < 5
        and (now.hour > 9 or (now.hour == 9 and now.minute >= 30))
        and now.hour < 16
    )


async def fetch_category(cat: dict) -> dict:
    try:
        if cat["deep"]:
            raw = await deep_research(cat["query"])
            summary = await fast_llm(
                f"Summarize this into 2-3 actionable sentences for an AI business empire operator:\n\n{raw}",
                system="You are a concise intelligence briefer. Be specific, cite numbers when available.",
                max_tokens=200,
            )
            return {
                "category": cat["category"],
                "summary": summary,
                "raw_data": {"content": raw},
                "source_urls": [],
                "relevance_score": 8,
            }
        else:
            results = await live_search(cat["query"], max_results=5)
            combined = "\n\n".join(
                f"[{r.get('title', '')}] {r.get('content', '')}" for r in results
            )
            summary = await fast_llm(
                f"Summarize the most important intelligence from these results in 2-3 sentences:\n\n{combined}",
                system="You are a concise intelligence briefer. Be specific, cite numbers when available.",
                max_tokens=200,
            )
            urls = [r.get("url", "") for r in results if r.get("url")]
            return {
                "category": cat["category"],
                "summary": summary,
                "raw_data": {"results": results},
                "source_urls": urls,
                "relevance_score": 7,
            }
    except Exception as e:
        print(f"[Oracle] Failed category {cat['category']}: {e}")
        return None


async def run():
    start = datetime.now(timezone.utc)
    print(f"[Oracle] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    # fetch all categories concurrently
    results = await asyncio.gather(*[fetch_category(c) for c in CATEGORIES])
    results = [r for r in results if r is not None]

    # write to oracle_intelligence
    rows = []
    for r in results:
        rows.append({
            "category": r["category"],
            "summary": r["summary"],
            "raw_data": r["raw_data"],
            "source_urls": r["source_urls"],
            "relevance_score": r["relevance_score"],
            "ticker_or_topic": r["category"],
        })

    if rows:
        supabase.table("oracle_intelligence").insert(rows).execute()
        print(f"[Oracle] Wrote {len(rows)} intelligence rows")

    # save last run time to memory
    await save_to_memory("oracle", "last_run", start.isoformat())
    await save_to_memory("oracle", "is_market_hours", is_market_hours())

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("oracle", "success", f"Wrote {len(rows)} intel rows", duration_ms=duration_ms)
    print(f"[Oracle] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
