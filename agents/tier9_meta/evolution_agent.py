"""
Evolution Agent — Tier 9 Meta.
Reads everything: all agent_runs, businesses, evolution_proposals from last 30 days.
Proposes architectural changes. Writes to evolution_proposals table. Monthly.
"""
import asyncio
import os
import json
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from shared.skills.llm_skills import smart_llm
from shared.skills.scoring_skills import log_agent_run

EVOLUTION_PROMPT = """You are the Evolution Agent — the highest-level meta-agent in an autonomous AI empire.
Your job: identify fundamental architectural improvements that would compound across the entire system.

Empire data (last 30 days):
{empire_summary}

Implemented improvements this cycle:
{recent_improvements}

Current architecture:
- 47 agents across 9 tiers
- Supabase for memory and task queue
- Groq (fast), Claude Opus (smart), Gemini (agent), Groq 8b (cheap) LLMs
- Tavily for live search
- Railway for workers, Vercel for frontend

Analyze and propose 3-5 architectural improvements that would:
1. Reduce failure rates across multiple agents
2. Increase revenue per agent-hour
3. Reduce human intervention needed
4. Enable new business models

Be bold. These are monthly proposals — they should be significant changes.

Return JSON:
{{
  "proposals": [
    {{
      "title": "<proposal name>",
      "type": "<new_agent|agent_merge|new_skill|architecture_change|new_business>",
      "description": "<what to build/change>",
      "expected_impact": "<quantified improvement>",
      "effort": "<1-3 weeks>",
      "priority": <1-10>,
      "implementation_steps": ["<step1>", "<step2>", "<step3>"]
    }}
  ],
  "empire_health_assessment": "<three sentences>",
  "biggest_unlock": "<the single change that would most transform the empire>"
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[EvolutionAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    agent_runs = supabase.table("agent_runs").select("agent_name, status, cost_usd").gte("created_at", cutoff).execute()
    businesses = supabase.table("businesses").select("name, revenue_7d, war_room_score, war_room_recommendation, active").execute()
    proposals = supabase.table("evolution_proposals").select("agent_name, proposal_type, status, data").gte("created_at", cutoff).execute()

    # summarize agent performance
    stats: dict[str, dict] = defaultdict(lambda: {"total": 0, "success": 0, "cost": 0.0})
    for row in (agent_runs.data or []):
        agent = row.get("agent_name", "unknown")
        stats[agent]["total"] += 1
        if row.get("status") == "success":
            stats[agent]["success"] += 1
        stats[agent]["cost"] += float(row.get("cost_usd") or 0)

    top_agents = sorted(stats.items(), key=lambda x: x[1]["success"] / max(1, x[1]["total"]), reverse=True)[:10]
    bottom_agents = sorted(stats.items(), key=lambda x: x[1]["success"] / max(1, x[1]["total"]))[:5]

    empire_lines = ["TOP PERFORMERS:"]
    for agent, s in top_agents:
        rate = s["success"] / max(1, s["total"])
        empire_lines.append(f"- {agent}: {rate:.0%} success ({s['total']} runs, ${s['cost']:.4f})")

    empire_lines.append("\nWEAKEST AGENTS:")
    for agent, s in bottom_agents:
        rate = s["success"] / max(1, s["total"])
        empire_lines.append(f"- {agent}: {rate:.0%} success ({s['total']} runs)")

    empire_lines.append("\nBUSINESSES:")
    total_revenue = 0.0
    for b in (businesses.data or []):
        r7 = float(b.get("revenue_7d") or 0)
        total_revenue += r7
        empire_lines.append(
            f"- {b.get('name')}: ${r7:.2f}/wk, score={b.get('war_room_score', 'N/A')}, rec={b.get('war_room_recommendation', 'N/A')}"
        )
    empire_lines.append(f"\nTOTAL EMPIRE REVENUE (7d): ${total_revenue:.2f}")

    recent_improvements = "\n".join([
        f"- [{p.get('proposal_type')}] {p.get('agent_name')}: {json.dumps(p.get('data', {}))[:150]}"
        for p in (proposals.data or [])[:10]
    ]) or "No recent improvements"

    raw = await smart_llm(
        EVOLUTION_PROMPT.format(
            empire_summary="\n".join(empire_lines),
            recent_improvements=recent_improvements,
        ),
        max_tokens=1500,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
    except Exception as e:
        print(f"[EvolutionAgent] Parse error: {e}")
        await log_agent_run("evolution_agent", "failed", str(e), duration_ms=0)
        return

    for proposal in result.get("proposals", []):
        supabase.table("evolution_proposals").insert({
            "proposed_by": "evolution_agent",
            "agent_name": None,
            "proposal_type": proposal.get("type", "architecture_change"),
            "priority": proposal.get("priority", 7),
            "data": proposal,
            "status": "pending",
        }).execute()

    # notify chairman with summary
    supabase.table("chairman_queue").insert({
        "agent": "evolution_agent",
        "priority": 7,
        "message": f"[MONTHLY EVOLUTION REPORT] {result.get('biggest_unlock', '')} — {len(result.get('proposals', []))} proposals queued.",
        "data": {"assessment": result.get("empire_health_assessment"), "biggest_unlock": result.get("biggest_unlock"), "proposal_count": len(result.get("proposals", []))},
        "status": "pending",
    }).execute()

    proposal_count = len(result.get("proposals", []))
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("evolution_agent", "success", f"Proposed {proposal_count} architectural changes. {result.get('empire_health_assessment', '')[:100]}", duration_ms=duration_ms)
    print(f"[EvolutionAgent] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
