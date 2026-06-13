"""Builder — takes validated ideas and writes a real actionable spec + registers the company."""
import asyncio, os, json
from datetime import datetime, timezone
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run

SPEC_PROMPT = """You are a technical architect for an AI startup empire. A validated idea needs a REAL build spec that a developer can execute immediately.

Idea: {title}
Description: {description}
Revenue model: {revenue_model}

Produce a spec detailed enough that a developer (or Claude) can build the full MVP in one session.

Return ONLY valid JSON (no markdown):
{{
  "product_name": "...",
  "tagline": "one sentence value prop",
  "target_customer": "exact customer type, e.g. 'solo freelancers charging under $5k/mo'",
  "problem": "the specific pain in one sentence",
  "solution": "what we build that solves it",
  "revenue_model": "...",
  "pricing": "e.g. $49/mo or $299 one-time",
  "tech_stack": {{
    "frontend": "Next.js 15 App Router on Vercel",
    "backend": "Python FastAPI on Railway",
    "database": "Supabase (Postgres)",
    "llm": "Groq llama-3.3-70b-versatile"
  }},
  "db_tables": [
    {{
      "name": "table_name",
      "columns": ["id uuid PK", "..."],
      "purpose": "one line"
    }}
  ],
  "api_routes": [
    {{
      "method": "POST",
      "path": "/api/...",
      "does": "one line description"
    }}
  ],
  "mvp_features": ["feature 1", "feature 2", "feature 3"],
  "agent_instructions": {{
    "prospector": "Who to target as leads. E.g. 'Find SaaS founders with 1-10 employees who post on LinkedIn about productivity'",
    "content": "What to write about. E.g. 'Tweets about time saved, LinkedIn posts showing ROI numbers'",
    "closer": "How to pitch. E.g. 'Lead with the specific pain point, offer a free 7-day trial, CTA is a 15-min demo'"
  }},
  "first_customer_path": "Exact steps to get first paying customer in 7 days",
  "estimated_build_days": <1-5>,
  "estimated_mrr_30d": "$X-Y MRR realistic in 30 days"
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print("[Builder] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # find validated ideas without specs
    ideas = sb.table("ideas").select("*").eq("status", "validated").is_("spec", None).limit(3).execute()

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
            ), max_tokens=1500)

            cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            spec = json.loads(cleaned)

            # update idea with spec
            sb.table("ideas").update({
                "spec": spec,
                "status": "building",
            }).eq("id", idea["id"]).execute()

            # register company so all agents can find it
            import re
            slug = re.sub(r"[^a-z0-9-]", "", spec.get("product_name", idea["title"]).lower().replace(" ", "-").replace("_", "-"))[:60]
            existing = sb.table("businesses").select("id").eq("slug", slug).execute()
            if not existing.data:
                sb.table("businesses").insert({
                    "name": spec.get("product_name", idea["title"]),
                    "slug": slug,
                    "status": "building",
                    "agent_count": 3,
                    "manifest": {
                        "idea_id": idea["id"],
                        "tagline": spec.get("tagline", ""),
                        "target_customer": spec.get("target_customer", ""),
                        "problem": spec.get("problem", ""),
                        "solution": spec.get("solution", ""),
                        "pricing": spec.get("pricing", ""),
                        "agent_instructions": spec.get("agent_instructions", {}),
                        "first_customer_path": spec.get("first_customer_path", ""),
                        "estimated_mrr_30d": spec.get("estimated_mrr_30d", ""),
                        "tech_stack": spec.get("tech_stack", {}),
                        "db_tables": spec.get("db_tables", []),
                        "api_routes": spec.get("api_routes", []),
                        "mvp_features": spec.get("mvp_features", []),
                    },
                }).execute()

            sb.table("chairman_queue").insert({
                "message": (
                    f"🏗️ Builder specced '{spec.get('product_name', idea['title'])}' — "
                    f"{spec.get('estimated_build_days', '?')} day build · "
                    f"{spec.get('estimated_mrr_30d', '?')} MRR target. "
                    f"Ready for Claude to implement."
                ),
                "priority": 8,
                "requires_action": True,
            }).execute()

            built += 1
            print(f"[Builder] Specced: {spec.get('product_name')}")
            await asyncio.sleep(3)

        except Exception as e:
            print(f"[Builder] Failed on idea {idea['id']}: {e}")

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("builder", "success", f"Specced {built} ideas, registered {built} companies", duration_ms=duration_ms)
    print(f"[Builder] Done — {built} specs written")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
