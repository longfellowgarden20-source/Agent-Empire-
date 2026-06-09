"""
Competitor Tracker — Tier 4 Market.
Reads businesses table for competitor_urls in metadata.
Tavily search each competitor for price changes, new features, funding.
Writes to oracle_intelligence category='competitor'. Daily.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

COMPETITOR_PROMPT = """Analyze these competitor signals and identify threats and opportunities.

Company: {company_name}
Competitor: {competitor}

Recent signals:
{signals}

Return JSON:
{{
  "competitor": "{competitor}",
  "change_detected": <true/false>,
  "change_type": "<PRICING|FEATURE|FUNDING|PIVOT|NONE>",
  "threat_level": "<LOW|MEDIUM|HIGH>",
  "summary": "<one sentence>",
  "recommended_response": "<one sentence or null>"
}}"""


async def track_competitor(company_name: str, competitor_url: str, supabase) -> dict | None:
    queries = [
        f"site:{competitor_url} OR \"{competitor_url}\" news pricing features 2026",
        f"{competitor_url} funding announcement new product launch",
    ]
    batches = await asyncio.gather(*[live_search(q, max_results=4) for q in queries])

    signals_text = ""
    for batch in batches:
        for r in batch:
            signals_text += f"\n[{r.get('title', '')}]\n{r.get('content', '')[:250]}\n"

    if not signals_text.strip():
        return None

    raw = await fast_llm(
        COMPETITOR_PROMPT.format(
            company_name=company_name,
            competitor=competitor_url,
            signals=signals_text[:2000],
        ),
        max_tokens=250,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except Exception:
        return None


async def run():
    start = datetime.now(timezone.utc)
    print(f"[CompetitorTracker] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    businesses = supabase.table("businesses").select("id, name, metadata").eq("active", True).execute()
    if not businesses.data:
        print("[CompetitorTracker] No active businesses")
        await log_agent_run("competitor_tracker", "skipped", "No businesses", duration_ms=0)
        return

    tasks = []
    for b in businesses.data:
        metadata = b.get("metadata") or {}
        competitor_urls = metadata.get("competitor_urls", [])
        for url in competitor_urls[:3]:  # max 3 competitors per business
            tasks.append((b.get("name", b["id"]), url))

    if not tasks:
        print("[CompetitorTracker] No competitor URLs configured")
        await log_agent_run("competitor_tracker", "skipped", "No competitor URLs", duration_ms=0)
        return

    print(f"[CompetitorTracker] Tracking {len(tasks)} competitors")

    results = await asyncio.gather(*[track_competitor(name, url, supabase) for name, url in tasks])

    changes_found = 0
    for result in results:
        if result is None:
            continue
        if result.get("change_detected"):
            changes_found += 1
            supabase.table("oracle_intelligence").insert({
                "category": "competitor",
                "source_agent": "competitor_tracker",
                "headline": result.get("summary", ""),
                "sentiment": "BEARISH" if result.get("threat_level") == "HIGH" else "NEUTRAL",
                "data": result,
                "confidence": 7 if result.get("threat_level") == "HIGH" else 5,
            }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("competitor_tracker", "success", f"Tracked {len(tasks)} competitors, {changes_found} changes detected", duration_ms=duration_ms)
    print(f"[CompetitorTracker] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
