"""TikTok Hooks — Generates viral TikTok scripts from templates"""
import asyncio
import os
import json
from datetime import datetime, timezone
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run

HOOK_PROMPT = """Write a viral TikTok hook (15-30 seconds) for this template product.

Product: {product_name}
Price: {price}
Angle: {angle}

Requirements:
- Hook line that stops scrolling (question, stat, or bold claim)
- 1-2 sentence body
- Clear CTA (link in bio / check it out)
- NO hashtags
- Tone: casual, genuine, not salesy

Return ONLY the script text, nothing else."""

async def run():
    start = datetime.now(timezone.utc)
    print("[TikTokHooks] Starting")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    try:
        # Pull pending hook tasks
        tasks = sb.table("task_queue").select("*").eq("to_agent", "tiktok_hooks").eq("status", "pending").limit(10).execute()

        if not tasks.data:
            print("[TikTokHooks] No pending hooks")
            await log_agent_run("tiktok_hooks", "skipped", "No pending tasks", duration_ms=0)
            return

        written = 0
        for task in tasks.data:
            try:
                payload = task.get("payload", {})
                script = await groq_llm(
                    HOOK_PROMPT.format(
                        product_name=payload.get("product_name"),
                        price=payload.get("price"),
                        angle=payload.get("angle"),
                    ),
                    max_tokens=200
                )

                # Store hook
                sb.table("tiktok_hooks").insert({
                    "product_id": payload.get("product_id"),
                    "script": script.strip(),
                    "angle": payload.get("angle"),
                    "status": "draft",
                }).execute()

                # Mark task done
                sb.table("task_queue").update({"status": "done"}).eq("id", task["id"]).execute()

                written += 1
                print(f"[TikTokHooks] Generated hook for {payload.get('product_name')}")
                await asyncio.sleep(1)

            except Exception as e:
                print(f"[TikTokHooks] Failed: {e}")
                sb.table("task_queue").update({"status": "failed"}).eq("id", task["id"]).execute()

        duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        await log_agent_run("tiktok_hooks", "success", f"Generated {written} hooks", duration_ms=duration_ms)
        print(f"[TikTokHooks] ✅ Done — {written} hooks")

    except Exception as e:
        print(f"[TikTokHooks] Failed: {e}")
        await log_agent_run("tiktok_hooks", "failed", str(e), duration_ms=0)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
