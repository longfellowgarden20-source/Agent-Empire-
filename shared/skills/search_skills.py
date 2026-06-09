"""
Search Skills — live internet access for every agent.
Rule: ALWAYS call these before making any decision. Never rely on training data.
"""
import os
import httpx
from typing import Any

async def live_search(query: str, max_results: int = 5) -> list[dict]:
    """
    Tavily real-time web search. Returns structured content ready for LLMs.
    Use for: news, competitor research, market data, any current information.
    """
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        return [{"title": "No results", "content": "TAVILY_API_KEY not configured", "url": ""}]
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "advanced",
                "max_results": max_results,
                "include_answer": True,
                "include_raw_content": False,
            }
        )
        res.raise_for_status()
        data = res.json()
        return data.get("results", [])

async def deep_research(query: str) -> str:
    """
    Perplexity Sonar — deep research with citations. 200B+ page index.
    Use for: market research, competitor analysis, technical deep dives.
    Returns answer with inline citations.
    """
    api_key = os.environ.get("PERPLEXITY_API_KEY")
    if not api_key:
        # fallback to Tavily if Perplexity not configured
        results = await live_search(query, max_results=8)
        return "\n\n".join(f"{r.get('title','')}: {r.get('content','')}" for r in results)
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            "https://api.perplexity.ai/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "sonar-pro",
                "messages": [{"role": "user", "content": query}],
                "max_tokens": 1000,
            }
        )
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"]

async def search_reddit(topic: str, subreddits: list[str] | None = None) -> list[dict]:
    """Search Reddit for real conversations about a topic."""
    sub_filter = " OR ".join(f"site:reddit.com/r/{s}" for s in subreddits) if subreddits else "site:reddit.com"
    query = f"{topic} {sub_filter}"
    return await live_search(query, max_results=10)

async def search_competitors(company_name: str, market: str) -> str:
    """Deep research on a specific competitor."""
    query = f"{company_name} {market} pricing features reviews 2026"
    return await deep_research(query)

async def get_trending_topics(niche: str) -> list[dict]:
    """Find what's trending in a niche right now."""
    query = f"trending {niche} 2026 most popular growing"
    return await live_search(query, max_results=8)
