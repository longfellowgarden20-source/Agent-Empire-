"""Intel — market news, macro trends, sector signals. One Groq call."""
import asyncio, os, json
from datetime import datetime, timezone
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run

PROMPT = """You are a market intelligence analyst for an AI business empire.

Generate a morning intelligence briefing covering:
1. AI & Tech: 3 significant developments in AI/SaaS this week
2. Markets: 2 macro signals businesses should watch
3. Opportunities: 2 underserved niches with growing demand right now

Return ONLY valid JSON (no markdown):
{
  "ai_tech": [
    {"headline": "...", "impact": "...", "relevance_score": <6-10>}
  ],
  "markets": [
    {"signal": "...", "implication": "..."}
  ],
  "opportunities": [
    {"niche": "...", "reason": "...", "urgency": "<low|medium|high>"}
  ]
}"""


async def run():
    start = datetime.now(timezone.utc)
    print("[Intel] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    try:
        raw = await groq_llm(PROMPT, max_tokens=1200)
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(cleaned)

        rows = []
        for item in data.get("ai_tech", []):
            rows.append({
                "category": "ai",
                "ticker_or_topic": "AI/Tech",
                "summary": f"{item.get('headline', '')} — {item.get('impact', '')}",
                "relevance_score": item.get("relevance_score", 7),
            })
        for item in data.get("markets", []):
            rows.append({
                "category": "market",
                "ticker_or_topic": "Macro",
                "summary": f"{item.get('signal', '')} — {item.get('implication', '')}",
                "relevance_score": 7,
            })
        for item in data.get("opportunities", []):
            rows.append({
                "category": "startup",
                "ticker_or_topic": item.get("niche", ""),
                "summary": item.get("reason", ""),
                "relevance_score": 8 if item.get("urgency") == "high" else 6,
            })

        if rows:
            sb.table("oracle_intelligence").insert(rows).execute()

        duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        await log_agent_run("intel", "success", f"Saved {len(rows)} intel items", duration_ms=duration_ms)
        print(f"[Intel] Done — {len(rows)} items")

    except Exception as e:
        print(f"[Intel] Failed: {e}")
        await log_agent_run("intel", "failed", str(e), duration_ms=0)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
