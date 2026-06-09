"""
SEO Agent — Tier 5 Content.
Tavily search for keyword gaps in your niche. Writes SEO-optimized content brief.
Weekly.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search
from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

SEO_NICHES = [
    "AI automation for small business",
    "AI agents for ecommerce",
    "autonomous business systems",
    "AI-powered lead generation",
]

SEO_PROMPT = """You are an SEO strategist finding keyword opportunities for an AI automation brand.

Niche: {niche}
Competitor content found:
{competitor_content}

Identify 5 keyword opportunities with low competition and high intent. For each:

Return JSON:
{{
  "opportunities": [
    {{
      "keyword": "<target keyword>",
      "monthly_searches_estimate": "<low|medium|high>",
      "competition": "<low|medium|high>",
      "intent": "<informational|commercial|transactional>",
      "content_angle": "<specific article angle>",
      "content_brief": "<3-4 sentence outline>",
      "why_we_win": "<our competitive advantage>",
      "priority": <1-10>
    }}
  ],
  "niche_gap": "<biggest content gap in this niche>"
}}"""


async def find_keyword_gaps(niche: str, supabase) -> list[dict]:
    queries = [
        f"best {niche} guide 2026",
        f"how to {niche} step by step",
        f"{niche} vs alternatives comparison",
    ]
    batches = await asyncio.gather(*[live_search(q, max_results=4) for q in queries])

    competitor_content = ""
    for batch in batches:
        for r in batch:
            competitor_content += f"\n[{r.get('title', '')}] {r.get('url', '')}\n{r.get('content', '')[:200]}\n"

    raw = await agent_llm(
        SEO_PROMPT.format(niche=niche, competitor_content=competitor_content[:2500]),
        max_tokens=800,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
        return result.get("opportunities", [])
    except Exception:
        return []


async def run():
    start = datetime.now(timezone.utc)
    print(f"[SEOAgent] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    all_opportunities = []
    for niche in SEO_NICHES:
        print(f"[SEOAgent] Analyzing niche: {niche}")
        opps = await find_keyword_gaps(niche, supabase)
        all_opportunities.extend(opps)

    # filter top 10 by priority
    all_opportunities.sort(key=lambda x: -x.get("priority", 0))
    top_opps = all_opportunities[:10]

    for opp in top_opps:
        supabase.table("task_queue").insert({
            "from_agent": "seo_agent",
            "to_agent": "writer",
            "task_type": "write_article",
            "payload": {
                "topic": {
                    "title": opp.get("content_angle", opp.get("keyword", "")),
                    "hook": opp.get("content_brief", "")[:100],
                    "angle": "how-to",
                    "audience": "entrepreneurs",
                    "keyword": opp.get("keyword", ""),
                    "format": "blog",
                    "priority": opp.get("priority", 5),
                },
                "cta": "Get our free AI automation toolkit",
                "seo_data": opp,
            },
            "priority": opp.get("priority", 5),
            "status": "pending",
        }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("seo_agent", "success", f"Found {len(top_opps)} keyword opportunities across {len(SEO_NICHES)} niches", duration_ms=duration_ms)
    print(f"[SEOAgent] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
