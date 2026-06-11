"""
Idea Hunter — Tier 2 Builder.
Finds real problems people are paying to solve RIGHT NOW.
Scores every idea 1-10. Only surfaces 8+.
Runs daily 6:30am ET. Writes to ideas table.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.search_skills import live_search, search_reddit, get_trending_topics
from shared.skills.llm_skills import smart_llm, fast_llm
from shared.skills.scoring_skills import log_agent_run

SEARCH_QUERIES = [
    ("reddit", "I wish there was a tool that site:reddit.com"),
    ("reddit", "frustrated with my current software site:reddit.com entrepreneur"),
    ("reddit", "paying too much for site:reddit.com SaaS tool"),
    ("trends", "fastest growing SaaS tools 2026 new market opportunity"),
    ("trends", "problems businesses are willing to pay to solve 2026"),
    ("twitter", "site:twitter.com I'd pay for a tool that automates"),
    ("forums", "site:indiehackers.com validated idea revenue"),
    ("forums", "site:news.ycombinator.com Ask HN who wants this built"),
]

SCORE_PROMPT = """You are an expert startup idea evaluator. Score this business idea from 1-10 on:
- Market size (are people actually paying for this?)
- Competition (is there a clear gap?)
- Buildability with AI agents (can we automate 90%+ of this?)
- Speed to revenue (can we charge in < 30 days?)

Idea: {idea}
Source context: {context}

Respond ONLY with valid JSON:
{{
  "score": <1-10>,
  "market_size": "<small|medium|large>",
  "reasoning": "<one sentence>",
  "revenue_model": "<how we'd charge>",
  "kill_reason": "<why this might fail, or null>"
}}"""


async def extract_ideas_from_results(results: list[dict], source: str) -> list[dict]:
    if not results:
        return []

    combined = "\n\n".join(
        f"[{r.get('title', '')}]\n{r.get('content', '')[:400]}" for r in results[:5]
    )

    raw = await fast_llm(
        f"Extract 2-3 distinct business ideas from these search results. "
        f"Each idea should be a real problem people want solved.\n\n{combined}",
        system="Return a JSON array of objects: [{\"title\": \"...\", \"description\": \"...\"}]. Nothing else.",
        max_tokens=400,
    )

    try:
        # strip markdown code fences if present
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        ideas = json.loads(cleaned)
        for idea in ideas:
            idea["source"] = source
        return ideas if isinstance(ideas, list) else []
    except Exception:
        return []


async def score_idea(idea: dict) -> dict | None:
    prompt = SCORE_PROMPT.format(
        idea=idea.get("title", "") + " — " + idea.get("description", ""),
        context=idea.get("source", ""),
    )
    try:
        raw = await smart_llm(prompt, max_tokens=300)
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        scored = json.loads(cleaned)
        idea.update(scored)
        return idea
    except Exception as e:
        print(f"[IdeaHunter] Failed to score idea '{idea.get('title')}': {e}")
        return None


DIRECT_IDEA_PROMPT = """You are an expert startup idea scout. Generate 8 high-quality business ideas that AI agents could build and operate autonomously.

Focus on:
- Real problems people are actively paying to solve right now
- SaaS tools, automation services, lead gen, content, ecommerce
- Ideas where 90%+ of the work can be done by AI agents
- Revenue achievable within 30 days

For each idea respond with a JSON array (no markdown fences):
[
  {
    "title": "Short idea name",
    "description": "2-3 sentences on the problem, solution, and customer",
    "source": "market_research",
    "score": <6-10>,
    "market_size": "<small|medium|large>",
    "reasoning": "One sentence on why this will make money",
    "revenue_model": "How we charge (e.g. $99/mo SaaS)",
    "kill_reason": "Biggest risk or null"
  }
]"""


async def run():
    start = datetime.now(timezone.utc)
    print(f"[IdeaHunter] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    # Try live search first; if Tavily exhausted fall back to single direct LLM call
    all_ideas: list[dict] = []

    try:
        results = await live_search(SEARCH_QUERIES[0][1], max_results=5)
        tavily_ok = bool(results and results[0].get("url", "").startswith("http"))
    except Exception:
        tavily_ok = False

    if tavily_ok:
        # Full pipeline: search → extract → score
        all_results = []
        for i in range(0, len(SEARCH_QUERIES), 3):
            batch = SEARCH_QUERIES[i:i+3]
            batch_results = await asyncio.gather(
                *[live_search(query, max_results=5) for _, query in batch],
                return_exceptions=True,
            )
            all_results.extend(batch_results)
            if i + 3 < len(SEARCH_QUERIES):
                await asyncio.sleep(3)

        for i, results in enumerate(all_results):
            if isinstance(results, Exception) or not results:
                continue
            source = SEARCH_QUERIES[i][0]
            ideas = await extract_ideas_from_results(results, source)
            all_ideas.extend(ideas)
            await asyncio.sleep(2)

        print(f"[IdeaHunter] Extracted {len(all_ideas)} raw ideas (live search)")

        scored_raw = []
        for i in range(0, len(all_ideas), 3):
            batch = await asyncio.gather(*[score_idea(idea) for idea in all_ideas[i:i+3]])
            scored_raw.extend(batch)
            if i + 3 < len(all_ideas):
                await asyncio.sleep(3)
        scored = [s for s in scored_raw if s is not None]
    else:
        # Direct mode: one LLM call generates scored ideas without any search
        print("[IdeaHunter] Live search unavailable — using direct LLM idea generation")
        import json as _json
        try:
            raw = await fast_llm(DIRECT_IDEA_PROMPT, max_tokens=2000)
            cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            ideas = _json.loads(cleaned)
            scored = ideas if isinstance(ideas, list) else []
            print(f"[IdeaHunter] Direct LLM returned {len(scored)} ideas")
        except Exception as e:
            print(f"[IdeaHunter] Direct LLM failed: {e}")
            scored = []
    scored = [s for s in scored if s is not None]

    # only keep 6+
    winners = [s for s in scored if isinstance(s.get("score"), (int, float)) and s["score"] >= 6]
    print(f"[IdeaHunter] {len(winners)} ideas scored 6+")

    # write winners to DB
    for idea in winners:
        supabase.table("ideas").insert({
            "title": idea.get("title", "Untitled"),
            "description": idea.get("description", ""),
            "source": idea.get("source", "unknown"),
            "raw_score": int(idea.get("score", 0) * 10),  # store as 0-100
            "status": "raw",
            "market_data": {
                "market_size": idea.get("market_size"),
                "reasoning": idea.get("reasoning"),
                "revenue_model": idea.get("revenue_model"),
                "kill_reason": idea.get("kill_reason"),
            },
        }).execute()

    # notify chairman if strong ideas found
    if winners:
        top = sorted(winners, key=lambda x: x.get("score", 0), reverse=True)[0]
        supabase.table("chairman_queue").insert({
            "message": f"💡 Idea Hunter found {len(winners)} strong ideas. Top: '{top['title']}' (score {top.get('score')}/10)",
            "priority": 6,
            "requires_action": False,
        }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("idea_hunter", "success", f"Found {len(winners)} ideas scoring 6+", duration_ms=duration_ms)
    print(f"[IdeaHunter] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
