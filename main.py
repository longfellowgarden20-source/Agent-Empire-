"""Agent Empire — Railway entry point. 10 core agents."""
import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from fastapi.responses import JSONResponse

ET = ZoneInfo("America/New_York")

CORE_AGENTS = {
    "scout":      "agents.core.scout",
    "prospector": "agents.core.prospector",
    "closer":     "agents.core.closer",
    "content":    "agents.core.content",
    "intel":      "agents.core.intel",
    "ops":        "agents.core.ops",
    "chairman":   "agents.core.chairman",
    "builder":    "agents.core.builder",
    "money":      "agents.core.money",
    "learner":    "agents.core.learner",
}


async def is_paused() -> bool:
    try:
        from supabase import create_client
        sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        res = sb.table("agent_memory").select("value").eq("agent", "system").eq("key", "paused").single().execute()
        return res.data and res.data.get("value") is True
    except Exception:
        return False


async def run_agent(name: str, module_path: str):
    try:
        print(f"[Scheduler] Starting {name} at {datetime.now(ET).strftime('%I:%M %p ET')}")
        mod = __import__(module_path, fromlist=["run"])
        await mod.run()
    except Exception as e:
        print(f"[Scheduler] {name} failed: {e}")


async def scheduler_loop():
    await asyncio.sleep(5)
    last_ran = {}

    while True:
        if await is_paused():
            print("[Scheduler] Paused — sleeping 60s")
            await asyncio.sleep(60)
            continue

        now = datetime.now(ET)
        hour = now.hour
        minute = now.minute

        async def maybe_run(name, interval_minutes):
            last = last_ran.get(name)
            if last is None or (now - last).total_seconds() >= interval_minutes * 60:
                last_ran[name] = now
                asyncio.create_task(run_agent(name, CORE_AGENTS[name]))

        # Scout: ideas + trends — every 6 hours
        await maybe_run("scout", 360)

        # Intel: market news — every 4 hours
        await maybe_run("intel", 240)

        # Prospector: find leads — once daily
        await maybe_run("prospector", 60 * 23)

        # Closer: write emails from task queue — every 2 hours
        await maybe_run("closer", 120)

        # Content: tweets + posts — every 12 hours
        await maybe_run("content", 720)

        # Builder: spec validated ideas — every 4 hours
        await maybe_run("builder", 240)

        # Money: revenue health check — every 6 hours
        await maybe_run("money", 360)

        # Ops: agent health monitor — every 30 min
        await maybe_run("ops", 30)

        # Learner: reflect + improve — once daily
        await maybe_run("learner", 60 * 23)

        # Chairman brief — 7am ET daily
        if hour == 7 and minute < 5:
            await maybe_run("chairman", 60 * 23)

        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(scheduler_loop())
    print("[AgentEmpire] 10 core agents online")
    yield
    task.cancel()


app = FastAPI(title="Agent Empire", lifespan=lifespan)


@app.get("/")
def root():
    return {
        "status": "running",
        "agents": list(CORE_AGENTS.keys()),
        "time": datetime.now(ET).strftime("%I:%M %p ET"),
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/run/{agent_name}")
async def trigger_agent(agent_name: str):
    if agent_name not in CORE_AGENTS:
        return JSONResponse(
            status_code=404,
            content={"error": f"Unknown agent: {agent_name}", "available": list(CORE_AGENTS.keys())},
        )
    asyncio.create_task(run_agent(agent_name, CORE_AGENTS[agent_name]))
    return {"status": "triggered", "agent": agent_name}


@app.get("/agents")
def list_agents():
    return {"total": len(CORE_AGENTS), "agents": list(CORE_AGENTS.keys())}
