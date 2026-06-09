"""
Support Agent — Tier 6 Ecommerce.
Reads task_queue for support tickets. Drafts responses using agent_llm.
Saves to agent_memory. Escalates complex cases to chairman_queue.
Every 30 min.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.llm_skills import agent_llm, fast_llm
from shared.skills.scoring_skills import log_agent_run

RESPONSE_PROMPT = """You are a friendly, professional customer support agent for an ecommerce business.

Customer message: {message}
Order context: {order_context}
Product: {product_name}

Write a helpful response that:
1. Acknowledges their issue empathetically
2. Provides a clear solution or next step
3. Offers compensation if warranted (refund/replacement threshold: >$50 order or CSAT risk)
4. Ends with a positive note

Keep it under 150 words. Human, warm tone.
Return JSON:
{{
  "response": "<draft response>",
  "action_required": "<REFUND|REPLACE|ESCALATE|NONE>",
  "escalate": <true/false>,
  "escalation_reason": "<reason if escalating, else null>",
  "sentiment_score": <1-10>
}}"""

TRIAGE_PROMPT = """Classify this support ticket.
Message: {message}

Return JSON: {{"complexity": "<simple|complex>", "category": "<return|shipping|product|billing|other>", "urgency": "<low|medium|high>"}}"""


async def handle_ticket(task: dict, supabase) -> bool:
    payload = task.get("payload", {})
    message = payload.get("message", "")
    order_context = json.dumps(payload.get("order") or {})[:300]
    product_name = payload.get("product_name", "unknown product")

    # quick triage
    triage_raw = await fast_llm(
        TRIAGE_PROMPT.format(message=message[:500]),
        max_tokens=100,
    )
    triage_cleaned = triage_raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        triage = json.loads(triage_cleaned)
    except Exception:
        triage = {"complexity": "simple", "category": "other", "urgency": "low"}

    print(f"[SupportAgent] Ticket: {triage.get('category')} / {triage.get('complexity')} / {triage.get('urgency')}")

    raw = await agent_llm(
        RESPONSE_PROMPT.format(
            message=message[:600],
            order_context=order_context,
            product_name=product_name,
        ),
        max_tokens=400,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
    except Exception as e:
        print(f"[SupportAgent] Parse error: {e}")
        return False

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    supabase.table("agent_memory").insert({
        "agent": "support_agent",
        "key": f"support_{ts}",
        "value": {
            "ticket_id": task.get("id"),
            "original_message": message,
            "response": result.get("response", ""),
            "action_required": result.get("action_required", "NONE"),
            "triage": triage,
            "handled_at": datetime.now(timezone.utc).isoformat(),
        },
    }).execute()

    if result.get("escalate") or triage.get("complexity") == "complex" or triage.get("urgency") == "high":
        supabase.table("chairman_queue").insert({
            "agent": "support_agent",
            "priority": 8,
            "message": f"[SUPPORT ESCALATION] {triage.get('category')} — {message[:100]}... Action needed: {result.get('escalation_reason', 'Complex case')}",
            "data": {"task_id": task.get("id"), "triage": triage, "response_draft": result},
            "status": "pending",
        }).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[SupportAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    tasks = supabase.table("task_queue").select("*").eq("to_agent", "support_agent").eq("status", "pending").order("priority", desc=True).limit(20).execute()
    if not tasks.data:
        print("[SupportAgent] No support tickets")
        await log_agent_run("support_agent", "skipped", "No tickets", duration_ms=0)
        return

    task_ids = [t["id"] for t in tasks.data]
    supabase.table("task_queue").update({"status": "in_progress", "picked_up_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    results = await asyncio.gather(*[handle_ticket(t, supabase) for t in tasks.data])

    supabase.table("task_queue").update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    success_count = sum(1 for r in results if r)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("support_agent", "success", f"Handled {success_count} tickets", duration_ms=duration_ms)
    print(f"[SupportAgent] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
