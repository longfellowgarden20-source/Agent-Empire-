"""
Ad Agent — Tier 6 Ecommerce.
Reads listing_agent output from agent_memory.
Writes 3 Facebook ad copy variants + 3 Google ad variants.
Daily.
"""
import asyncio
import os
import json
from datetime import datetime, timezone, timedelta

from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

AD_PROMPT = """Write ad copy for this product. Create conversion-focused variants.

Product: {product_name}
Listing title: {listing_title}
Key bullets: {bullets}
Sell angle: {sell_angle}

Write:
1. THREE Facebook/Instagram ad variants (each: headline 40 chars, primary text 125 chars, description 25 chars)
2. THREE Google Search ad variants (each: headline1 30 chars, headline2 30 chars, description 90 chars)

Different angles: scarcity, social proof, transformation

Return JSON:
{{
  "facebook_ads": [
    {{"headline": "<40 chars>", "primary_text": "<125 chars>", "description": "<25 chars>", "angle": "<scarcity|social_proof|transformation>"}}
  ],
  "google_ads": [
    {{"headline1": "<30 chars>", "headline2": "<30 chars>", "description": "<90 chars>", "angle": "<>"}}
  ]
}}"""


async def write_ads(task: dict, supabase) -> bool:
    payload = task.get("payload", {})
    memory_id = payload.get("memory_id")
    product_name = payload.get("product_name", "")
    listing = payload.get("listing", {})

    print(f"[AdAgent] Writing ads for: {product_name}")

    bullets_text = "\n".join(listing.get("bullets", [])[:3])

    raw = await agent_llm(
        AD_PROMPT.format(
            product_name=product_name,
            listing_title=listing.get("title", product_name),
            bullets=bullets_text,
            sell_angle=listing.get("shopify_meta_description", ""),
        ),
        max_tokens=800,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        ads = json.loads(cleaned)
    except Exception as e:
        print(f"[AdAgent] Parse error: {e}")
        return False

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    supabase.table("agent_memory").insert({
        "agent": "ad_agent",
        "key": f"ads_{ts}",
        "value": {
            **ads,
            "product_name": product_name,
            "source_memory_id": memory_id,
            "written_at": datetime.now(timezone.utc).isoformat(),
        },
    }).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[AdAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    tasks = supabase.table("task_queue").select("*").eq("to_agent", "ad_agent").eq("status", "pending").order("priority", desc=True).limit(10).execute()
    if not tasks.data:
        # also check agent_memory for recent listings without ads
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        listings = (
            supabase.table("agent_memory")
            .select("*")
            .eq("agent", "listing_agent")
            .gte("created_at", cutoff)
            .limit(5)
            .execute()
        )
        if not listings.data:
            print("[AdAgent] No tasks or recent listings")
            await log_agent_run("ad_agent", "skipped", "No tasks", duration_ms=0)
            return

        # synthesize tasks from listings
        tasks_data = [
            {
                "id": None,
                "payload": {
                    "memory_id": l["id"],
                    "product_name": l.get("value", {}).get("product_name", ""),
                    "listing": l.get("value", {}),
                },
                "priority": 7,
            }
            for l in listings.data
        ]
    else:
        task_ids = [t["id"] for t in tasks.data]
        supabase.table("task_queue").update({"status": "in_progress", "picked_up_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()
        tasks_data = tasks.data

    results = await asyncio.gather(*[write_ads(t, supabase) for t in tasks_data])

    if tasks.data:
        supabase.table("task_queue").update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}).in_("id", [t["id"] for t in tasks.data]).execute()

    success_count = sum(1 for r in results if r)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("ad_agent", "success", f"Wrote ads for {success_count} products", duration_ms=duration_ms)
    print(f"[AdAgent] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
