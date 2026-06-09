"""
Tester — Tier 2 Builders.
Pulls latest test_results tasks from task_queue. Reviews code for bugs.
Writes pass/fail to task_queue result. Triggered by coder.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.llm_skills import agent_llm
from shared.skills.scoring_skills import log_agent_run

REVIEW_PROMPT = """You are a senior Python code reviewer for an autonomous AI system.
Review these agent files and identify any bugs that would cause runtime failures.

Files:
{files_content}

Check for:
1. Import errors (missing modules, wrong paths)
2. Async/await correctness
3. Supabase query errors (wrong columns, missing .execute())
4. Exception handling (never silent — must log and re-raise or DLQ)
5. LLM call correctness (correct function signatures)
6. JSON parse safety (always try/except)

Return JSON:
{{
  "passed": <true/false>,
  "bugs": [
    {{"file": "<filename>", "line_hint": "<rough location>", "severity": "<critical|warning>", "description": "<what's wrong>", "fix": "<how to fix>"}}
  ],
  "overall_quality": <1-10>,
  "summary": "<one sentence>"
}}"""


async def test_company_code(idea_id: str, company_slug: str, files: list[str], supabase) -> dict:
    # try to read file contents
    files_content = ""
    for file_path in files[:5]:  # limit to 5 files
        full_path = f"/Users/surfs/Desktop/agent-empire/{file_path}"
        try:
            with open(full_path, "r") as f:
                content = f.read()
            files_content += f"\n=== {file_path} ===\n{content[:1500]}\n"
        except FileNotFoundError:
            files_content += f"\n=== {file_path} ===\n[File not found — may be in GitHub]\n"

    if not files_content.strip():
        files_content = f"[Files for {company_slug} — {len(files)} files — not locally available]"

    raw = await agent_llm(
        REVIEW_PROMPT.format(files_content=files_content[:4000]),
        max_tokens=800,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        result = json.loads(cleaned)
    except Exception:
        result = {"passed": False, "bugs": [], "summary": "Parse error in review", "overall_quality": 5}

    # write test results back
    supabase.table("ideas").update({
        "test_results": result,
        "tested_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", idea_id).execute()

    return result


async def run():
    start = datetime.now(timezone.utc)
    print(f"[Tester] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    tasks = supabase.table("task_queue").select("*").eq("to_agent", "tester").eq("status", "pending").order("priority", desc=True).limit(10).execute()
    if not tasks.data:
        print("[Tester] No tasks in queue")
        await log_agent_run("tester", "skipped", "No tasks", duration_ms=0)
        return

    task_ids = [t["id"] for t in tasks.data]
    supabase.table("task_queue").update({"status": "in_progress", "picked_up_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    passed_count = 0
    for task in tasks.data:
        payload = task.get("payload", {})
        idea_id = payload.get("idea_id", "")
        company_slug = payload.get("company_slug", "")
        files = payload.get("files", [])

        try:
            result = await test_company_code(idea_id, company_slug, files, supabase)
            passed = result.get("passed", False)
            quality = result.get("overall_quality", 5)

            if passed or quality >= 7:
                passed_count += 1
                supabase.table("task_queue").insert({
                    "from_agent": "tester",
                    "to_agent": "deployer",
                    "task_type": "deploy_company",
                    "payload": {"idea_id": idea_id, "company_slug": company_slug, "test_results": result},
                    "priority": 7,
                    "status": "pending",
                }).execute()
            else:
                bugs = result.get("bugs", [])
                critical_bugs = [b for b in bugs if b.get("severity") == "critical"]
                supabase.table("task_queue").insert({
                    "from_agent": "tester",
                    "to_agent": "coder",
                    "task_type": "fix_bugs",
                    "payload": {"idea_id": idea_id, "company_slug": company_slug, "bugs": critical_bugs},
                    "priority": 8,
                    "status": "pending",
                }).execute()

            supabase.table("task_queue").update({
                "status": "completed",
                "result": result,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", task["id"]).execute()

        except Exception as e:
            print(f"[Tester] Error testing {company_slug}: {e}")
            supabase.table("task_queue").insert({
                "from_agent": "tester",
                "to_agent": "dlq",
                "task_type": "dlq",
                "payload": {"idea_id": idea_id, "error": str(e)},
                "priority": 1,
                "status": "failed",
            }).execute()

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("tester", "success", f"Tested {len(tasks.data)} companies, {passed_count} passed", duration_ms=duration_ms)
    print(f"[Tester] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
