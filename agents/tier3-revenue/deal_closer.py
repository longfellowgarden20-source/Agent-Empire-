"""
Deal Closer — Tier 3 Revenue.
Monitors all inbound replies. Drafts responses. Books calendar meetings.
Handles objections. Escalates only when it needs a human voice.
Checks every 2 hours during business hours.
"""
import asyncio
import os
import httpx
from datetime import datetime, timezone

from shared.skills.llm_skills import smart_llm
from shared.skills.scoring_skills import log_agent_run

COMPOSIO_API_URL = "https://backend.composio.dev/api/v1"

CLASSIFY_REPLY_PROMPT = """A prospect replied to a cold email. Classify this reply.

Reply: {reply}
Original context: {context}

Respond ONLY with JSON:
{{
  "intent": "<interested|not_interested|objection|question|out_of_office|unsubscribe>",
  "sentiment": "<positive|neutral|negative>",
  "objection_type": "<price|timing|no_need|trust|competitor|null>",
  "needs_human": <true|false>,
  "recommended_response": "<brief description of what to say>"
}}"""

RESPONSE_PROMPT = """Write a reply to this prospect's email.

Original context: {context}
Their reply: {reply}
Intent: {intent}
Objection type: {objection_type}
Recommended approach: {recommended_response}

Rules:
- Sound like a real person, not a robot
- If interested: confirm a specific meeting time slot
- If objection: acknowledge it genuinely, then reframe
- If question: answer concisely, then invite them to a call
- Under 100 words
- Never be pushy"""


async def fetch_gmail_replies(api_key: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.post(
                f"{COMPOSIO_API_URL}/actions/execute",
                headers={"x-api-key": api_key, "Content-Type": "application/json"},
                json={
                    "action": "GMAIL_FETCH_EMAILS",
                    "input": {
                        "query": "is:unread label:inbox",
                        "max_results": 20,
                    },
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", {}).get("messages", [])
        except Exception as e:
            print(f"[DealCloser] Failed to fetch Gmail: {e}")
            return []


async def process_reply(reply_data: dict, supabase, api_key: str) -> dict:
    import json
    reply_text = reply_data.get("body", "") or reply_data.get("snippet", "")
    sender_email = reply_data.get("from", "")
    message_id = reply_data.get("id", "")

    if not reply_text or not sender_email:
        return {"handled": False}

    # look up prospect by email
    prospect_result = supabase.table("prospects").select("*").execute()
    prospect = None
    for p in (prospect_result.data or []):
        if p.get("intel", {}).get("contact_email", "") == sender_email:
            prospect = p
            break

    context = prospect["company_name"] if prospect else sender_email
    intel_text = str(prospect.get("intel", {}))[:500] if prospect else ""

    # classify the reply
    try:
        raw = await smart_llm(
            CLASSIFY_REPLY_PROMPT.format(reply=reply_text[:500], context=intel_text),
            max_tokens=200,
        )
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        classification = json.loads(cleaned)
    except Exception:
        classification = {"intent": "question", "sentiment": "neutral", "objection_type": None, "needs_human": True, "recommended_response": "Review manually"}

    intent = classification.get("intent", "question")

    # unsubscribe — just mark and move on
    if intent == "unsubscribe":
        if prospect:
            supabase.table("prospects").update({"outreach_status": "dead"}).eq("id", prospect["id"]).execute()
        return {"handled": True, "action": "unsubscribed"}

    # needs human — escalate to chairman
    if classification.get("needs_human"):
        supabase.table("chairman_queue").insert({
            "message": f"💬 Reply from {sender_email} needs your attention — intent: {intent}",
            "priority": 9,
            "requires_action": True,
        }).execute()
        return {"handled": True, "action": "escalated_to_chairman"}

    # draft and send response
    draft = await smart_llm(
        RESPONSE_PROMPT.format(
            context=intel_text,
            reply=reply_text[:400],
            intent=intent,
            objection_type=classification.get("objection_type", "null"),
            recommended_response=classification.get("recommended_response", ""),
        ),
        max_tokens=200,
    )

    # send reply via Composio
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            await client.post(
                f"{COMPOSIO_API_URL}/actions/execute",
                headers={"x-api-key": api_key, "Content-Type": "application/json"},
                json={
                    "action": "GMAIL_REPLY_TO_THREAD",
                    "input": {
                        "message_id": message_id,
                        "reply_body": draft,
                    },
                },
            )
        except Exception as e:
            print(f"[DealCloser] Failed to send reply: {e}")

    # update prospect status
    if prospect:
        new_status = "meeting" if intent == "interested" else "replied"
        supabase.table("prospects").update({"outreach_status": new_status}).eq("id", prospect["id"]).execute()

        if intent == "interested":
            supabase.table("chairman_queue").insert({
                "message": f"🎯 {prospect['company_name']} is INTERESTED — meeting being scheduled",
                "priority": 8,
                "requires_action": False,
            }).execute()

    return {"handled": True, "action": f"replied_{intent}"}


async def run():
    start = datetime.now(timezone.utc)
    print(f"[DealCloser] Starting run at {start.isoformat()}")

    api_key = os.environ.get("COMPOSIO_API_KEY", "")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    if not api_key:
        print("[DealCloser] COMPOSIO_API_KEY not set — skipping Gmail fetch")
        await log_agent_run("deal_closer", "skipped", "Composio not configured", duration_ms=0)
        return

    replies = await fetch_gmail_replies(api_key)
    print(f"[DealCloser] Found {len(replies)} unread emails")

    if not replies:
        await log_agent_run("deal_closer", "skipped", "No replies", duration_ms=0)
        return

    results = await asyncio.gather(*[process_reply(r, supabase, api_key) for r in replies])
    handled = sum(1 for r in results if r.get("handled"))

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("deal_closer", "success", f"Handled {handled}/{len(replies)} replies", duration_ms=duration_ms)
    print(f"[DealCloser] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
