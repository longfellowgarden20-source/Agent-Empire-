"""Template Generator — Creates 10 templates/day, uploads to Gumroad, queues TikTok hooks"""
import asyncio
import os
import json
from datetime import datetime, timezone
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run
from shared.config.template_config import (
    GUMROAD_API_TOKEN, NOTION_API_KEY, GROQ_API_KEY,
    TAVILY_API_KEY, SUPABASE_URL, SUPABASE_KEY,
    TEMPLATES_PER_DAY, TIKTOK_HOOKS_PER_TEMPLATE,
    GUMROAD_CATEGORIES, NOTION_TEMPLATE_PRICE
)

SCOUT_PROMPT = """Find 10 trending Notion/Canva/Figma/Prompt templates RIGHT NOW (2026).
For EACH template, return:
- name: product name
- category: notion|figma|canva|prompts
- description: 2-3 sentence marketing copy
- price_cents: suggested price
- features: list of 3-4 key features
- target: who buys this (e.g. "solopreneurs", "designers")
- tiktok_angles: 3 different viral hook angles

Return ONLY valid JSON array. Be specific — actual trending templates, not generic ones."""

async def run():
    start = datetime.now(timezone.utc)
    print("[TemplateGenerator] Starting daily template creation")

    # Validate API keys exist
    if not all([GUMROAD_API_TOKEN, NOTION_API_KEY, GROQ_API_KEY]):
        print("[TemplateGenerator] ⚠️ Missing API keys in .env.local")
        await log_agent_run("template_generator", "failed", "Missing GUMROAD_API_TOKEN or NOTION_API_KEY", duration_ms=0)
        return

    from supabase import create_client
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    try:
        # 1. Scout trending templates
        print("[TemplateGenerator] Scouting trending templates...")
        raw = await groq_llm(SCOUT_PROMPT, max_tokens=3000)
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        templates = json.loads(cleaned)

        if not isinstance(templates, list):
            templates = [templates]

        templates = templates[:TEMPLATES_PER_DAY]
        print(f"[TemplateGenerator] Found {len(templates)} templates to create")

        created = 0
        for i, tpl in enumerate(templates, 1):
            try:
                # 2. Create Gumroad product
                product_id = await create_gumroad_product(
                    name=tpl.get("name"),
                    description=tpl.get("description"),
                    price=tpl.get("price_cents", NOTION_TEMPLATE_PRICE),
                    category=GUMROAD_CATEGORIES.get(tpl.get("category"), "education/productivity"),
                    tags=tpl.get("features", [])
                )

                if product_id:
                    print(f"[TemplateGenerator] ({i}/{len(templates)}) Created: {tpl['name']} → {product_id}")

                    # 3. Log template in Supabase
                    sb.table("templates").insert({
                        "name": tpl.get("name"),
                        "category": tpl.get("category"),
                        "gumroad_product_id": product_id,
                        "price_cents": tpl.get("price_cents", NOTION_TEMPLATE_PRICE),
                        "description": tpl.get("description"),
                        "target_customer": tpl.get("target"),
                        "status": "live",
                    }).execute()

                    # 4. Queue TikTok hooks
                    for angle in tpl.get("tiktok_angles", [])[:TIKTOK_HOOKS_PER_TEMPLATE]:
                        sb.table("task_queue").insert({
                            "from_agent": "template_generator",
                            "to_agent": "tiktok_hooks",
                            "task_type": "generate_hook",
                            "payload": {
                                "product_id": product_id,
                                "product_name": tpl.get("name"),
                                "angle": angle,
                                "price": f"${tpl.get('price_cents', NOTION_TEMPLATE_PRICE) / 100}",
                            },
                            "priority": 8,
                            "status": "pending",
                        }).execute()

                    created += 1
                    await asyncio.sleep(2)  # Rate limit

            except Exception as e:
                print(f"[TemplateGenerator] Failed on template {i}: {e}")

        duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        await log_agent_run("template_generator", "success", f"Created {created} templates, queued {created * TIKTOK_HOOKS_PER_TEMPLATE} hooks", duration_ms=duration_ms)
        print(f"[TemplateGenerator] ✅ Done — {created} templates, {created * TIKTOK_HOOKS_PER_TEMPLATE} TikTok hooks queued")

    except Exception as e:
        print(f"[TemplateGenerator] Failed: {e}")
        await log_agent_run("template_generator", "failed", str(e), duration_ms=0)


async def create_gumroad_product(name: str, description: str, price: int, category: str, tags: list) -> str:
    """Create a Gumroad product and return product_id"""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://api.gumroad.com/v2/products",
                data={
                    "access_token": GUMROAD_API_TOKEN,
                    "native_type": "digital",
                    "name": name,
                    "description": description,
                    "price": price,
                    "price_currency_type": "usd",
                    "category": category,
                    "tags[]": tags[:5],  # Gumroad limit
                }
            )

            if res.status_code == 200:
                data = res.json()
                if data.get("success"):
                    product_id = data.get("product", {}).get("id")

                    # Enable product immediately
                    await enable_gumroad_product(product_id)
                    return product_id
            else:
                print(f"[Gumroad] Error: {res.status_code} - {res.text[:200]}")
                return None
    except Exception as e:
        print(f"[Gumroad] Create failed: {e}")
        return None


async def enable_gumroad_product(product_id: str) -> bool:
    """Publish a Gumroad product"""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.put(
                f"https://api.gumroad.com/v2/products/{product_id}/enable",
                data={"access_token": GUMROAD_API_TOKEN}
            )
            return res.status_code == 200
    except Exception as e:
        print(f"[Gumroad] Enable failed: {e}")
        return False


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
