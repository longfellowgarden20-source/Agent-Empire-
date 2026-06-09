"""
Pricing Agent — Tier 6 Ecommerce.
Reads businesses table for product_urls. Tavily search competitor prices.
Recommends price adjustments. Writes to chairman_queue if margin at risk.
Every 2 hours.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

PRICING_PROMPT = """Analyze competitor pricing and recommend price adjustments.

Our product: {product_name}
Our current price: ${current_price}
Target margin: {target_margin}%

Competitor prices found:
{competitor_prices}

Return JSON:
{{
  "recommended_price": <float>,
  "price_change_pct": <float>,
  "action": "<RAISE|LOWER|HOLD>",
  "margin_at_risk": <true/false>,
  "reasoning": "<one sentence>",
  "urgency": "<immediate|this week|monitor>"
}}"""


async def check_product_pricing(product: dict, supabase) -> dict | None:
    product_name = product.get("product_name", "")
    current_price = float(product.get("current_price") or 0)
    target_margin = float(product.get("target_margin_pct") or 30)

    if not product_name or current_price <= 0:
        return None

    print(f"[PricingAgent] Checking pricing for: {product_name}")

    results = await live_search(f"{product_name} price buy amazon shopify 2026", max_results=6)
    competitor_prices = "\n".join([
        f"- {r.get('title', '')}: {r.get('content', '')[:150]}"
        for r in results
    ])

    raw = await fast_llm(
        PRICING_PROMPT.format(
            product_name=product_name,
            current_price=current_price,
            target_margin=target_margin,
            competitor_prices=competitor_prices or "No competitor data found",
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
    print(f"[PricingAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    businesses = supabase.table("businesses").select("id, name").neq("status", "shutdown").execute()
    if not businesses.data:
        print("[PricingAgent] No active businesses")
        await log_agent_run("pricing_agent", "skipped", "No businesses", duration_ms=0)
        return

    products_to_check = []
    for b in businesses.data:
        products = []
        for product in products:
            product["business_id"] = b["id"]
            product["business_name"] = b.get("name", "")
            products_to_check.append(product)

    if not products_to_check:
        print("[PricingAgent] No products configured")
        await log_agent_run("pricing_agent", "skipped", "No products", duration_ms=0)
        return

    print(f"[PricingAgent] Checking {len(products_to_check)} products")

    results = await asyncio.gather(*[check_product_pricing(p, supabase) for p in products_to_check])

    alerts_sent = 0
    for product, result in zip(products_to_check, results):
        if result is None:
            continue
        if result.get("margin_at_risk") or result.get("action") != "HOLD":
            priority = 8 if result.get("margin_at_risk") else 5
            supabase.table("chairman_queue").insert({
                "priority": priority,
                "message": f"[PRICING] {product.get('product_name')} — {result.get('action')} to ${result.get('recommended_price')}. {result.get('reasoning')}",
                "requires_action": result.get("margin_at_risk", False),
            }).execute()
            alerts_sent += 1

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("pricing_agent", "success", f"Checked {len(products_to_check)} products, {alerts_sent} alerts", duration_ms=duration_ms)
    print(f"[PricingAgent] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
