"""
Listing Agent — Tier 6 Ecommerce.
Reads product_scout output from oracle_intelligence.
Writes optimized Amazon/Shopify listing (title, bullets, description).
Triggered by product_scout.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

LISTING_PROMPT = """Write an optimized Amazon product listing for this product.

Product: {product_name}
Category: {category}
Trend angle: {trend_momentum}
Sell angle: {sell_angle}

Write:
1. Title (max 200 chars, keyword-rich, no ALL CAPS)
2. 5 bullet points (start each with CAPS benefit word, max 200 chars each)
3. Product description (300-400 words, story-driven, benefits-focused)
4. Backend keywords (comma-separated, 250 bytes max)

Return JSON:
{{
  "title": "<title>",
  "bullets": ["<bullet1>", "<bullet2>", "<bullet3>", "<bullet4>", "<bullet5>"],
  "description": "<description>",
  "backend_keywords": "<keywords>",
  "suggested_price_range": "<$X-$Y>",
  "shopify_meta_description": "<155 chars>"
}}"""


async def write_listing(task: dict, supabase) -> bool:
    payload = task.get("payload", {})
    product = payload.get("product", {})

    product_name = product.get("product_name", "")
    print(f"[ListingAgent] Writing listing for: {product_name}")

    raw = await agent_llm(
        LISTING_PROMPT.format(
            product_name=product_name,
            category=product.get("category", "general"),
            trend_momentum=product.get("trend_momentum", ""),
            sell_angle=product.get("sell_angle", ""),
        ),
        max_tokens=800,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        listing = json.loads(cleaned)
    except Exception as e:
        print(f"[ListingAgent] Parse error: {e}")
        return False

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    result = supabase.table("agent_memory").insert({
        "agent": "listing_agent",
        "key": f"listing_{ts}",
        "value": {
            **listing,
            "product_name": product_name,
            "product_data": product,
            "written_at": datetime.now(timezone.utc).isoformat(),
        },
    }).execute()

    memory_id = result.data[0]["id"] if result.data else None

    # trigger ad agent
    if memory_id:
        supabase.table("task_queue").insert({
            "from_agent": "listing_agent",
            "to_agent": "ad_agent",
            "task_type": "write_ads",
            "payload": {"memory_id": memory_id, "product_name": product_name, "listing": listing},
            "priority": task.get("priority", 7),
            "status": "pending",
        }).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[ListingAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    tasks = supabase.table("task_queue").select("*").eq("to_agent", "listing_agent").eq("status", "pending").order("priority", desc=True).limit(10).execute()
    if not tasks.data:
        print("[ListingAgent] No tasks in queue")
        await log_agent_run("listing_agent", "skipped", "No tasks", duration_ms=0)
        return

    task_ids = [t["id"] for t in tasks.data]
    supabase.table("task_queue").update({"status": "in_progress", "picked_up_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    results = await asyncio.gather(*[write_listing(t, supabase) for t in tasks.data])

    supabase.table("task_queue").update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    success_count = sum(1 for r in results if r)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("listing_agent", "success", f"Wrote {success_count} listings", duration_ms=duration_ms)
    print(f"[ListingAgent] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
