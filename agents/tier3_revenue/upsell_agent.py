"""
Upsell Agent — Tier 3 Revenue.
Reads prospects where outreach_status='meeting' or 'closed'.
Searches Tavily for their recent growth signals. Drafts expansion proposal.
Writes to chairman_queue. Weekly Monday.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

UPSELL_PROMPT = """You are an AI agency account manager writing an expansion proposal.

Client: {company}
Website: {website}
Original service: {original_service}
Recent growth signals:
{growth_signals}

Write a concise expansion proposal covering:
1. Why now (growth signal tie-in)
2. The upsell service (what additional AI automation they need)
3. Expected ROI for the client
4. Proposed monthly retainer increase

Return JSON:
{{
  "upsell_service": "<service name>",
  "why_now": "<one sentence tied to growth signal>",
  "roi_pitch": "<expected client ROI>",
  "price_increase": <monthly_usd>,
  "proposal_email_subject": "<subject line>",
  "proposal_summary": "<three sentences>",
  "confidence": <1-10>
}}"""


async def build_upsell(prospect: dict, supabase) -> bool:
    company = prospect.get("company_name", "")
    website = prospect.get("website", "")
    original_service = json.dumps(prospect.get("intel") or {})[:300]

    print(f"[UpsellAgent] Building upsell for {company}")

    results = await live_search(f"{company} growth hiring funding expansion 2026", max_results=5)
    growth_signals = "\n".join([
        f"- {r.get('title', '')}: {r.get('content', '')[:200]}"
        for r in results
    ])

    raw = await agent_llm(
        UPSELL_PROMPT.format(
            company=company,
            website=website,
            original_service=original_service,
            growth_signals=growth_signals or "No recent signals found",
        ),
        max_tokens=500,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        proposal = json.loads(cleaned)
    except Exception as e:
        print(f"[UpsellAgent] Parse error for {company}: {e}")
        return False

    if proposal.get("confidence", 0) >= 6:
        supabase.table("chairman_queue").insert({
            "agent": "upsell_agent",
            "priority": 6,
            "message": f"[UPSELL] {company} — {proposal.get('upsell_service')} — +${proposal.get('price_increase')}/mo. {proposal.get('why_now')}",
            "data": {"prospect_id": prospect["id"], "proposal": proposal},
            "status": "pending",
        }).execute()

    supabase.table("prospects").update({
        "intel": {
            **(prospect.get("intel") or {}),
            "upsell_proposal": proposal,
            "upsell_at": datetime.now(timezone.utc).isoformat(),
        }
    }).eq("id", prospect["id"]).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[UpsellAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    prospects = (
        supabase.table("prospects")
        .select("*")
        .in_("outreach_status", ["meeting", "closed"])
        .order("score", desc=True)
        .limit(20)
        .execute()
    )

    if not prospects.data:
        print("[UpsellAgent] No meeting/closed prospects")
        await log_agent_run("upsell_agent", "skipped", "No prospects to upsell", duration_ms=0)
        return

    print(f"[UpsellAgent] Building upsells for {len(prospects.data)} prospects")

    results = await asyncio.gather(*[build_upsell(p, supabase) for p in prospects.data])
    success_count = sum(1 for r in results if r)

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("upsell_agent", "success", f"Built {success_count} upsell proposals", duration_ms=duration_ms)
    print(f"[UpsellAgent] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
