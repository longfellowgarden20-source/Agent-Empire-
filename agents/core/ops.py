"""Ops — monitors agent health, flags failures, tracks costs."""
import asyncio, os
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from shared.skills.scoring_skills import log_agent_run


async def run():
    start = datetime.now(timezone.utc)
    print("[Ops] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    recent = sb.table("agent_runs").select("agent, status, cost_usd, summary").gte("created_at", cutoff).execute()

    if not recent.data:
        await log_agent_run("ops", "skipped", "No recent runs", duration_ms=0)
        return

    stats: dict = defaultdict(lambda: {"total": 0, "failed": 0, "cost": 0.0})
    for row in recent.data:
        a = row.get("agent", "unknown")
        stats[a]["total"] += 1
        stats[a]["cost"] += float(row.get("cost_usd") or 0)
        if row.get("status") == "failed":
            stats[a]["failed"] += 1

    alerts = []
    for agent, s in stats.items():
        if s["total"] >= 3 and s["failed"] / s["total"] >= 0.8:
            alerts.append(f"⚠️ {agent} failing {s['failed']}/{s['total']} runs")

    for msg in alerts:
        sb.table("chairman_queue").insert({
            "message": msg,
            "priority": 9,
            "requires_action": True,
        }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    summary = f"Monitored {len(stats)} agents. {len(alerts)} alerts."
    await log_agent_run("ops", "success", summary, duration_ms=duration_ms)
    print(f"[Ops] Done — {summary}")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
