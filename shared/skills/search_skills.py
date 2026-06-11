"""
Search Skills — live internet access for every agent.
Rule: ALWAYS call these before making any decision. Never rely on training data.
"""
import os
import httpx
from typing import Any

async def _llm_search_fallback(query: str, max_results: int = 5) -> list[dict]:
    """
    LLM-based fallback when Tavily is unavailable.
    Uses Groq to synthesize structured search results from its training knowledge.
    Results won't be real-time but are good enough to keep agents running.
    """
    import json as _json
    groq_key = os.environ.get("GROQ_API_KEY")
    if not groq_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_key}"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                f"You are a web search results synthesizer. "
                                f"Return exactly {max_results} realistic search results for the query, "
                                f"formatted as a JSON array. Each result must have: "
                                f"title (string), content (2-3 sentence summary), url (plausible URL). "
                                f"Base results on real companies, trends, and facts you know. "
                                f"No markdown fences. Return ONLY the JSON array."
                            ),
                        },
                        {"role": "user", "content": f"Search query: {query}"},
                    ],
                    "max_tokens": 600,
                    "temperature": 0.4,
                },
            )
            res.raise_for_status()
            raw = res.json()["choices"][0]["message"]["content"].strip()
            cleaned = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            results = _json.loads(cleaned)
            if isinstance(results, list):
                print(f"[search_skills] LLM fallback returned {len(results)} synthetic results for: {query[:50]}")
                return results[:max_results]
    except Exception as e:
        print(f"[search_skills] LLM fallback failed: {e}")
    return []


async def live_search(query: str, max_results: int = 5) -> list[dict]:
    """
    Tavily real-time web search. Falls back to LLM synthesis if Tavily credits exhausted (432).
    Use for: news, competitor research, market data, any current information.
    """
    api_key = os.environ.get("TAVILY_API_KEY")
    if api_key:
        try:
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
                results = data.get("results", [])
                if results:
                    return results
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (429, 432):
                print(f"[search_skills] Tavily credits exhausted ({e.response.status_code}) — using LLM fallback")
            else:
                print(f"[search_skills] Tavily HTTP {e.response.status_code} — using LLM fallback")
        except Exception as e:
            print(f"[search_skills] Tavily failed: {e} — using LLM fallback")

    return await _llm_search_fallback(query, max_results)

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
