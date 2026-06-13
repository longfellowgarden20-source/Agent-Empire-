"""Builder — takes validated ideas and writes a build spec + starter code."""
import asyncio, os, json
from datetime import datetime, timezone
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run

SPEC_PROMPT = """You are a technical architect for an AI startup.

Given this validated business idea, create a build spec.

Idea: {title}
Description: {description}
Revenue model: {revenue_model}

Return ONLY valid JSON (no markdown):
{{
  "product_name": "...",
  "tech_stack": ["..."],
  "agent_roster": ["..."],
  "mvp_features": ["...", "...", "..."],
  "revenue_model": "...",
  "first_customer_path": "How to get first paying customer in 7 days",
  "estimated_build_days": <1-14>
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print("[Builder] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # find validated ideas without specs
    ideas = sb.table("ideas").select("*").eq("status", "validated").is_("spec", "null").limit(3).execute()

    if not ideas.data:
        print("[Builder] No validated ideas to spec")
        await log_agent_run("builder", "skipped", "No validated ideas", duration_ms=0)
        return

    built = 0
    for idea in ideas.data:
        try:
            md = idea.get("market_data") or {}
            raw = await groq_llm(SPEC_PROMPT.format(
                title=idea.get("title", ""),
                description=idea.get("description", ""),
                revenue_model=md.get("revenue_model", "subscription"),
            ), max_tokens=800)

            cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            spec = json.loads(cleaned)

            sb.table("ideas").update({
                "spec": spec,
                "status": "building",
            }).eq("id", idea["id"]).execute()

            sb.table("chairman_queue").insert({
                "message": f"🏗️ Builder specced '{idea['title']}' — {spec.get('estimated_build_days', '?')} day build",
                "priority": 7,
                "requires_action": True,
            }).execute()

            built += 1
            await asyncio.sleep(3)

        except Exception as e:
            print(f"[Builder] Failed on idea {idea['id']}: {e}")

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("builder", "success", f"Specced {built} ideas", duration_ms=duration_ms)
    print(f"[Builder] Done — {built} specs written")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
