"""
Finance Tracker — Tier 8 Watchdogs.
Reads businesses revenue_7d. Calculates week over week change.
Flags >20% drops to chairman_queue. Daily.
"""
import asyncio
import os
from datetime import datetime, timezone

from shared.skills.scoring_skills import log_agent_run

DROP_THRESHOLD = 0.20  # 20% WoW drop triggers alert


async def run():
    start = datetime.now(timezone.utc)
    print(f"[FinanceTracker] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    businesses = supabase.table("businesses").select("id, name, revenue_7d, revenue_prev_7d, active").eq("active", True).execute()
    if not businesses.data:
        print("[FinanceTracker] No active businesses")
        await log_agent_run("finance_tracker", "skipped", "No businesses", duration_ms=0)
        return

    total_revenue = 0.0
    alerts = []
    summary_lines = []

    for b in businesses.data:
        name = b.get("name", b["id"])
        r7 = float(b.get("revenue_7d") or 0)
        r_prev = float(b.get("revenue_prev_7d") or 0)
        total_revenue += r7

        if r_prev > 0:
            change_pct = (r7 - r_prev) / r_prev
            direction = "↑" if change_pct >= 0 else "↓"
            summary_lines.append(f"- {name}: ${r7:.2f} ({direction}{abs(change_pct):.0%})")

            if change_pct <= -DROP_THRESHOLD:
                severity = "CRITICAL" if change_pct <= -0.50 else "HIGH"
                alerts.append({
                    "business_id": b["id"],
                    "name": name,
                    "revenue_7d": r7,
                    "revenue_prev_7d": r_prev,
                    "change_pct": change_pct,
                    "severity": severity,
                })
        else:
            summary_lines.append(f"- {name}: ${r7:.2f} (new)")

    for alert in alerts:
        change_str = f"{alert['change_pct']:.0%}"
        supabase.table("chairman_queue").insert({
            "agent": "finance_tracker",
            "priority": 9 if alert["severity"] == "CRITICAL" else 7,
            "message": f"[REVENUE DROP {alert['severity']}] {alert['name']} dropped {change_str} WoW (${alert['revenue_prev_7d']:.2f} → ${alert['revenue_7d']:.2f}). Investigate now.",
            "data": alert,
            "status": "pending",
        }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    msg = f"Total revenue 7d: ${total_revenue:.2f}. {len(alerts)} drop alerts."
    await log_agent_run("finance_tracker", "success", msg, duration_ms=duration_ms)
    print(f"[FinanceTracker] Done in {duration_ms}ms — {msg}")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
