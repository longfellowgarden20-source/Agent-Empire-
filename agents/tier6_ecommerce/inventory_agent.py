"""
Inventory Agent — Tier 6 Ecommerce.
Reads businesses table inventory_data. Flags low stock to chairman_queue.
Daily.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

LOW_STOCK_THRESHOLD = 10  # units
REORDER_THRESHOLD = 25   # units


async def run():
    start = datetime.now(timezone.utc)
    print(f"[InventoryAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    businesses = supabase.table("businesses").select("id, name, metadata").eq("active", True).execute()
    if not businesses.data:
        print("[InventoryAgent] No active businesses")
        await log_agent_run("inventory_agent", "skipped", "No businesses", duration_ms=0)
        return

    low_stock_alerts = []
    reorder_alerts = []

    for b in businesses.data:
        metadata = b.get("metadata") or {}
        inventory = metadata.get("inventory_data", [])

        for item in inventory:
            units = item.get("units_in_stock")
            if units is None:
                continue

            product_name = item.get("product_name", "unknown")
            sku = item.get("sku", "")

            if units <= LOW_STOCK_THRESHOLD:
                low_stock_alerts.append({
                    "business_id": b["id"],
                    "business_name": b.get("name", ""),
                    "product_name": product_name,
                    "sku": sku,
                    "units": units,
                    "severity": "CRITICAL" if units == 0 else "HIGH",
                })
            elif units <= REORDER_THRESHOLD:
                reorder_alerts.append({
                    "business_id": b["id"],
                    "business_name": b.get("name", ""),
                    "product_name": product_name,
                    "sku": sku,
                    "units": units,
                    "severity": "MEDIUM",
                })

    all_alerts = low_stock_alerts + reorder_alerts

    for alert in all_alerts:
        severity = alert["severity"]
        units = alert["units"]
        product = alert["product_name"]
        business = alert["business_name"]

        message = (
            f"[OUT OF STOCK] {business} — {product} has {units} units remaining. Reorder NOW."
            if units == 0
            else f"[LOW STOCK {'CRITICAL' if severity == 'HIGH' else 'WARNING'}] {business} — {product} has {units} units. Reorder soon."
        )

        supabase.table("chairman_queue").insert({
            "agent": "inventory_agent",
            "priority": 9 if units == 0 else 7 if severity == "HIGH" else 5,
            "message": message,
            "data": alert,
            "status": "pending",
        }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    msg = f"Checked inventory: {len(low_stock_alerts)} critical, {len(reorder_alerts)} reorder alerts"
    await log_agent_run("inventory_agent", "success", msg, duration_ms=duration_ms)
    print(f"[InventoryAgent] Done in {duration_ms}ms — {msg}")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
