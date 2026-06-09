"""
News Aggregator — Tier 7 Intelligence.
Pulls from 50+ sources every 15 minutes.
Classifies, scores relevance, routes to right tables.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import fast_llm, cheap_llm
from shared.skills.scoring_skills import log_agent_run

NEWS_SOURCES = [
    {"topic": "AI & Tech", "query": "artificial intelligence agents automation news today site:techcrunch.com OR site:theverge.com OR site:wired.com"},
    {"topic": "Markets", "query": "stock market S&P NASDAQ crypto news today site:reuters.com OR site:bloomberg.com OR site:marketwatch.com"},
    {"topic": "Startups", "query": "startup funding venture capital new product launch site:techcrunch.com OR site:crunchbase.com"},
    {"topic": "Ecommerce", "query": "ecommerce Amazon Shopify TikTok shop trends news site:retaildive.com OR site:modernretail.co"},
    {"topic": "Regulation", "query": "AI regulation policy FTC SEC business law news today"},
    {"topic": "Macro", "query": "Federal Reserve inflation unemployment GDP economic data today"},
]

CLASSIFY_PROMPT = """Classify this news item for an AI business empire.
Title: {title}
Content: {content}

Respond ONLY with JSON:
{{
  "relevance": <1-10>,
  "category": "<market|ai|startup|ecommerce|regulation|macro|other>",
  "summary": "<one sentence, specific>",
  "agent_alert": "<which agent should see this, or null>"
}}"""


async def fetch_and_classify(source: dict) -> list[dict]:
    try:
        results = await live_search(source["query"], max_results=5)
        classified = []

        for r in results:
            try:
                raw = await cheap_llm(
                    CLASSIFY_PROMPT.format(
                        title=r.get("title", ""),
                        content=r.get("content", "")[:300],
                    ),
                    max_tokens=150,
                )
                cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                data = json.loads(cleaned)
                if data.get("relevance", 0) >= 6:
                    classified.append({
                        "category": data.get("category", source["topic"].lower()),
                        "ticker_or_topic": source["topic"],
                        "summary": data.get("summary", r.get("title", "")),
                        "raw_data": {"title": r.get("title"), "url": r.get("url"), "content": r.get("content", "")[:500]},
                        "source_urls": [r.get("url", "")] if r.get("url") else [],
                        "relevance_score": data.get("relevance", 6),
                        "agent_alert": data.get("agent_alert"),
                    })
            except Exception:
                continue

        return classified
    except Exception as e:
        print(f"[NewsAggregator] Failed topic {source['topic']}: {e}")
        return []


async def run():
    start = datetime.now(timezone.utc)
    print(f"[NewsAggregator] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    # fetch all sources concurrently
    batches = await asyncio.gather(*[fetch_and_classify(s) for s in NEWS_SOURCES])
    all_items = [item for batch in batches for item in batch]

    print(f"[NewsAggregator] Classified {len(all_items)} relevant items")

    if all_items:
        # write to oracle_intelligence (shared intel layer)
        rows = [{k: v for k, v in item.items() if k != "agent_alert"} for item in all_items]
        supabase.table("oracle_intelligence").insert(rows).execute()

        # route high-relevance items to task queue for specific agents
        for item in all_items:
            if item.get("agent_alert") and item.get("relevance_score", 0) >= 8:
                supabase.table("task_queue").insert({
                    "from_agent": "news_aggregator",
                    "to_agent": item["agent_alert"],
                    "task_type": "intel_alert",
                    "payload": {
                        "summary": item["summary"],
                        "category": item["category"],
                        "source_urls": item["source_urls"],
                    },
                    "priority": item["relevance_score"],
                    "status": "pending",
                }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("news_aggregator", "success", f"Processed {len(all_items)} items", duration_ms=duration_ms)
    print(f"[NewsAggregator] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
