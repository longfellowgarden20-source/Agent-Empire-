"""
Prompt Engineer — Tier 9 Meta.
Reads evolution_proposals where status='pending'. Analyzes patterns.
Writes improved prompt suggestions back to evolution_proposals. Weekly.
"""
import asyncio
import os
import json
from datetime import datetime, timezone

from shared.skills.llm_skills import smart_llm
from shared.skills.scoring_skills import log_agent_run

PROMPT_IMPROVEMENT_PROMPT = """You are a master prompt engineer improving AI agent prompts for an autonomous business empire.

Agent with issues: {agent_name}
Problem description: {problem}
Failure patterns: {failure_patterns}
Current behavior: {current_behavior}
Expected behavior: {expected_behavior}

Write an improved prompt that:
1. Eliminates the failure patterns
2. Adds explicit output format requirements
3. Adds edge case handling
4. Reduces ambiguity

Return JSON:
{{
  "improved_prompt": "<the full improved prompt>",
  "key_changes": ["<change1>", "<change2>", "<change3>"],
  "expected_improvement": "<what metric will improve and by how much>",
  "confidence": <1-10>,
  "version": "<v2|v3 etc>"
}}"""


async def improve_prompt(proposal: dict, supabase) -> bool:
    agent_name = proposal.get("agent_name", "unknown")
    data = proposal.get("data") or {}

    print(f"[PromptEngineer] Improving prompts for: {agent_name}")

    raw = await smart_llm(
        PROMPT_IMPROVEMENT_PROMPT.format(
            agent_name=agent_name,
            problem=data.get("root_cause") or data.get("description") or proposal.get("proposal_type", ""),
            failure_patterns=json.dumps(data.get("failure_patterns") or data.get("issues") or [])[:400],
            current_behavior=data.get("current_behavior") or data.get("summary") or "See proposal data",
            expected_behavior=data.get("proposed_fix") or data.get("action_required") or "Improve reliability",
        ),
        max_tokens=1000,
    )

    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        improvement = json.loads(cleaned)
    except Exception as e:
        print(f"[PromptEngineer] Parse error for {agent_name}: {e}")
        return False

    # write improved prompt back as new proposal
    supabase.table("evolution_proposals").insert({
        "proposed_by": "prompt_engineer",
        "agent_name": agent_name,
        "proposal_type": "prompt_improvement",
        "priority": improvement.get("confidence", 5),
        "data": {
            **improvement,
            "source_proposal_id": proposal.get("id"),
            "proposed_at": datetime.now(timezone.utc).isoformat(),
        },
        "status": "ready_to_apply",
    }).execute()

    # mark source proposal as processed
    supabase.table("evolution_proposals").update({
        "status": "processed",
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", proposal["id"]).execute()

    return True


async def run():
    start = datetime.now(timezone.utc)
    print(f"[PromptEngineer] Starting run at {start.isoformat()}")

    from supabase import create_client
    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    proposals = (
        supabase.table("evolution_proposals")
        .select("*")
        .eq("status", "pending")
        .in_("proposal_type", ["skill_improvement", "fix_required"])
        .order("priority", desc=True)
        .limit(10)
        .execute()
    )

    if not proposals.data:
        print("[PromptEngineer] No pending proposals")
        await log_agent_run("prompt_engineer", "skipped", "No pending proposals", duration_ms=0)
        return

    print(f"[PromptEngineer] Processing {len(proposals.data)} proposals")

    results = []
    for proposal in proposals.data:
        ok = await improve_prompt(proposal, supabase)
        results.append(ok)

    success_count = sum(1 for r in results if r)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    await log_agent_run("prompt_engineer", "success", f"Wrote {success_count} prompt improvements", duration_ms=duration_ms)
    print(f"[PromptEngineer] Done in {duration_ms}ms")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run())
