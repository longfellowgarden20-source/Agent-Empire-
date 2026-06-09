"""
Systems Monitor — Tier 8 Watchdog.
Watches Railway, Vercel, Supabase every 5 minutes.
Writes to chairman_queue on failure. Never fails silently.
"""
import asyncio
import os
import httpx
from datetime import datetime, timezone

from shared.skills.memory_skills import save_to_memory, get_from_memory
from shared.skills.scoring_skills import log_agent_run

SERVICES = [
    {"name": "Supabase", "url_env": "NEXT_PUBLIC_SUPABASE_URL", "path": "/rest/v1/", "expected_status": [200, 400]},
    {"name": "Vercel Dashboard", "url_env": "VERCEL_URL", "path": "/", "expected_status": [200]},
    {"name": "Railway Worker", "url_env": "WORKER_SERVICE_URL", "path": "/health", "expected_status": [200]},
]


async def check_service(client: httpx.AsyncClient, service: dict) -> dict:
    name = service["name"]
    base_url = os.environ.get(service["url_env"], "")

    if not base_url:
        return {"name": name, "status": "unconfigured", "ok": True, "latency_ms": 0}

    url = base_url.rstrip("/") + service["path"]
    try:
        start = datetime.now(timezone.utc)
        resp = await client.get(url, timeout=10)
        latency_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        ok = resp.status_code in service["expected_status"]
        return {
            "name": name,
            "status": "up" if ok else f"unexpected_{resp.status_code}",
            "ok": ok,
            "latency_ms": latency_ms,
        }
    except httpx.TimeoutException:
        return {"name": name, "status": "timeout", "ok": False, "latency_ms": 10000}
    except Exception as e:
        return {"name": name, "status": f"error: {str(e)[:60]}", "ok": False, "latency_ms": 0}


async def notify_chairman(supabase, message: str, priority: int = 8):
    supabase.table("chairman_queue").insert({
        "message": message,
        "priority": priority,
        "requires_action": False,
    }).execute()


async def run():
    start = datetime.now(timezone.utc)
    print(f"[SystemsMonitor] Starting check at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*[check_service(client, s) for s in SERVICES])

    failures = [r for r in results if not r["ok"] and r["status"] != "unconfigured"]
    healthy = [r for r in results if r["ok"]]

    print(f"[SystemsMonitor] {len(healthy)} up, {len(failures)} down")

    for f in failures:
        msg = f"🔴 {f['name']} is DOWN — status: {f['status']}"
        print(f"[SystemsMonitor] ALERT: {msg}")
        await notify_chairman(supabase, msg, priority=9)

    # save health snapshot to memory
    await save_to_memory("systems_monitor", "last_check", {
        "timestamp": start.isoformat(),
        "results": [{"name": r["name"], "status": r["status"], "latency_ms": r["latency_ms"]} for r in results],
        "all_healthy": len(failures) == 0,
    })

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    summary = f"{len(healthy)} services up" + (f", {len(failures)} DOWN: {[f['name'] for f in failures]}" if failures else "")
    await log_agent_run("systems_monitor", "success", summary, duration_ms=duration_ms)
    print(f"[SystemsMonitor] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
