"""
Data Scientist — Tier 7 Intelligence.
Reads all agent_runs + businesses from last 30 days.
Finds patterns: which agents fail most, revenue correlations.
Writes analysis to evolution_proposals. Weekly Sunday.
"""
import asyncio
import os
import json
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from shared.skills.llm_skills import smart_llm
from shared.skills.scoring_skills import log_agent_run

ANALYSIS_PROMPT = """You are a data scientist analyzing an autonomous AI business empire.

Agent performance data (last 30 days):
{agent_stats}

Business revenue data:
{business_data}

Failure patterns:
{failure_patterns}

Find:
1. Which agents are the weakest link (highest failure rate + business impact)
2. Revenue correlations (what agent activity correlates with revenue growth)
3. Systemic issues (patterns that appear across multiple agents/businesses)
4. Optimization opportunities (where small changes = big impact)

Return JSON:
{{
  "weakest_agents": [
    {{"agent": "<name>", "failure_rate": <float>, "business_impact": "<high|medium|low>", "priority_fix": "<what to fix>"}}
  ],
  "revenue_correlations": ["<correlation1>", "<correlation2>"],
  "systemic_issues": ["<issue1>", "<issue2>"],
  "top_optimizations": [
    {{"change": "<what to change>", "expected_impact": "<impact>", "effort": "<low|medium|high>"}}
  ],
  "summary": "<three sentences>"
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[DataScientist] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    agent_runs = supabase.table("agent_runs").select("agent_name, status, duration_ms, cost_usd, created_at").gte("created_at", cutoff).execute()
    businesses = supabase.table("businesses").select("name, revenue_7d, revenue_prev_7d, war_room_score, war_room_recommendation").execute()

    if not agent_runs.data:
        print("[DataScientist] No agent run data")
        await log_agent_run("data_scientist", "skipped", "No data", duration_ms=0)
        return

    # aggregate agent stats
    stats: dict[str, dict] = defaultdict(lambda: {"total": 0, "success": 0, "total_ms": 0, "total_cost": 0.0})
    for row in agent_runs.data:
        agent = row.get("agent_name", "unknown")
        stats[agent]["total"] += 1
        if row.get("status") == "success":
            stats[agent]["success"] += 1
        stats[agent]["total_ms"] += int(row.get("duration_ms") or 0)
        stats[agent]["total_cost"] += float(row.get("cost_usd") or 0)

    agent_stats_lines = []
    failure_patterns = []
    for agent, s in sorted(stats.items(), key=lambda x: x[1]["success"] / max(1, x[1]["total"])):
        rate = s["success"] / max(1, s["total"])
        avg_ms = s["total_ms"] / max(1, s["total"])
        agent_stats_lines.append(
            f"- {agent}: {rate:.0%} success ({s['total']} runs), avg {avg_ms:.0f}ms, ${s['total_cost']:.4f} cost"
        )
        if rate < 0.7:
            failure_patterns.append(f"{agent} fails {(1-rate):.0%} of the time")

    business_lines = []
    for b in (businesses.data or []):
        r7 = float(b.get("revenue_7d") or 0)
        r_prev = float(b.get("revenue_prev_7d") or 1)
        change = ((r7 - r_prev) / max(1, r_prev)) * 100
        business_lines.append(
            f"- {b.get('name', 'unknown')}: ${r7:.2f}/wk ({change:+.0f}%), score={b.get('war_room_score', 'N/A')}"
        )

    raw = await smart_llm(
        ANALYSIS_PROMPT.format(
            agent_stats="\n".join(agent_stats_lines) or "No data",
            business_data="\n".join(business_lines) or "No businesses",
            failure_patterns="\n".join(failure_patterns) or "No systematic failures",
        ),
        max_tokens=1000,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        analysis = json.loads(cleaned)
    except Exception as e:
        print(f"[DataScientist] Parse error: {e}")
        analysis = {"summary": raw[:300], "top_optimizations": [], "weakest_agents": []}

    # write top optimizations to evolution_proposals
    for opt in analysis.get("top_optimizations", []):
        supabase.table("evolution_proposals").insert({
            "proposed_by": "data_scientist",
            "agent_name": None,
            "proposal_type": "optimization",
            "priority": 7 if opt.get("effort") == "low" else 5,
            "data": opt,
            "status": "pending",
        }).execute()

    # write weakest agents to evolution_proposals
    for wa in analysis.get("weakest_agents", []):
        if wa.get("business_impact") in ("high", "medium"):
            supabase.table("evolution_proposals").insert({
                "proposed_by": "data_scientist",
                "agent_name": wa.get("agent"),
                "proposal_type": "fix_required",
                "priority": 8 if wa.get("business_impact") == "high" else 6,
                "data": wa,
                "status": "pending",
            }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("data_scientist", "success", analysis.get("summary", "Analysis complete"), duration_ms=duration_ms)
    print(f"[DataScientist] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
