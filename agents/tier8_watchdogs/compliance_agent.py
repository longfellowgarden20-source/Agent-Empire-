"""
Compliance Agent — Tier 8 Watchdogs.
Tavily search for regulatory changes in AI, ecommerce, marketing laws.
Writes warnings to chairman_queue if relevant. Weekly.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

COMPLIANCE_QUERIES = [
    "AI regulation new law compliance 2026 FTC SEC EU",
    "ecommerce compliance law changes 2026 GDPR CCPA",
    "email marketing law CAN-SPAM changes 2026",
    "AI content disclosure requirements law 2026",
    "data privacy regulation enforcement action 2026",
]

COMPLIANCE_PROMPT = """You are a compliance officer for an AI holding company.
Review these regulatory signals and identify any compliance risks.

Our business activities:
- AI-powered email outreach and lead generation
- Ecommerce product listings and advertising
- AI-generated content publishing
- Automated trading/market intelligence
- User data processing

Regulatory signals:
{signals}

For each risk, assess:
1. Which of our activities is affected
2. Severity (CRITICAL requires immediate action, HIGH requires this week, MEDIUM = next sprint)
3. Specific action to take

Return JSON:
{{
  "risks": [
    {{
      "regulation": "<law/regulation name>",
      "jurisdiction": "<US|EU|global>",
      "affected_activity": "<which of our activities>",
      "severity": "<CRITICAL|HIGH|MEDIUM|LOW>",
      "summary": "<one sentence>",
      "action_required": "<specific step to take>"
    }}
  ],
  "overall_risk_level": "<GREEN|YELLOW|RED>",
  "most_urgent": "<top concern>"
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[ComplianceAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    batches = await asyncio.gather(*[live_search(q, max_results=4) for q in COMPLIANCE_QUERIES])

    signals_text = ""
    for batch in batches:
        for r in batch:
            signals_text += f"\n[{r.get('title', '')}]\n{r.get('content', '')[:250]}\n"

    raw = await agent_llm(
        COMPLIANCE_PROMPT.format(signals=signals_text[:3500]),
        max_tokens=800,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
    except Exception as e:
        print(f"[ComplianceAgent] Parse error: {e}")
        await log_agent_run("compliance_agent", "failed", str(e), duration_ms=0)
        return

    risks = result.get("risks", [])
    actionable_risks = [r for r in risks if r.get("severity") in ("CRITICAL", "HIGH", "MEDIUM")]

    for risk in actionable_risks:
        priority = 9 if risk.get("severity") == "CRITICAL" else 7 if risk.get("severity") == "HIGH" else 5
        supabase.table("chairman_queue").insert({
            "agent": "compliance_agent",
            "priority": priority,
            "message": f"[COMPLIANCE {risk.get('severity')}] {risk.get('regulation')} — {risk.get('summary')} Action: {risk.get('action_required')}",
            "data": risk,
            "status": "pending",
        }).execute()

    risk_level = result.get("overall_risk_level", "GREEN")
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("compliance_agent", "success", f"Risk level: {risk_level}. {len(actionable_risks)} actionable risks found.", duration_ms=duration_ms)
    print(f"[ComplianceAgent] Done in {duration_ms}ms — {risk_level}")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
