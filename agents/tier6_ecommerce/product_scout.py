"""
Product Scout — Tier 6 Ecommerce.
Tavily search for trending products on TikTok Shop, Amazon BSR, Google Trends.
Score each 1-10. Write 8+ to oracle_intelligence category='product'. Daily.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

PRODUCT_QUERIES = [
    "tiktok shop trending products viral 2026",
    "amazon best sellers rising products BSR today",
    "google trends rising products shopping queries",
    "dropshipping trending products high margin 2026",
    "ecommerce winning products facebook ads 2026",
]

SCORE_PROMPT = """Score these products for ecommerce opportunity.

Products found:
{products}

For each product, score 1-10 based on:
- Trend momentum (is it accelerating?)
- Margin potential (low cost, high perceived value?)
- Competition level (not saturated yet?)
- Impulse buy factor (easy sell?)

Return JSON array (only products scoring 8+):
[
  {{
    "product_name": "<name>",
    "category": "<category>",
    "source_platform": "<tiktok|amazon|google|other>",
    "score": <8-10>,
    "trend_momentum": "<why it's trending>",
    "estimated_margin": "<low|medium|high>",
    "competition": "<low|medium|high>",
    "sell_angle": "<how to position it>",
    "sourcing_hint": "<where to source>"
  }}
]
Return ONLY valid JSON array. No other text."""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[ProductScout] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    batches = await asyncio.gather(*[live_search(q, max_results=6) for q in PRODUCT_QUERIES])

    products_raw = ""
    for batch in batches:
        for r in batch:
            products_raw += f"\n- {r.get('title', '')}: {r.get('content', '')[:200]}\n"

    raw = await fast_llm(
        SCORE_PROMPT.format(products=products_raw[:3000]),
        max_tokens=600,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        products = json.loads(cleaned)
        if not isinstance(products, list):
            products = []
    except Exception:
        products = []

    saved_count = 0
    for product in products:
        if product.get("score", 0) >= 8:
            supabase.table("oracle_intelligence").insert({
                "category": "product",
                "ticker_or_topic": product.get("product_name", ""),
                "summary": f"BULLISH — {product.get('trend_momentum', '')} — Margin: {product.get('estimated_margin', '')}",
                "raw_data": product,
                "relevance_score": product.get("score", 8),
            }).execute()

            # trigger listing agent
            supabase.table("task_queue").insert({
                "from_agent": "product_scout",
                "to_agent": "listing_agent",
                "task_type": "write_listing",
                "payload": {"product": product},
                "priority": product.get("score", 8),
                "status": "pending",
            }).execute()

            saved_count += 1

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("product_scout", "success", f"Found {saved_count} products scoring 8+", duration_ms=duration_ms)
    print(f"[ProductScout] Done in {duration_ms}ms — {saved_count} products")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
