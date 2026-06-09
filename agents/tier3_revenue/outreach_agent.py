"""
Outreach Agent — Tier 3 Revenue.
Sends emails on schedule. Manages timing. Follows up at day 3 and day 7.
Uses Composio Gmail MCP for actual sending.
Runs weekdays 10am ET + follow-up checks.
"""
import asyncio
import os
import httpx
from datetime import datetime, timezone, timedelta

from shared.skills.scoring_skills import log_agent_run

COMPOSIO_API_URL = "https://backend.composio.dev/api/v1"


async def send_email_via_composio(to_email: str, subject: str, body: str) -> bool:
    api_key = os.environ.get("COMPOSIO_API_KEY", "")
    if not api_key:
        print("[OutreachAgent] COMPOSIO_API_KEY not set — email not sent")
        return False

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.post(
                f"{COMPOSIO_API_URL}/actions/execute",
                headers={"x-api-key": api_key, "Content-Type": "application/json"},
                json={
                    "action": "GMAIL_SEND_EMAIL",
                    "input": {
                        "recipient_email": to_email,
                        "subject": subject,
                        "body": body,
                    },
                },
            )
            resp.raise_for_status()
            return True
        except Exception as e:
            print(f"[OutreachAgent] Send failed: {e}")
            return False


async def send_initial_outreach(prospect_id: str, supabase) -> bool:
    result = supabase.table("prospects").select("*").eq("id", prospect_id).single().execute()
    if not result.data:
        return False

    prospect = result.data
    intel = prospect.get("intel", {})
    subject = intel.get("email_subject", "")
    body = intel.get("email_body", "")
    to_email = intel.get("contact_email", "")

    if not subject or not body:
        print(f"[OutreachAgent] No email drafted for {prospect['company_name']}")
        return False

    if not to_email:
        # log that we need the email but can't send
        print(f"[OutreachAgent] No contact email for {prospect['company_name']} — queued for manual enrichment")
        supabase.table("prospects").update({
            "outreach_status": "needs_email",
        }).eq("id", prospect_id).execute()
        return False

    success = await send_email_via_composio(to_email, subject, body)

    if success:
        supabase.table("prospects").update({
            "outreach_status": "sent",
            "intel": {
                **intel,
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "followup_due_at": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
            },
        }).eq("id", prospect_id).execute()
        print(f"[OutreachAgent] Sent to {prospect['company_name']}")

    return success


async def send_followups(supabase) -> int:
    now = datetime.now(timezone.utc)

    # find prospects where followup is due and not yet replied
    result = supabase.table("prospects").select("*").eq("outreach_status", "sent").execute()
    due = []
    for p in (result.data or []):
        intel = p.get("intel", {})
        followup_due = intel.get("followup_due_at")
        if followup_due and followup_due <= now.isoformat():
            due.append(p)

    print(f"[OutreachAgent] {len(due)} follow-ups due")
    sent = 0

    for p in due:
        intel = p.get("intel", {})
        to_email = intel.get("contact_email", "")
        subject = f"Re: {intel.get('email_subject', '')}"
        body = intel.get("followup_body", "")

        if not to_email or not body:
            continue

        success = await send_email_via_composio(to_email, subject, body)
        if success:
            supabase.table("prospects").update({
                "outreach_status": "followed_up",
                "intel": {**intel, "followed_up_at": now.isoformat()},
            }).eq("id", p["id"]).execute()
            sent += 1

    return sent


async def run():
    start = datetime.now(timezone.utc)
    print(f"[OutreachAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    # process new outreach tasks
    tasks = supabase.table("task_queue").select("*").eq("to_agent", "outreach_agent").eq("status", "pending").order("priority", desc=True).limit(20).execute()

    sent_new = 0
    if tasks.data:
        task_ids = [t["id"] for t in tasks.data]
        supabase.table("task_queue").update({"status": "in_progress", "picked_up_at": start.isoformat()}).in_("id", task_ids).execute()

        results = await asyncio.gather(*[
            send_initial_outreach(t["payload"]["prospect_id"], supabase)
            for t in tasks.data
            if t.get("payload", {}).get("prospect_id")
        ])
        sent_new = sum(1 for r in results if r)
        supabase.table("task_queue").update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    # process follow-ups
    sent_followups = await send_followups(supabase)

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    summary = f"Sent {sent_new} initial emails, {sent_followups} follow-ups"
    await log_agent_run("outreach_agent", "success", summary, duration_ms=duration_ms)
    print(f"[OutreachAgent] {summary} — Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
