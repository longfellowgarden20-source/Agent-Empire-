"""
Scoring Skills — standardized quality + business scoring used by War Room and Quality Inspector.
"""
from .llm_skills import smart_llm, cheap_llm

async def score_business(company_id: str, revenue_7d: float, revenue_prev_7d: float,
                          agent_health_pct: float, market_growing: bool) -> dict:
    """
    Score a business 0-100 for War Room weekly review.
    < 20 = recommend shutdown
    < 40 = flag for review
    > 80 = scale up
    """
    revenue_score = min(40, (revenue_7d / max(1, revenue_prev_7d)) * 20)
    growth_score = 25 if revenue_7d > revenue_prev_7d * 1.1 else 15 if revenue_7d >= revenue_prev_7d else 5
    health_score = agent_health_pct * 0.2
    market_score = 15 if market_growing else 5
    total = round(revenue_score + growth_score + health_score + market_score, 1)

    if total < 20:
        recommendation = "SHUTDOWN"
    elif total < 40:
        recommendation = "REVIEW"
    elif total > 80:
        recommendation = "SCALE"
    else:
        recommendation = "HOLD"

    return {"company_id": company_id, "score": total, "recommendation": recommendation,
            "breakdown": {"revenue": revenue_score, "growth": growth_score,
                          "health": health_score, "market": market_score}}

async def score_lead(prospect_data: dict) -> int:
    """Score a sales prospect 1-10. Only pass 7+ to Copywriter."""
    prompt = f"""Score this prospect 1-10 for a web agency outreach.

Company: {prospect_data.get('name')}
Website: {prospect_data.get('website', 'unknown')}
Industry: {prospect_data.get('industry', 'unknown')}
Size: {prospect_data.get('size', 'unknown')}
Recent news: {prospect_data.get('news', 'none')}

Score criteria:
- 9-10: Clear need, budget signals, decision maker identified
- 7-8: Good fit, some buying signals
- 5-6: Possible fit, need more research
- 1-4: Poor fit or no budget signals

Return ONLY a number 1-10."""
    result = await cheap_llm(prompt, max_tokens=5)
    try:
        return int(result.strip())
    except ValueError:
        return 5

async def score_content(content: str, criteria: list[str] | None = None) -> dict:
    """Score content quality 1-10 on specified criteria."""
    crit = criteria or ["clarity", "engagement", "accuracy", "actionability"]
    prompt = f"""Score this content on each criterion 1-10:

CONTENT:
{content[:1000]}

CRITERIA: {', '.join(crit)}

Return JSON: {{"criterion": score, ...}}
Only return valid JSON, nothing else."""
    result = await cheap_llm(prompt, max_tokens=100)
    import json
    try:
        scores = json.loads(result)
        avg = sum(scores.values()) / len(scores)
        return {"scores": scores, "average": round(avg, 1)}
    except Exception:
        return {"scores": {c: 5 for c in crit}, "average": 5.0}

async def score_idea(idea: str, market_data: str) -> dict:
    """Score a business idea 1-100. Only ideas 80+ get green-lit."""
    prompt = f"""Score this business idea 1-100 based on the market data.

IDEA: {idea}

MARKET DATA (live, fetched right now):
{market_data}

Score on:
- Market size (25pts): Is this a real, growing market?
- Buildability (25pts): Can AI agents run this with minimal human input?
- Competition (25pts): Is there room to compete?
- Revenue clarity (25pts): Clear path to $X/month?

Return JSON: {{"score": int, "market": int, "buildability": int, "competition": int, "revenue": int, "reasoning": "one sentence"}}"""
    result = await smart_llm(prompt, max_tokens=200)
    import json
    try:
        return json.loads(result)
    except Exception:
        return {"score": 0, "reasoning": "Scoring failed"}
