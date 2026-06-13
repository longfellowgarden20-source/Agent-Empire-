"""Prospector — finds leads targeted to active companies. One Groq call."""
import asyncio, os, json
from datetime import datetime, timezone
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run

PROMPT = """You are a B2B sales prospector. Find leads for this specific product.

Product: {product_name}
Tagline: {tagline}
Target customer: {target_customer}
Problem we solve: {problem}
Pricing: {pricing}
How to pitch: {closer_instructions}

Generate 8 realistic potential client companies that match this exact target customer profile.

Return ONLY valid JSON array (no markdown):
[
  {{
    "company_name": "...",
    "website": "https://...",
    "industry": "...",
    "score": <6-10>,
    "pain_points": ["...", "..."],
    "decision_maker_title": "...",
    "reasoning": "One sentence why they match the target customer profile"
  }}
]"""

GENERIC_PROMPT = """You are a B2B sales prospector for an AI automation agency.

Generate 8 realistic potential client companies that would pay for AI automation services.
Target: small-to-mid businesses spending too much time on repetitive tasks.

Return ONLY valid JSON array (no markdown):
[
  {{
    "company_name": "...",
    "website": "https://...",
    "industry": "...",
    "score": <6-10>,
    "pain_points": ["...", "..."],
    "decision_maker_title": "...",
    "reasoning": "One sentence why they'd buy"
  }}
]"""


async def run():
    start = datetime.now(timezone.utc)
    print("[Prospector] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    try:
        # check for active companies with agent instructions
        companies = sb.table("businesses").select("*").in_("status", ["building", "active"]).limit(5).execute()
        active = [c for c in (companies.data or []) if c.get("manifest", {}).get("agent_instructions", {}).get("prospector")]

        if active:
            # prospect for each active company
            total_qualified = 0
            for company in active[:2]:  # max 2 per run to save rate limits
                manifest = company.get("manifest", {})
                instructions = manifest.get("agent_instructions", {})
                prompt = PROMPT.format(
                    product_name=company.get("name", ""),
                    tagline=manifest.get("tagline", ""),
                    target_customer=manifest.get("target_customer", ""),
                    problem=manifest.get("problem", ""),
                    pricing=manifest.get("pricing", ""),
                    closer_instructions=instructions.get("closer", ""),
                )
                raw = await groq_llm(prompt, max_tokens=1500)
                cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                prospects = json.loads(cleaned)
                if not isinstance(prospects, list):
                    continue

                qualified = [p for p in prospects if isinstance(p.get("score"), (int, float)) and p["score"] >= 7]
                print(f"[Prospector] {len(qualified)} qualified for {company['name']}")

                for p in qualified:
                    result = sb.table("prospects").insert({
                        "company_name": p.get("company_name", "Unknown"),
                        "website": p.get("website", ""),
                        "industry": p.get("industry", ""),
                        "score": int(p.get("score", 7)),
                        "outreach_status": "new",
                        "intel": {
                            "pain_points": p.get("pain_points", []),
                            "decision_maker_title": p.get("decision_maker_title", ""),
                            "reasoning": p.get("reasoning", ""),
                            "for_company": company.get("name", ""),
                            "for_company_id": company.get("id", ""),
                        },
                    }).execute()

                    if result.data:
                        sb.table("task_queue").insert({
                            "from_agent": "prospector",
                            "to_agent": "closer",
                            "task_type": "write_outreach",
                            "payload": {
                                "prospect_id": result.data[0]["id"],
                                "company_id": company.get("id"),
                                "pitch_angle": instructions.get("closer", ""),
                            },
                            "priority": int(p.get("score", 7)),
                            "status": "pending",
                        }).execute()

                total_qualified += len(qualified)
                await asyncio.sleep(3)

        else:
            # no companies yet — prospect generically for the agency itself
            raw = await groq_llm(GENERIC_PROMPT, max_tokens=1500)
            cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            prospects = json.loads(cleaned)
            if not isinstance(prospects, list):
                prospects = []

            qualified = [p for p in prospects if isinstance(p.get("score"), (int, float)) and p["score"] >= 7]
            print(f"[Prospector] {len(qualified)} generic prospects")

            for p in qualified:
                result = sb.table("prospects").insert({
                    "company_name": p.get("company_name", "Unknown"),
                    "website": p.get("website", ""),
                    "industry": p.get("industry", ""),
                    "score": int(p.get("score", 7)),
                    "outreach_status": "new",
                    "intel": {
                        "pain_points": p.get("pain_points", []),
                        "decision_maker_title": p.get("decision_maker_title", ""),
                        "reasoning": p.get("reasoning", ""),
                        "for_company": "Agent Empire Agency",
                    },
                }).execute()

                if result.data:
                    sb.table("task_queue").insert({
                        "from_agent": "prospector",
                        "to_agent": "closer",
                        "task_type": "write_outreach",
                        "payload": {"prospect_id": result.data[0]["id"]},
                        "priority": int(p.get("score", 7)),
                        "status": "pending",
                    }).execute()

            total_qualified = len(qualified)

        duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        await log_agent_run("prospector", "success", f"{total_qualified} prospects queued", duration_ms=duration_ms)
        print(f"[Prospector] Done — {total_qualified} prospects")

    except Exception as e:
        print(f"[Prospector] Failed: {e}")
        await log_agent_run("prospector", "failed", str(e), duration_ms=0)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
