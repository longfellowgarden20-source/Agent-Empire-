"""
Web Crawler — Tier 7 Intelligence.
Reads crawl_targets from agent_memory. For each URL uses httpx to fetch page.
Extracts text. Saves structured data to oracle_intelligence.
Per-target schedule.
"""
import asyncio
import os
import json
import re
from datetime import datetime, timezone

import httpx

from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

EXTRACT_PROMPT = """Extract the key intelligence from this web page.

URL: {url}
Page content: {content}

Extract:
1. Main topic / what the page is about
2. Key data points (numbers, dates, names)
3. Sentiment (positive/negative/neutral)
4. Any signals relevant to business or markets

Return JSON:
{{
  "topic": "<main topic>",
  "key_facts": ["<fact1>", "<fact2>", "<fact3>"],
  "sentiment": "<POSITIVE|NEGATIVE|NEUTRAL>",
  "signals": "<business-relevant intelligence>",
  "freshness": "<how current this data appears>",
  "confidence": <1-10>
}}"""


def extract_text_from_html(html: str) -> str:
    # strip script/style tags
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
    # strip remaining tags
    text = re.sub(r'<[^>]+>', ' ', html)
    # collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:4000]


async def crawl_target(target: dict, supabase) -> bool:
    url = target.get("url", "")
    category = target.get("category", "general")

    if not url:
        return False

    print(f"[WebCrawler] Crawling: {url}")

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            response = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; AgentEmpireBot/1.0)"})
            response.raise_for_status()
            html = response.text
    except Exception as e:
        print(f"[WebCrawler] Fetch failed for {url}: {e}")
        supabase.table("task_queue").insert({
            "from_agent": "web_crawler",
            "to_agent": "dlq",
            "task_type": "dlq",
            "payload": {"url": url, "error": str(e)},
            "priority": 1,
            "status": "failed",
        }).execute()
        return False

    text = extract_text_from_html(html)

    raw = await fast_llm(
        EXTRACT_PROMPT.format(url=url, content=text[:2500]),
        max_tokens=300,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        intel = json.loads(cleaned)
    except Exception:
        intel = {"topic": url, "signals": text[:200], "sentiment": "NEUTRAL", "confidence": 3}

    supabase.table("oracle_intelligence").insert({
        "category": category,
        "source_agent": "web_crawler",
        "headline": intel.get("topic", ""),
        "sentiment": intel.get("sentiment", "NEUTRAL"),
        "data": {**intel, "source_url": url, "crawled_at": datetime.now(timezone.utc).isoformat()},
        "confidence": intel.get("confidence", 5),
    }).execute()

    # update last_crawled in agent_memory
    supabase.table("agent_memory").update({
        "value": {**target, "last_crawled_at": datetime.now(timezone.utc).isoformat()},
    }).eq("id", target.get("memory_id")).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[WebCrawler] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    # read crawl targets from agent_memory
    targets_rows = supabase.table("agent_memory").select("id, value").eq("agent", "web_crawler").execute()
    if not targets_rows.data:
        print("[WebCrawler] No crawl targets configured")
        await log_agent_run("web_crawler", "skipped", "No targets", duration_ms=0)
        return

    targets = []
    for row in targets_rows.data:
        value = row.get("value") or {}
        if isinstance(value, list):
            for t in value:
                t["memory_id"] = row["id"]
                targets.append(t)
        elif isinstance(value, dict) and value.get("url"):
            value["memory_id"] = row["id"]
            targets.append(value)

    if not targets:
        print("[WebCrawler] No valid URLs in targets")
        await log_agent_run("web_crawler", "skipped", "No valid URLs", duration_ms=0)
        return

    print(f"[WebCrawler] Crawling {len(targets)} targets")

    # crawl sequentially to be polite
    success_count = 0
    for target in targets:
        ok = await crawl_target(target, supabase)
        if ok:
            success_count += 1
        await asyncio.sleep(1)  # rate limit

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("web_crawler", "success", f"Crawled {success_count}/{len(targets)} targets", duration_ms=duration_ms)
    print(f"[WebCrawler] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
