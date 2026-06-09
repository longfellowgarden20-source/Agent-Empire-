"""
Skill Builder — Tier 2 Builders.
Reads agent_runs from last 7 days. Finds bottom 20% by success rate.
Writes improvement suggestions to evolution_proposals table. Weekly Sunday.
"""
import asyncio
import os
import json
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from shared.skills.llm_skills import smart_llm
from shared.skills.scoring_skills import log_agent_run

SKILL_PROMPT = """You are analyzing underperforming AI agents to write improvement plans.

Underperforming agents (bottom 20% by success rate):
{underperformers}

Sample failure logs:
{failure_samples}

For each agent, write a specific improvement plan.
Return JSON:
{{
  "proposals": [
    {{
      "agent_name": "<name>",
      "current_success_rate": <float 0-1>,
      "failure_patterns": ["<pattern1>", "<pattern2>"],
      "root_cause": "<one sentence>",
      "proposed_fix": "<specific change to make>",
      "expected_improvement": "<what metric improves by how much>",
      "priority": <1-10>
    }}
  ],
  "summary": "<two sentences>"
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[SkillBuilder] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    runs = supabase.table("agent_runs").select("agent, status, summary, duration_ms").gte("created_at", cutoff).execute()

    if not runs.data:
        print("[SkillBuilder] No agent runs in last 7 days")
        await log_agent_run("skill_builder", "skipped", "No agent runs data", duration_ms=0)
        return

    # aggregate success rates
    stats: dict[str, dict] = defaultdict(lambda: {"total": 0, "success": 0, "failures": []})
    for row in runs.data:
        agent = row.get("agent", "unknown")
        stats[agent]["total"] += 1
        if row.get("status") == "success":
            stats[agent]["success"] += 1
        else:
            error = row.get("summary") or "unknown error"
            stats[agent]["failures"].append(str(error)[:200])

    # compute success rates, find bottom 20%
    rates = []
    for agent, s in stats.items():
        rate = s["success"] / max(1, s["total"])
        rates.append({"agent": agent, "rate": rate, "total": s["total"], "failures": s["failures"]})

    rates.sort(key=lambda x: x["rate"])
    cutoff_idx = max(1, len(rates) // 5)  # bottom 20%
    underperformers = rates[:cutoff_idx]

    if not underperformers:
        print("[SkillBuilder] No underperformers found")
        await log_agent_run("skill_builder", "skipped", "No underperformers", duration_ms=0)
        return

    underperformer_text = "\n".join([
        f"- {u['agent']}: {u['rate']:.0%} success rate ({u['total']} runs)"
        for u in underperformers
    ])

    failure_samples = ""
    for u in underperformers[:5]:
        failure_samples += f"\n[{u['agent']}] failures:\n"
        for f in u["failures"][:3]:
            failure_samples += f"  - {f}\n"

    raw = await smart_llm(
        SKILL_PROMPT.format(
            underperformers=underperformer_text,
            failure_samples=failure_samples[:2000],
        ),
        max_tokens=1200,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
    except Exception as e:
        print(f"[SkillBuilder] Parse error: {e}")
        result = {"proposals": [], "summary": raw[:200]}

    for proposal in result.get("proposals", []):
        supabase.table("evolution_proposals").insert({
            "proposal": f"[skill_improvement] {proposal.get('agent_name')}: {proposal.get('proposed_fix', '')}",
            "reasoning": f"Agent: {proposal.get('agent_name')}. Success rate: {proposal.get('current_success_rate')}. Root cause: {proposal.get('root_cause')}. Patterns: {proposal.get('failure_patterns')}. Priority: {proposal.get('priority', 5)}.",
            "impact_estimate": proposal.get("expected_improvement", ""),
            "status": "pending",
        }).execute()

    proposal_count = len(result.get("proposals", []))
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("skill_builder", "success", f"Wrote {proposal_count} improvement proposals. {result.get('summary', '')}", duration_ms=duration_ms)
    print(f"[SkillBuilder] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
