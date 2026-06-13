"""Chairman — compiles morning brief from queue and sends summary."""
import asyncio, os, json
from datetime import datetime, timezone
from shared.skills.llm_skills import groq_llm
from shared.skills.scoring_skills import log_agent_run


async def run():
    start = datetime.now(timezone.utc)
    print("[Chairman] Compiling brief")

    from supabase import create_client
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # pull unsent queue items
    queue = sb.table("chairman_queue").select("*").eq("sent_in_brief", False).order("priority", desc=True).limit(20).execute()

    if not queue.data:
        print("[Chairman] Nothing new")
        await log_agent_run("chairman", "skipped", "Queue empty", duration_ms=0)
        return

    items = queue.data
    actions = [i for i in items if i.get("requires_action")]
    updates = [i for i in items if not i.get("requires_action")]

    lines = ["EMPIRE BRIEF — " + datetime.now(timezone.utc).strftime("%a %b %d")]
    lines.append("")

    if actions:
        lines.append(f"⚠️ NEEDS ATTENTION ({len(actions)} items)")
        for item in actions[:3]:
            lines.append(f"  • {item['message']}")
        lines.append("")

    if updates:
        lines.append(f"✅ UPDATES ({len(updates)} items)")
        for item in updates[:5]:
            lines.append(f"  • {item['message']}")

    brief = "\n".join(lines)
    print(brief)

    # mark all as sent
    ids = [i["id"] for i in items]
    sb.table("chairman_queue").update({"sent_in_brief": True}).in_("id", ids).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("chairman", "success", f"Brief sent: {len(actions)} actions, {len(updates)} updates", duration_ms=duration_ms)
    print(f"[Chairman] Done")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
