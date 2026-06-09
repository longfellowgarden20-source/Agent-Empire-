"""
LLM Skills — route every call to the right model.
Rule: never hardcode a model inside an agent. Always call these functions.
"""
import os
import httpx
from groq import Groq

def _groq_keys() -> list[str]:
    return [k for k in [
        os.environ.get("GROQ_API_KEY"),
        os.environ.get("GROQ_API_KEY_2"),
        os.environ.get("GROQ_API_KEY_3"),
    ] if k]

async def fast_llm(prompt: str, system: str = "", max_tokens: int = 500) -> str:
    """Groq llama-3.3-70b — speed priority. Use for quick decisions, classification, summaries."""
    import random
    keys = _groq_keys()
    if not keys:
        raise ValueError("No Groq keys configured")
    for key in random.sample(keys, len(keys)):
        try:
            client = Groq(api_key=key)
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})
            res = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages,
                max_tokens=max_tokens,
                temperature=0.3,
            )
            return res.choices[0].message.content or ""
        except Exception as e:
            if "429" in str(e):
                continue
            raise
    raise RuntimeError("All Groq keys rate limited")

async def smart_llm(prompt: str, system: str = "", max_tokens: int = 2000) -> str:
    """Claude Opus — quality priority. Use for judgment calls, architecture, complex reasoning."""
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    messages = [{"role": "user", "content": prompt}]
    res = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=max_tokens,
        system=system or "You are an expert AI agent in a multi-company autonomous business empire.",
        messages=messages,
    )
    return res.content[0].text

async def agent_llm(prompt: str, system: str = "", max_tokens: int = 2000) -> str:
    """Gemini 1.5 Pro — agent tasks, multi-step reasoning. Free tier: 1500 req/day, 1M context."""
    import random
    keys = [k for k in [
        os.environ.get("GEMINI_API_KEY"),
        os.environ.get("GEMINI_API_KEY_2"),
    ] if k]
    if not keys:
        raise ValueError("No Gemini keys configured")
    key = random.choice(keys)
    full_prompt = f"{system}\n\n{prompt}" if system else prompt
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={key}",
            json={"contents": [{"parts": [{"text": full_prompt}]}], "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.3}},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]

async def cheap_llm(prompt: str, max_tokens: int = 300) -> str:
    """Groq llama-3.1-8b — cost priority. Use for simple classification, formatting, routing."""
    import random
    keys = _groq_keys()
    key = random.choice(keys)
    client = Groq(api_key=key)
    res = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=0.1,
    )
    return res.choices[0].message.content or ""
