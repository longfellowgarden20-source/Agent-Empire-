"""
Memory Skills — all agents read/write through here.
Supabase is the shared brain of the empire.
"""
import os
from supabase import create_client, Client
from typing import Any

def _db() -> Client:
    return create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )

def save_to_memory(agent_name: str, key: str, value: Any) -> None:
    """Save any value to agent memory. Upserts on agent+key."""
    _db().table("agent_memory").upsert({
        "agent": agent_name,
        "key": key,
        "value": value,
    }, on_conflict="agent,key").execute()

def get_from_memory(agent_name: str, key: str, default: Any = None) -> Any:
    """Read a value from agent memory."""
    res = _db().table("agent_memory").select("value").eq("agent", agent_name).eq("key", key).limit(1).execute()
    if res.data:
        return res.data[0]["value"]
    return default

def add_to_task_queue(from_agent: str, to_agent: str, task_type: str, payload: dict, priority: int = 5) -> str:
    """Add a task for another agent to pick up. Returns task ID."""
    res = _db().table("task_queue").insert({
        "from_agent": from_agent,
        "to_agent": to_agent,
        "task_type": task_type,
        "payload": payload,
        "priority": priority,
        "status": "pending",
    }).execute()
    return res.data[0]["id"]

def get_next_task(agent_name: str) -> dict | None:
    """Get the highest-priority pending task for this agent."""
    res = _db().table("task_queue").select("*").eq("to_agent", agent_name).eq("status", "pending").order("priority", desc=True).limit(1).execute()
    if not res.data:
        return None
    task = res.data[0]
    _db().table("task_queue").update({"status": "in_progress", "picked_up_at": "now()"}).eq("id", task["id"]).execute()
    return task

def complete_task(task_id: str, result: dict | None = None) -> None:
    """Mark a task as completed."""
    _db().table("task_queue").update({
        "status": "completed",
        "completed_at": "now()",
        "result_ref": result,
    }).eq("id", task_id).execute()

def notify_chairman(message: str, priority: int = 5, requires_action: bool = False) -> None:
    """Send something to the Chairman's morning brief queue."""
    _db().table("chairman_queue").insert({
        "message": message,
        "priority": priority,
        "requires_action": requires_action,
    }).execute()

def log_agent_run(agent_name: str, status: str, summary: str, cost_usd: float = 0.0) -> None:
    """Log every agent run for War Room monitoring."""
    _db().table("agent_runs").insert({
        "agent": agent_name,
        "status": status,
        "summary": summary,
        "cost_usd": cost_usd,
    }).execute()
