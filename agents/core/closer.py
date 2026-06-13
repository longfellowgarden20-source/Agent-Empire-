"""Closer — writes outreach emails for prospects from task queue."""
import asyncio, os, json
from datetime import datetime, timezone
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run

EMAIL_PROMPT = """Write a cold outreach email for this prospect. Be specific, short, and value-focused.

Company: {company}
Industry: {industry}
Pain points: {pain_points}
Decision maker: {decision_maker}
Product we're selling: {product}
How to pitch it: {pitch_angle}

Rules:
- Subject line under 50 chars
- Body under 100 words
- Lead with their specific pain point
- One concrete outcome our product delivers
- Clear CTA (15-min call or free trial)
- No fluff, no buzzwords, no "I hope this finds you well"

Return ONLY valid JSON (no markdown):
{{
  "subject": "...",
  "body": "..."
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print("[Closer] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # pull pending outreach tasks
    tasks = sb.table("task_queue").select("*").eq("to_agent", "closer").eq("status", "pending").limit(5).execute()

    if not tasks.data:
        print("[Closer] No tasks")
        await log_agent_run("closer", "skipped", "No pending tasks", duration_ms=0)
        return

    written = 0
    for task in tasks.data:
        try:
            prospect_id = task["payload"].get("prospect_id")
            if not prospect_id:
                continue

            prospect = sb.table("prospects").select("*").eq("id", prospect_id).single().execute()
            if not prospect.data:
                continue

            p = prospect.data
            intel = p.get("intel", {})

            pitch_angle = task["payload"].get("pitch_angle", "")
            for_company = intel.get("for_company", "our AI automation service")
            raw = await groq_llm(EMAIL_PROMPT.format(
                company=p.get("company_name", ""),
                industry=p.get("industry", ""),
                pain_points=", ".join(intel.get("pain_points", [])),
                decision_maker=intel.get("decision_maker_title", "Owner"),
                product=for_company,
                pitch_angle=pitch_angle or "Focus on time saved and ROI. Offer a free trial.",
            ), max_tokens=400)

            cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            email = json.loads(cleaned)

            sb.table("prospects").update({
                "outreach_status": "email_ready",
                "intel": {**intel, "email_subject": email.get("subject"), "email_body": email.get("body")},
            }).eq("id", prospect_id).execute()

            sb.table("task_queue").update({"status": "done"}).eq("id", task["id"]).execute()
            written += 1
            await asyncio.sleep(2)

        except Exception as e:
            print(f"[Closer] Task {task['id']} failed: {e}")
            sb.table("task_queue").update({"status": "failed"}).eq("id", task["id"]).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("closer", "success", f"Wrote {written} emails", duration_ms=duration_ms)
    print(f"[Closer] Done — {written} emails written")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
