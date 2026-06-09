"""
Copywriter — Tier 3 Revenue.
Writes personalized cold outreach for each prospect using their intel file.
Never generic. One email per prospect.
Uses Hermes-3 style via claude-sonnet for persona-holding.
Triggered by Researcher via task_queue.
"""
import asyncio
import os
from datetime import datetime, timezone

from shared.skills.llm_skills import smart_llm
from shared.skills.scoring_skills import log_agent_run

EMAIL_PROMPT = """You are an elite B2B copywriter writing a cold outreach email for an AI automation agency.

PROSPECT INTEL:
Company: {company}
Website: {website}
Intel: {intel}

AGENCY OFFER:
We build custom AI agent systems that automate repetitive business operations.
Examples: lead gen pipelines, content publishing, competitor monitoring, customer support.
Typical result: 60-80% time saved on operations within 30 days.

RULES:
- First line must hook on a SPECIFIC detail from their intel (not generic)
- No "I hope this finds you well" — ever
- Mention one specific pain point we can solve
- One clear CTA: 15-minute call to show a demo
- Under 120 words total
- Sound human, not salesy
- Subject line must be < 8 words and curious, not clickbait

Respond with:
SUBJECT: <subject line>

<email body>"""

FOLLOWUP_PROMPT = """Write a 3-day follow-up email for this prospect who didn't reply.
Original email subject: {subject}
Company: {company}
Intel summary: {intel_summary}

Rules:
- Reference the original email briefly
- Add one new value point not mentioned before
- Under 60 words
- End with the same CTA

Respond with just the email body, no subject line."""


async def write_email_for_prospect(prospect_id: str, supabase) -> bool:
    result = supabase.table("prospects").select("*").eq("id", prospect_id).single().execute()
    if not result.data:
        return False

    prospect = result.data
    intel = prospect.get("intel", {})
    intel_text = intel.get("full_intel", "") or str(intel)

    if not intel_text:
        print(f"[Copywriter] No intel for {prospect['company_name']}, skipping")
        return False

    print(f"[Copywriter] Writing email for {prospect['company_name']}")

    email_raw = await smart_llm(
        EMAIL_PROMPT.format(
            company=prospect["company_name"],
            website=prospect.get("website", ""),
            intel=intel_text[:1500],
        ),
        max_tokens=400,
    )

    # parse subject + body
    lines = email_raw.strip().split("\n")
    subject = ""
    body_lines = []
    parsing_body = False

    for line in lines:
        if line.startswith("SUBJECT:"):
            subject = line.replace("SUBJECT:", "").strip()
        elif subject and line.strip():
            parsing_body = True
        if parsing_body:
            body_lines.append(line)

    body = "\n".join(body_lines).strip()

    # write follow-up
    followup_body = await smart_llm(
        FOLLOWUP_PROMPT.format(
            subject=subject,
            company=prospect["company_name"],
            intel_summary=intel_text[:400],
        ),
        max_tokens=150,
    )

    # update prospect and add to outreach queue
    supabase.table("prospects").update({
        "outreach_status": "drafted",
        "intel": {
            **intel,
            "email_subject": subject,
            "email_body": body,
            "followup_body": followup_body,
            "drafted_at": datetime.now(timezone.utc).isoformat(),
        },
    }).eq("id", prospect_id).execute()

    # route to Outreach Agent
    supabase.table("task_queue").insert({
        "from_agent": "copywriter",
        "to_agent": "outreach_agent",
        "task_type": "send_outreach",
        "payload": {"prospect_id": prospect_id},
        "priority": prospect.get("score", 7),
        "status": "pending",
    }).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[Copywriter] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    tasks = supabase.table("task_queue").select("*").eq("to_agent", "copywriter").eq("status", "pending").order("priority", desc=True).limit(20).execute()

    if not tasks.data:
        print("[Copywriter] No tasks in queue")
        await log_agent_run("copywriter", "skipped", "No tasks", duration_ms=0)
        return

    print(f"[Copywriter] Writing {len(tasks.data)} emails")

    task_ids = [t["id"] for t in tasks.data]
    supabase.table("task_queue").update({"status": "in_progress", "picked_up_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    results = await asyncio.gather(*[
        write_email_for_prospect(t["payload"]["prospect_id"], supabase)
        for t in tasks.data
        if t.get("payload", {}).get("prospect_id")
    ])

    success_count = sum(1 for r in results if r)
    supabase.table("task_queue").update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("copywriter", "success", f"Wrote {success_count} emails", duration_ms=duration_ms)
    print(f"[Copywriter] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
