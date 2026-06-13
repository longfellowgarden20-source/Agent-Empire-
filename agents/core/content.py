"""Content — writes tweets, LinkedIn posts, and newsletters for active companies."""
import asyncio, os, json
from datetime import datetime, timezone
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run

COMPANY_PROMPT = """You run content marketing for a SaaS product. Generate a week of content.

Product: {product_name}
Tagline: {tagline}
Target customer: {target_customer}
Problem solved: {problem}
Pricing: {pricing}
Content angle: {content_instructions}

Create:
- 3 tweets (under 280 chars each, specific results/numbers, hooks that make the target customer stop scrolling)
- 2 LinkedIn posts (150-200 words, show the pain → solution → outcome arc, no cringe corporate speak)
- 1 email newsletter intro (subject line + 150 word opener that reads like a human wrote it)

Return ONLY valid JSON (no markdown):
{{
  "tweets": ["...", "...", "..."],
  "linkedin": ["...", "..."],
  "email": {{
    "subject": "...",
    "body": "..."
  }}
}}"""

GENERIC_PROMPT = """You run content for an AI automation agency. Generate a week of content.

The agency helps small businesses automate repetitive tasks using AI agents.

Create:
- 3 tweets (under 280 chars each, hooks about AI automation wins, specific numbers)
- 2 LinkedIn posts (150-200 words, thought leadership, no cringe)
- 1 email newsletter intro (200 words, subject line + body opener)

Return ONLY valid JSON (no markdown):
{{
  "tweets": ["...", "...", "..."],
  "linkedin": ["...", "..."],
  "email": {{
    "subject": "...",
    "body": "..."
  }}
}}"""


async def run():
    start = datetime.now(timezone.utc)
    print("[Content] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    try:
        # check for active companies with content instructions
        companies = sb.table("businesses").select("*").in_("status", ["building", "active"]).limit(5).execute()
        active = [c for c in (companies.data or []) if c.get("manifest", {}).get("agent_instructions", {}).get("content")]

        total_pieces = 0

        if active:
            for company in active[:2]:  # max 2 per run
                manifest = company.get("manifest", {})
                instructions = manifest.get("agent_instructions", {})
                prompt = COMPANY_PROMPT.format(
                    product_name=company.get("name", ""),
                    tagline=manifest.get("tagline", ""),
                    target_customer=manifest.get("target_customer", ""),
                    problem=manifest.get("problem", ""),
                    pricing=manifest.get("pricing", ""),
                    content_instructions=instructions.get("content", ""),
                )
                raw = await groq_llm(prompt, max_tokens=1500)
                cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                data = json.loads(cleaned)

                pieces = []
                for tweet in data.get("tweets", []):
                    pieces.append({"type": "tweet", "content": tweet})
                for post in data.get("linkedin", []):
                    pieces.append({"type": "linkedin", "content": post})
                email = data.get("email", {})
                if email:
                    pieces.append({"type": "email", "content": json.dumps(email)})

                for piece in pieces:
                    sb.table("task_queue").insert({
                        "from_agent": "content",
                        "to_agent": "publish",
                        "task_type": piece["type"],
                        "payload": {
                            "content": piece["content"],
                            "for_company": company.get("name", ""),
                            "for_company_id": company.get("id", ""),
                        },
                        "status": "pending",
                        "priority": 5,
                    }).execute()

                total_pieces += len(pieces)
                print(f"[Content] {len(pieces)} pieces for {company['name']}")
                await asyncio.sleep(3)

        else:
            # no companies yet — generic agency content
            raw = await groq_llm(GENERIC_PROMPT, max_tokens=1500)
            cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            data = json.loads(cleaned)

            pieces = []
            for tweet in data.get("tweets", []):
                pieces.append({"type": "tweet", "content": tweet})
            for post in data.get("linkedin", []):
                pieces.append({"type": "linkedin", "content": post})
            email = data.get("email", {})
            if email:
                pieces.append({"type": "email", "content": json.dumps(email)})

            for piece in pieces:
                sb.table("task_queue").insert({
                    "from_agent": "content",
                    "to_agent": "publish",
                    "task_type": piece["type"],
                    "payload": {"content": piece["content"], "for_company": "Agent Empire Agency"},
                    "status": "pending",
                    "priority": 5,
                }).execute()

            total_pieces = len(pieces)

        duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        await log_agent_run("content", "success", f"Created {total_pieces} content pieces", duration_ms=duration_ms)
        print(f"[Content] Done — {total_pieces} pieces")

    except Exception as e:
        print(f"[Content] Failed: {e}")
        await log_agent_run("content", "failed", str(e), duration_ms=0)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
