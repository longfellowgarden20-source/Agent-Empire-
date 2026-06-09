"""
Chairman — Tier 1 God agent.
Synthesizes everything into a 5-minute morning brief.
Maximum 3 items requiring human attention. Hard rule.
Runs daily 7:00am ET.
"""
import asyncio
import os
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from shared.skills.llm_skills import smart_llm
from shared.skills.scoring_skills import log_agent_run

ET = ZoneInfo("America/New_York")

BRIEF_PROMPT = """You are the Chairman agent for an autonomous AI business empire.
Generate the daily morning brief from this data.

TODAY: {date}

REVENUE DATA (last 24h):
{revenue_data}

AGENT ACTIVITY (last 24h):
{agent_activity}

ATTENTION ITEMS (unread, requires_action=true):
{attention_items}

ORACLE INTEL (latest):
{oracle_intel}

BUSINESS SCORES:
{business_scores}

Generate the brief in EXACTLY this format:

EMPIRE BRIEF — {date}

💰 REVENUE LAST 24H: $X,XXX
   [list each business with revenue and trend arrow]

🤖 AGENT ACTIVITY
   X tasks completed | X leads found | X emails sent

⚠️ NEEDS YOUR ATTENTION (max 3 items — pick the most critical)
   1. [Action required — one sentence]
   2. [Action required — one sentence, or omit if only 1-2 items]

✅ EVERYTHING ELSE RUNNING FINE

HARD RULES:
- Never more than 3 attention items
- If there are 10 problems, summarize the 7 minor ones in one line under ✅
- Be specific with numbers
- Total brief under 200 words"""


async def run():
    start = datetime.now(timezone.utc)
    now_et = datetime.now(ET)
    date_str = now_et.strftime("%A %B %d, %Y")
    yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    print(f"[Chairman] Generating morning brief for {date_str}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    # gather all data concurrently
    businesses_res = supabase.table("businesses").select("name, revenue_7d, revenue_prev_7d, war_room_score, status").execute()
    agent_runs_res = supabase.table("agent_runs").select("agent, status, summary").gte("created_at", yesterday).execute()
    attention_res = supabase.table("chairman_queue").select("*").eq("sent_in_brief", False).order("priority", desc=True).limit(10).execute()
    oracle_res = supabase.table("oracle_intelligence").select("category, summary").gte("created_at", yesterday).order("relevance_score", desc=True).limit(5).execute()
    prospects_res = supabase.table("prospects").select("outreach_status").gte("created_at", yesterday).execute()

    # format revenue data
    businesses = businesses_res.data or []
    revenue_lines = []
    total_24h = 0
    for b in businesses:
        rev = b.get("revenue_7d", 0)
        prev = b.get("revenue_prev_7d", 0)
        daily_est = round(rev / 7) if rev else 0
        total_24h += daily_est
        trend = "↑" if rev > prev else "↓" if rev < prev else "→"
        revenue_lines.append(f"  {b['name']}: ${daily_est:,} {trend}")
    revenue_data = f"Total: ${total_24h:,}\n" + "\n".join(revenue_lines)

    # format agent activity
    runs = agent_runs_res.data or []
    completed = sum(1 for r in runs if r["status"] == "success")
    failed = sum(1 for r in runs if r["status"] == "failed")
    prospects_today = len(prospects_res.data or [])
    agent_activity = f"{completed} tasks completed, {failed} failed, {prospects_today} new prospects"

    # format attention items
    attention = attention_res.data or []
    attention_text = "\n".join([f"  - {a['message']}" for a in attention[:10]]) or "  None"

    # format oracle intel
    oracle = oracle_res.data or []
    oracle_text = "\n".join([f"  [{o['category'].upper()}] {o['summary']}" for o in oracle]) or "  No recent intel"

    # format business scores
    scores_text = "\n".join([f"  {b['name']}: {b.get('war_room_score', 'N/A')}/100 ({b.get('status', 'unknown')})" for b in businesses]) or "  No businesses registered"

    # generate brief
    brief = await smart_llm(
        BRIEF_PROMPT.format(
            date=date_str,
            revenue_data=revenue_data,
            agent_activity=agent_activity,
            attention_items=attention_text,
            oracle_intel=oracle_text,
            business_scores=scores_text,
        ),
        system="You are the Chairman agent. Be concise, specific, and executive-level.",
        max_tokens=500,
    )

    # save brief to DB
    supabase.table("chairman_briefs" if False else "chairman_queue").insert({
        "message": brief,
        "priority": 10,
        "requires_action": False,
        "sent_in_brief": False,
    }).execute()

    # mark attention items as sent
    if attention:
        ids = [a["id"] for a in attention[:3]]
        supabase.table("chairman_queue").update({"sent_in_brief": True}).in_("id", ids).execute()

    print(f"[Chairman] Brief generated:\n\n{brief}")

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("chairman", "success", "Morning brief generated", duration_ms=duration_ms)
    print(f"[Chairman] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
