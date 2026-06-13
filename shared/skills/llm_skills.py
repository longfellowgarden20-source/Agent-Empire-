"""
LLM Skills — route every call to the right model.
Rule: never hardcode a model inside an agent. Always call these functions.
"""
import asyncio
import os
import httpx
from groq import Groq

def _groq_keys() -> list[str]:
    return [k for k in [
        os.environ.get("GROQ_API_KEY"),
        os.environ.get("GROQ_API_KEY_2"),
        os.environ.get("GROQ_API_KEY_3"),
    ] if k]

async def groq_llm(prompt: str, system: str = "", max_tokens: int = 1000) -> str:
    """Primary LLM for all core agents. Uses httpx directly to avoid SDK quirks."""
    import random
    keys = _groq_keys()
    if not keys:
        raise RuntimeError("No GROQ_API_KEY configured")
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    for attempt in range(4):
        key = random.choice(keys)
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                res = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {key}"},
                    json={
                        "model": "llama-3.3-70b-versatile" if attempt < 2 else "llama-3.1-8b-instant",
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "temperature": 0.3,
                    },
                )
                if res.status_code == 429:
                    wait = 10 * (attempt + 1)
                    print(f"[llm_skills] Groq 429 — waiting {wait}s (attempt {attempt+1}/4)")
                    await asyncio.sleep(wait)
                    continue
                res.raise_for_status()
                return res.json()["choices"][0]["message"]["content"] or ""
        except httpx.HTTPStatusError:
            raise
        except Exception as e:
            if attempt == 3:
                raise
            await asyncio.sleep(5)
    raise RuntimeError("Groq rate limit exceeded after 4 attempts")

async def fast_llm(prompt: str, system: str = "", max_tokens: int = 500) -> str:
    """Groq llama-3.3-70b — speed priority. Retries with backoff on rate limit."""
    import random
    keys = _groq_keys()
    if not keys:
        return await agent_llm(prompt, system=system, max_tokens=max_tokens)
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    for attempt in range(4):
        key = random.choice(keys)
        try:
            client = Groq(api_key=key)
            res = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages,
                max_tokens=max_tokens,
                temperature=0.3,
            )
            return res.choices[0].message.content or ""
        except Exception as e:
            if "429" in str(e):
                wait = 8 * (attempt + 1)
                print(f"[llm_skills] Groq 429 rate limit — waiting {wait}s (attempt {attempt+1}/4)")
                await asyncio.sleep(wait)
                continue
            raise
    raise RuntimeError("Groq rate limit exceeded after 4 attempts")

async def smart_llm(prompt: str, system: str = "", max_tokens: int = 2000) -> str:
    """Claude Opus — judgment calls. Falls back to Gemini if no Anthropic key."""
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if anthropic_key:
        import anthropic
        client = anthropic.Anthropic(api_key=anthropic_key)
        res = client.messages.create(
            model="claude-opus-4-8",
            max_tokens=max_tokens,
            system=system or "You are an expert AI agent in a multi-company autonomous business empire.",
            messages=[{"role": "user", "content": prompt}],
        )
        return res.content[0].text
    # fallback to Gemini
    return await agent_llm(prompt, system=system, max_tokens=max_tokens)

async def agent_llm(prompt: str, system: str = "", max_tokens: int = 2000) -> str:
    """Gemini 2.0 Flash — agent tasks. Falls back to Groq if Gemini unavailable."""
    import random
    keys = [k for k in [
        os.environ.get("GEMINI_API_KEY"),
        os.environ.get("GEMINI_API_KEY_2"),
        os.environ.get("GEMINI_API_KEY_3"),
    ] if k]
    if keys:
        full_prompt = f"{system}\n\n{prompt}" if system else prompt
        for attempt in range(3):
            key = random.choice(keys)
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}",
                        json={"contents": [{"parts": [{"text": full_prompt}]}], "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.3}},
                    )
                    if resp.status_code == 429:
                        await asyncio.sleep(15 * (attempt + 1))
                        continue
                    resp.raise_for_status()
                    data = resp.json()
                    return data["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as e:
                if attempt == 2:
                    break
                await asyncio.sleep(10)

    # Groq fallback — used when Gemini exhausted/unconfigured
    groq_keys = _groq_keys()
    if groq_keys:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        for attempt in range(3):
            import random as _r
            key = _r.choice(groq_keys)
            try:
                client = Groq(api_key=key)
                res = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=messages,
                    max_tokens=min(max_tokens, 8000),
                    temperature=0.3,
                )
                return res.choices[0].message.content or ""
            except Exception as e:
                if "429" in str(e):
                    await asyncio.sleep(10 * (attempt + 1))
                    continue
                raise
    raise RuntimeError("All LLM providers failed (Gemini + Groq)")

async def cheap_llm(prompt: str, max_tokens: int = 300) -> str:
    """Groq llama-3.1-8b — cost priority. Falls back to Gemini if no Groq key."""
    import random
    keys = _groq_keys()
    if keys:
        key = random.choice(keys)
        client = Groq(api_key=key)
        res = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=0.1,
        )
        return res.choices[0].message.content or ""
    return await agent_llm(prompt, max_tokens=max_tokens)
