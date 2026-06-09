"""
Security Agent — Tier 8 Watchdogs.
Reads agent_runs for unusual patterns (too many failures, unexpected cost spikes).
Writes alerts to chairman_queue. Every 15 min.
"""
import asyncio
import os
import json
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

FAILURE_RATE_THRESHOLD = 0.8      # 80% failure rate in last hour = alert
COST_SPIKE_MULTIPLIER = 5.0       # 5x normal cost = alert
MIN_RUNS_FOR_ANALYSIS = 3         # need at least 3 runs to flag


async def run():
    start = datetime.now(timezone.utc)
    print(f"[SecurityAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    # last 1 hour for recent patterns
    cutoff_1h = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    # last 24 hours for baseline
    cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    recent_runs = supabase.table("agent_runs").select("agent, status, cost_usd, created_at, summary").gte("created_at", cutoff_1h).execute()
    baseline_runs = supabase.table("agent_runs").select("agent, status, cost_usd").gte("created_at", cutoff_24h).execute()

    if not recent_runs.data:
        print("[SecurityAgent] No recent runs")
        await log_agent_run("security_agent", "skipped", "No recent activity", duration_ms=0)
        return

    # compute baseline cost per agent
    baseline_costs: dict[str, list] = defaultdict(list)
    for row in (baseline_runs.data or []):
        cost = float(row.get("cost_usd") or 0)
        if cost > 0:
            baseline_costs[row.get("agent", "unknown")].append(cost)

    # analyze recent runs
    recent_stats: dict[str, dict] = defaultdict(lambda: {"total": 0, "failures": 0, "cost": 0.0, "errors": []})
    for row in recent_runs.data:
        agent = row.get("agent", "unknown")
        recent_stats[agent]["total"] += 1
        cost = float(row.get("cost_usd") or 0)
        recent_stats[agent]["cost"] += cost
        if row.get("status") != "success":
            recent_stats[agent]["failures"] += 1
            error = str(row.get("summary") or "unknown")[:150]
            recent_stats[agent]["errors"].append(error)

    alerts = []

    for agent, stats in recent_stats.items():
        if stats["total"] < MIN_RUNS_FOR_ANALYSIS:
            continue

        failure_rate = stats["failures"] / stats["total"]
        avg_cost = stats["cost"] / stats["total"]

        if failure_rate >= FAILURE_RATE_THRESHOLD:
            alerts.append({
                "type": "HIGH_FAILURE_RATE",
                "agent": agent,
                "failure_rate": failure_rate,
                "total_runs": stats["total"],
                "sample_errors": stats["errors"][:3],
                "severity": "CRITICAL" if failure_rate >= 0.95 else "HIGH",
            })

        # check for cost spike
        baseline = baseline_costs.get(agent, [])
        if baseline and avg_cost > 0:
            baseline_avg = sum(baseline) / len(baseline)
            if baseline_avg > 0 and avg_cost > baseline_avg * COST_SPIKE_MULTIPLIER:
                alerts.append({
                    "type": "COST_SPIKE",
                    "agent": agent,
                    "current_avg_cost": avg_cost,
                    "baseline_avg_cost": baseline_avg,
                    "multiplier": avg_cost / baseline_avg,
                    "severity": "HIGH",
                })

    for alert in alerts:
        severity = alert.get("severity", "HIGH")
        agent = alert.get("agent", "unknown")

        if alert["type"] == "HIGH_FAILURE_RATE":
            message = f"[SECURITY: FAILURE STORM] {agent} failing at {alert['failure_rate']:.0%} ({alert['total_runs']} runs in 1h). Errors: {alert['sample_errors'][0] if alert['sample_errors'] else 'unknown'}"
        else:
            message = f"[SECURITY: COST SPIKE] {agent} spending {alert['multiplier']:.1f}x normal (${alert['current_avg_cost']:.4f} vs ${alert['baseline_avg_cost']:.4f} baseline)"

        supabase.table("chairman_queue").insert({
            "priority": 10 if severity == "CRITICAL" else 8,
            "message": message,
            "requires_action": True,
        }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    msg = f"Scanned {len(recent_runs.data)} runs. {len(alerts)} security alerts."
    await log_agent_run("security_agent", "success", msg, duration_ms=duration_ms)
    print(f"[SecurityAgent] Done in {duration_ms}ms — {len(alerts)} alerts")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
