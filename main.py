"""
Agent Empire — Railway entry point.
FastAPI server that runs all agents on schedule via background tasks.
Railway detects this and starts it with uvicorn automatically.
"""
import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from fastapi.responses import JSONResponse

ET = ZoneInfo("America/New_York")

# --- scheduler ---

async def run_agent(name: str, module_path: str):
    try:
        print(f"[Scheduler] Starting {name} at {datetime.now(ET).strftime('%I:%M %p ET')}")
        mod = __import__(module_path, fromlist=["run"])
        await mod.run()
    except Exception as e:
        print(f"[Scheduler] {name} failed: {e}")

async def scheduler_loop():
    """Main scheduler — checks every minute what needs to run."""
    await asyncio.sleep(5)  # give server time to start

    last_ran = {}

    while True:
        now = datetime.now(ET)
        hour = now.hour
        minute = now.minute

        async def maybe_run(name, module, interval_minutes):
            key = name
            last = last_ran.get(key)
            if last is None or (now - last).total_seconds() >= interval_minutes * 60:
                last_ran[key] = now
                asyncio.create_task(run_agent(name, module))

        # Chairman brief — 7am ET daily
        if hour == 7 and minute < 5:
            await maybe_run("chairman", "agents.tier1_gods.chairman", 60 * 23)

        # Oracle — every 4 hours
        await maybe_run("oracle", "agents.tier1_gods.oracle", 60 * 4)

        # Prospector — every 6 hours
        await maybe_run("prospector", "agents.tier3_revenue.prospector", 60 * 6)

        # Outreach — every 2 hours on weekdays
        if now.weekday() < 5 and 8 <= hour <= 20:
            await maybe_run("outreach_agent", "agents.tier3_revenue.outreach_agent", 120)

        # Deal closer — every 2 hours on weekdays
        if now.weekday() < 5 and 8 <= hour <= 20:
            await maybe_run("deal_closer", "agents.tier3_revenue.deal_closer", 120)

        await asyncio.sleep(60)  # check every minute


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(scheduler_loop())
    print("[AgentEmpire] Scheduler started")
    yield
    task.cancel()


app = FastAPI(title="Agent Empire Workers", lifespan=lifespan)


@app.get("/")
def root():
    return {"status": "running", "empire": "online", "time": datetime.now(ET).strftime("%I:%M %p ET")}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/run/{agent_name}")
async def trigger_agent(agent_name: str):
    """Manually trigger any agent via POST /run/oracle etc."""
    agent_map = {
        "chairman": "agents.tier1_gods.chairman",
        "oracle": "agents.tier1_gods.oracle",
        "prospector": "agents.tier3_revenue.prospector",
        "outreach_agent": "agents.tier3_revenue.outreach_agent",
        "deal_closer": "agents.tier3_revenue.deal_closer",
    }
    if agent_name not in agent_map:
        return JSONResponse(status_code=404, content={"error": f"Unknown agent: {agent_name}"})

    asyncio.create_task(run_agent(agent_name, agent_map[agent_name]))
    return {"status": "triggered", "agent": agent_name}
