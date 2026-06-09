"""
Capital Allocator — Tier 1 Gods.
Watches spend vs revenue across all companies. Reads businesses + agent_runs.
Writes capital_recommendations to chairman_queue. Runs daily 6am ET.
"""
import asyncio
import os
import json
from datetime import datetime, timezone, timedelta

from shared.skills.llm_skills import smart_llm
from shared.skills.scoring_skills import log_agent_run

ALLOCATOR_PROMPT = """You are the Capital Allocator for an autonomous AI holding company.
Review this empire-wide spend vs revenue data and recommend capital reallocation.

Portfolio Overview:
{portfolio}

Agent Run Costs (last 7 days):
{agent_costs}

Rules:
- Total daily budget must stay under $50
- Kill underperformers (ROI < 1x) ruthlessly
- Double down on anything with ROI > 3x
- Flag any business burning cash without revenue

Return JSON:
{{
  "total_revenue_7d": <float>,
  "total_cost_7d": <float>,
  "portfolio_roi": <float>,
  "recommendations": [
    {{"company_id": "<id>", "action": "<KILL|CUT|HOLD|DOUBLE>", "reason": "<one sentence>", "budget_change_pct": <int>}}
  ],
  "top_performer": "<company_name>",
  "biggest_risk": "<company_name>",
  "summary": "<two sentences>"
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[CapitalAllocator] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    businesses = supabase.table("businesses").select("*").execute()
    if not businesses.data:
        print("[CapitalAllocator] No businesses found")
        await log_agent_run("capital_allocator", "skipped", "No businesses", duration_ms=0)
        return

    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    agent_runs = supabase.table("agent_runs").select("agent, cost_usd, status").gte("created_at", cutoff).execute()

    # aggregate costs per agent
    cost_by_agent: dict[str, float] = {}
    for run_row in (agent_runs.data or []):
        agent = run_row.get("agent", "unknown")
        cost = float(run_row.get("cost_usd") or 0)
        cost_by_agent[agent] = cost_by_agent.get(agent, 0) + cost

    portfolio_lines = []
    for b in businesses.data:
        r7 = float(b.get("revenue_7d") or 0)
        r_prev = float(b.get("revenue_prev_7d") or 0)
        portfolio_lines.append(
            f"- {b.get('name', b['id'])}: revenue=${r7:.2f} (prev=${r_prev:.2f}), score={b.get('war_room_score', 'N/A')}"
        )

    cost_lines = [f"- {agent}: ${cost:.4f}" for agent, cost in sorted(cost_by_agent.items(), key=lambda x: -x[1])[:20]]

    raw = await smart_llm(
        ALLOCATOR_PROMPT.format(
            portfolio="\n".join(portfolio_lines) or "No businesses yet",
            agent_costs="\n".join(cost_lines) or "No cost data",
        ),
        max_tokens=800,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
    except Exception as e:
        print(f"[CapitalAllocator] Parse error: {e}")
        result = {"summary": raw[:200], "recommendations": []}

    supabase.table("chairman_queue").insert({
        "priority": 8,
        "message": f"[CAPITAL REPORT] {result.get('summary', '')} ROI: {result.get('portfolio_roi', 'N/A')}x",
        "requires_action": True,
    }).execute()

    # apply budget changes to businesses table
    for rec in result.get("recommendations", []):
        if rec.get("company_id") and rec.get("action") in ("KILL", "CUT", "DOUBLE"):
            supabase.table("businesses").update({
                "capital_recommendation": rec.get("action"),
                "capital_note": rec.get("reason", ""),
            }).eq("id", rec["company_id"]).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("capital_allocator", "success", result.get("summary", "Done"), duration_ms=duration_ms)
    print(f"[CapitalAllocator] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
