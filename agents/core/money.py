"""Money — tracks revenue, scores businesses, flags what to scale or kill."""
import asyncio, os
from datetime import datetime, timezone
from shared.skills.scoring_skills import log_agent_run


async def run():
    start = datetime.now(timezone.utc)
    print("[Money] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    businesses = sb.table("businesses").select("*").execute()

    if not businesses.data:
        await log_agent_run("money", "skipped", "No businesses", duration_ms=0)
        return

    # load recent alerts to avoid spamming duplicates
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    recent = sb.table("chairman_queue").select("message").gte("created_at", cutoff).execute()
    recent_msgs = {r["message"] for r in (recent.data or [])}

    alerts = []
    for biz in businesses.data:
        score = biz.get("war_room_score", 0) or 0
        name = biz.get("name", "Unknown")
        rev = biz.get("revenue_7d", 0) or 0

        if score < 20:
            alerts.append(f"🔴 {name} war room score {score}/100 — consider shutdown")
        elif score > 80:
            alerts.append(f"🟢 {name} scoring {score}/100 — ready to scale")

        if rev == 0 and biz.get("status") == "live":
            alerts.append(f"⚠️ {name} is live but has $0 revenue last 7 days")

    new_alerts = [a for a in alerts if a not in recent_msgs]
    for msg in new_alerts:
        sb.table("chairman_queue").insert({
            "message": msg,
            "priority": 8,
            "requires_action": True,
        }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("money", "success", f"Reviewed {len(businesses.data)} businesses, {len(new_alerts)} new alerts", duration_ms=duration_ms)
    print(f"[Money] Done — {len(new_alerts)} new alerts")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
