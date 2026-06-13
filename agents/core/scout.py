"""Scout — finds ideas, validates markets, tracks trends. One Groq call."""
import asyncio, os, json
from datetime import datetime, timezone
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run

PROMPT = """You are a startup scout for an AI business empire. Do all three tasks in one response.

1. IDEA GENERATION: Generate 5 business ideas AI agents can build and monetize in 30 days.
2. MARKET TRENDS: List 3 fast-growing markets right now with a clear opportunity.
3. COMPETITOR GAPS: Name 2 crowded markets where the top tools are overpriced or outdated.

Return ONLY valid JSON (no markdown):
{
  "ideas": [
    {
      "title": "...",
      "description": "2-3 sentences on problem and solution",
      "score": <6-10>,
      "market_size": "<small|medium|large>",
      "revenue_model": "...",
      "reasoning": "..."
    }
  ],
  "trends": [
    {"market": "...", "opportunity": "..."}
  ],
  "gaps": [
    {"market": "...", "gap": "..."}
  ]
}"""


async def run():
    start = datetime.now(timezone.utc)
    print("[Scout] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    try:
        raw = await groq_llm(PROMPT, max_tokens=2000)
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(cleaned)

        ideas = data.get("ideas", [])
        winners = [i for i in ideas if isinstance(i.get("score"), (int, float)) and i["score"] >= 6]

        for idea in winners:
            sb.table("ideas").insert({
                "title": idea.get("title", "Untitled"),
                "description": idea.get("description", ""),
                "source": "scout",
                "raw_score": int(idea.get("score", 6) * 10),
                "status": "raw",
                "market_data": {
                    "market_size": idea.get("market_size"),
                    "reasoning": idea.get("reasoning"),
                    "revenue_model": idea.get("revenue_model"),
                },
            }).execute()

        # save trends + gaps to oracle_intelligence
        for t in data.get("trends", []):
            sb.table("oracle_intelligence").insert({
                "category": "market",
                "ticker_or_topic": t.get("market", ""),
                "summary": t.get("opportunity", ""),
                "relevance_score": 7,
            }).execute()

        for g in data.get("gaps", []):
            sb.table("oracle_intelligence").insert({
                "category": "ai",
                "ticker_or_topic": g.get("market", ""),
                "summary": f"Gap: {g.get('gap', '')}",
                "relevance_score": 8,
            }).execute()

        if winners:
            top = max(winners, key=lambda x: x.get("score", 0))
            sb.table("chairman_queue").insert({
                "message": f"💡 Scout found {len(winners)} ideas. Top: {top['title']} ({top.get('score')}/10)",
                "priority": 6,
                "requires_action": False,
            }).execute()

        duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        await log_agent_run("scout", "success", f"{len(winners)} ideas, {len(data.get('trends',[]))} trends", duration_ms=duration_ms)
        print(f"[Scout] Done — {len(winners)} ideas saved")

    except Exception as e:
        print(f"[Scout] Failed: {e}")
        await log_agent_run("scout", "failed", str(e), duration_ms=0)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
