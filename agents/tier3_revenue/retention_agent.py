"""
Retention Agent — Tier 3 Revenue.
Reads prospects where outreach_status='closed'. Checks for inactivity signals.
Flags churn risk to chairman_queue. Weekly Friday.
"""
import asyncio
import os
import json
from datetime import datetime, timezone, timedelta

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import fast_llm
from shared.skills.scoring_skills import log_agent_run

CHURN_PROMPT = """Assess churn risk for this client.

Client: {company}
Days since last contact: {days_since_contact}
Recent news signals:
{news_signals}

Churn signals to look for:
- Layoffs or budget cuts
- New leadership
- Competitor adoption
- Project cancellations
- Silence / non-responsiveness

Return JSON:
{{
  "churn_risk": <1-10>,
  "risk_level": "<LOW|MEDIUM|HIGH|CRITICAL>",
  "signals": ["<signal1>", "<signal2>"],
  "recommended_action": "<one sentence>",
  "urgency": "<this week|this month|low priority>"
}}"""


async def check_churn_risk(prospect: dict, supabase) -> bool:
    company = prospect.get("company_name", "")
    website = prospect.get("website", "")

    intel = prospect.get("intel") or {}
    last_contact_str = intel.get("last_contact_at") or prospect.get("updated_at") or prospect.get("created_at")
    days_since_contact = 999
    if last_contact_str:
        try:
            last_contact = datetime.fromisoformat(last_contact_str.replace("Z", "+00:00"))
            days_since_contact = (datetime.now(timezone.utc) - last_contact).days
        except Exception:
            pass

    print(f"[RetentionAgent] Checking {company} ({days_since_contact}d since contact)")

    results = await live_search(f"{company} news layoffs budget cuts 2026", max_results=4)
    news_signals = "\n".join([
        f"- {r.get('title', '')}: {r.get('content', '')[:150]}"
        for r in results
    ])

    raw = await fast_llm(
        CHURN_PROMPT.format(
            company=company,
            days_since_contact=days_since_contact,
            news_signals=news_signals or "No recent news",
        ),
        max_tokens=300,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
    except Exception as e:
        print(f"[RetentionAgent] Parse error for {company}: {e}")
        return False

    churn_risk = result.get("churn_risk", 0)
    risk_level = result.get("risk_level", "LOW")

    supabase.table("prospects").update({
        "intel": {
            **(intel),
            "churn_assessment": result,
            "churn_checked_at": datetime.now(timezone.utc).isoformat(),
        }
    }).eq("id", prospect["id"]).execute()

    if churn_risk >= 6 or risk_level in ("HIGH", "CRITICAL"):
        supabase.table("chairman_queue").insert({
            "priority": 8 if risk_level == "CRITICAL" else 6,
            "message": f"[CHURN RISK {risk_level}] {company} — {result.get('recommended_action')} ({days_since_contact}d since contact)",
            "requires_action": risk_level == "CRITICAL",
        }).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[RetentionAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    prospects = (
        supabase.table("prospects")
        .select("*")
        .eq("outreach_status", "closed")
        .order("score", desc=True)
        .limit(30)
        .execute()
    )

    if not prospects.data:
        print("[RetentionAgent] No closed prospects")
        await log_agent_run("retention_agent", "skipped", "No closed prospects", duration_ms=0)
        return

    print(f"[RetentionAgent] Checking {len(prospects.data)} clients")

    results = await asyncio.gather(*[check_churn_risk(p, supabase) for p in prospects.data])
    flagged = sum(1 for r in results if r)

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("retention_agent", "success", f"Checked {len(prospects.data)} clients, flagged {flagged} risks", duration_ms=duration_ms)
    print(f"[RetentionAgent] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
