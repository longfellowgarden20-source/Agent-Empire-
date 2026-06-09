"""
Coder — Tier 2 Builders.
Takes company spec from ideas table → writes code files to a GitHub repo via GitHub API.
Triggered by architect via task_queue.
"""
import asyncio
import os
import json
import base64
from datetime import datetime, timezone

import httpx

from shared.skills.llm_skills import smart_llm
from shared.skills.scoring_skills import log_agent_run

CODE_PROMPT = """You are writing production Python code for an autonomous AI agent.

Company: {company_name}
Agent spec: {agent_spec}
Company description: {description}
Business model: {business_model}

Write a complete, working Python agent file following these rules:
1. Import from shared.skills.llm_skills and shared.skills.scoring_skills
2. Use the correct LLM: {llm_tier}_llm()
3. async def run() as entry point
4. Log via log_agent_run()
5. Supabase client: create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
6. Fail loudly — log errors to supabase DLQ
7. if __name__ == "__main__": from dotenv import load_dotenv; load_dotenv(); asyncio.run(run())

Write ONLY the Python code. No explanations."""


async def generate_agent_file(agent_spec: dict, company_name: str, description: str, business_model: str) -> str:
    llm_tier = agent_spec.get("llm", "agent")
    raw = await smart_llm(
        CODE_PROMPT.format(
            company_name=company_name,
            agent_spec=json.dumps(agent_spec),
            description=description,
            business_model=business_model,
            llm_tier=llm_tier,
        ),
        max_tokens=1500,
    )
    # strip markdown code fences
    code = raw.strip()
    if code.startswith("```python"):
        code = code[9:]
    elif code.startswith("```"):
        code = code[3:]
    if code.endswith("```"):
        code = code[:-3]
    return code.strip()


async def push_file_to_github(owner: str, repo: str, path: str, content: str, token: str, message: str) -> bool:
    headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
    encoded = base64.b64encode(content.encode()).decode()

    async with httpx.AsyncClient(timeout=30) as client:
        # check if file exists (need sha for update)
        get_resp = await client.get(f"https://api.github.com/repos/{owner}/{repo}/contents/{path}", headers=headers)
        sha = get_resp.json().get("sha") if get_resp.status_code == 200 else None

        payload = {"message": message, "content": encoded}
        if sha:
            payload["sha"] = sha

        put_resp = await client.put(
            f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
            headers=headers,
            json=payload,
        )
        return put_resp.status_code in (200, 201)


async def build_company(idea_id: str, company_slug: str, supabase) -> bool:
    idea = supabase.table("ideas").select("*").eq("id", idea_id).single().execute()
    if not idea.data:
        print(f"[Coder] Idea {idea_id} not found")
        return False

    spec = idea.data.get("company_specs") or {}
    company_name = spec.get("company_name", company_slug)
    description = spec.get("description", "")
    business_model = spec.get("business_model", "")
    agents = spec.get("agents", [])

    github_token = os.environ.get("GITHUB_TOKEN", "")
    github_owner = os.environ.get("GITHUB_OWNER", "")
    github_repo = os.environ.get("GITHUB_REPO", "agent-empire")

    files_written = []

    for agent_spec in agents:
        agent_name = agent_spec.get("name", "agent")
        print(f"[Coder] Generating {agent_name} for {company_name}")

        try:
            code = await generate_agent_file(agent_spec, company_name, description, business_model)
            file_path = f"companies/{company_slug}/agents/{agent_name}.py"

            if github_token and github_owner:
                ok = await push_file_to_github(
                    github_owner, github_repo, file_path, code, github_token,
                    f"[Coder] Add {agent_name} for {company_name}",
                )
                if ok:
                    files_written.append(file_path)
            else:
                # write locally if no github config
                local_path = f"/Users/surfs/Desktop/agent-empire/companies/{company_slug}/agents"
                os.makedirs(local_path, exist_ok=True)
                with open(f"{local_path}/{agent_name}.py", "w") as f:
                    f.write(code)
                files_written.append(file_path)

        except Exception as e:
            print(f"[Coder] Failed to generate {agent_name}: {e}")
            supabase.table("task_queue").insert({
                "from_agent": "coder",
                "to_agent": "dlq",
                "task_type": "dlq",
                "payload": {"idea_id": idea_id, "agent": agent_name, "error": str(e)},
                "priority": 1,
                "status": "failed",
            }).execute()

    supabase.table("ideas").update({
        "status": "coded",
        "coded_files": files_written,
        "coded_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", idea_id).execute()

    supabase.table("task_queue").insert({
        "from_agent": "coder",
        "to_agent": "tester",
        "task_type": "test_code",
        "payload": {"idea_id": idea_id, "company_slug": company_slug, "files": files_written},
        "priority": 7,
        "status": "pending",
    }).execute()

    return len(files_written) > 0


async def run():
    start = datetime.now(timezone.utc)
    print(f"[Coder] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    tasks = supabase.table("task_queue").select("*").eq("to_agent", "coder").eq("status", "pending").order("priority", desc=True).limit(5).execute()
    if not tasks.data:
        print("[Coder] No tasks in queue")
        await log_agent_run("coder", "skipped", "No tasks", duration_ms=0)
        return

    task_ids = [t["id"] for t in tasks.data]
    supabase.table("task_queue").update({"status": "in_progress", "picked_up_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    results = []
    for task in tasks.data:
        payload = task.get("payload", {})
        ok = await build_company(payload.get("idea_id", ""), payload.get("company_slug", ""), supabase)
        results.append(ok)

    supabase.table("task_queue").update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}).in_("id", task_ids).execute()

    success_count = sum(1 for r in results if r)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("coder", "success", f"Built {success_count} companies", duration_ms=duration_ms)
    print(f"[Coder] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
