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
        weekday = now.weekday()  # 0=Monday, 6=Sunday
        is_weekday = weekday < 5
        is_sunday = weekday == 6
        is_monday = weekday == 0
        is_friday = weekday == 4

        async def maybe_run(name, module, interval_minutes, condition=True):
            if not condition:
                return
            key = name
            last = last_ran.get(key)
            if last is None or (now - last).total_seconds() >= interval_minutes * 60:
                last_ran[key] = now
                asyncio.create_task(run_agent(name, module))

        # ── Tier 1 Gods ──────────────────────────────────────────────────
        # Chairman brief — 7am ET daily
        if hour == 7 and minute < 5:
            await maybe_run("chairman", "agents.tier1_gods.chairman", 60 * 23)

        # Oracle — every 4 hours
        await maybe_run("oracle", "agents.tier1_gods.oracle", 60 * 4)

        # War Room Judge — Sunday 8am
        if is_sunday and hour == 8 and minute < 5:
            await maybe_run("war_room_judge", "agents.tier1_gods.war_room_judge", 60 * 167)

        # Architect — checks for validated ideas every 2 hours
        await maybe_run("architect", "agents.tier1_gods.architect", 120)

        # Capital Allocator — 6am daily
        if hour == 6 and minute < 5:
            await maybe_run("capital_allocator", "agents.tier1_gods.capital_allocator", 60 * 23)

        # ── Tier 2 Builders ──────────────────────────────────────────────
        # Market Validator — every 4 hours
        await maybe_run("market_validator", "agents.tier2_builders.market_validator", 60 * 4)

        # Coder — every 2 hours (triggered by architect)
        await maybe_run("coder", "agents.tier2_builders.coder", 120)

        # Tester — every hour (triggered by coder)
        await maybe_run("tester", "agents.tier2_builders.tester", 60)

        # Deployer — every hour (triggered by tester)
        await maybe_run("deployer", "agents.tier2_builders.deployer", 60)

        # Idea Hunter — every 6 hours
        await maybe_run("idea_hunter", "agents.tier2_builders.idea_hunter", 60 * 6)

        # Skill Builder — Sunday 9am
        if is_sunday and hour == 9 and minute < 5:
            await maybe_run("skill_builder", "agents.tier2_builders.skill_builder", 60 * 167)

        # ── Tier 3 Revenue ───────────────────────────────────────────────
        # Prospector — every 6 hours
        await maybe_run("prospector", "agents.tier3_revenue.prospector", 60 * 6)

        # Researcher — every 2 hours on weekdays
        if is_weekday and 8 <= hour <= 20:
            await maybe_run("researcher", "agents.tier3_revenue.researcher", 120)

        # Copywriter — every 2 hours on weekdays
        if is_weekday and 8 <= hour <= 20:
            await maybe_run("copywriter", "agents.tier3_revenue.copywriter", 120)

        # Outreach — every 2 hours on weekdays
        if is_weekday and 8 <= hour <= 20:
            await maybe_run("outreach_agent", "agents.tier3_revenue.outreach_agent", 120)

        # Deal Closer — every 2 hours on weekdays
        if is_weekday and 8 <= hour <= 20:
            await maybe_run("deal_closer", "agents.tier3_revenue.deal_closer", 120)

        # Upsell Agent — Monday 9am
        if is_monday and hour == 9 and minute < 5:
            await maybe_run("upsell_agent", "agents.tier3_revenue.upsell_agent", 60 * 167)

        # Retention Agent — Friday 9am
        if is_friday and hour == 9 and minute < 5:
            await maybe_run("retention_agent", "agents.tier3_revenue.retention_agent", 60 * 167)

        # ── Tier 4 Market ────────────────────────────────────────────────
        # Crypto Watcher — every 30 min
        await maybe_run("crypto_watcher", "agents.tier4_market.crypto_watcher", 30)

        # Real Estate Scout — daily 10am
        if hour == 10 and minute < 5:
            await maybe_run("real_estate_scout", "agents.tier4_market.real_estate_scout", 60 * 23)

        # Trend Surfer — every hour
        await maybe_run("trend_surfer", "agents.tier4_market.trend_surfer", 60)

        # Competitor Tracker — daily 11am
        if hour == 11 and minute < 5:
            await maybe_run("competitor_tracker", "agents.tier4_market.competitor_tracker", 60 * 23)

        # Macro Watcher — every 2 hours on weekdays
        if is_weekday:
            await maybe_run("macro_watcher", "agents.tier4_market.macro_watcher", 120)

        # ── Tier 5 Content ───────────────────────────────────────────────
        # Content Strategist — Monday 7am
        if is_monday and hour == 7 and minute < 5:
            await maybe_run("content_strategist", "agents.tier5_content.content_strategist", 60 * 167)

        # Writer — every 3 hours (processes task_queue)
        await maybe_run("writer", "agents.tier5_content.writer", 180)

        # Social Agent — every 3 hours (processes task_queue)
        await maybe_run("social_agent", "agents.tier5_content.social_agent", 180)

        # Video Scripter — Mon/Wed/Fri 8am
        if hour == 8 and minute < 5 and weekday in (0, 2, 4):
            await maybe_run("video_scripter", "agents.tier5_content.video_scripter", 60 * 47)

        # SEO Agent — Sunday 10am
        if is_sunday and hour == 10 and minute < 5:
            await maybe_run("seo_agent", "agents.tier5_content.seo_agent", 60 * 167)

        # Email Marketer — every 4 hours (processes task_queue)
        await maybe_run("email_marketer", "agents.tier5_content.email_marketer", 240)

        # ── Tier 6 Ecommerce ─────────────────────────────────────────────
        # Product Scout — daily 8am
        if hour == 8 and minute < 5:
            await maybe_run("product_scout", "agents.tier6_ecommerce.product_scout", 60 * 23)

        # Listing Agent — every 2 hours (processes task_queue)
        await maybe_run("listing_agent", "agents.tier6_ecommerce.listing_agent", 120)

        # Pricing Agent — every 2 hours
        await maybe_run("pricing_agent", "agents.tier6_ecommerce.pricing_agent", 120)

        # Ad Agent — daily 9am
        if hour == 9 and minute < 5:
            await maybe_run("ad_agent", "agents.tier6_ecommerce.ad_agent", 60 * 23)

        # Inventory Agent — daily 7am
        if hour == 7 and minute < 5:
            await maybe_run("inventory_agent", "agents.tier6_ecommerce.inventory_agent", 60 * 23)

        # Support Agent — every 30 min
        await maybe_run("support_agent", "agents.tier6_ecommerce.support_agent", 30)

        # ── Tier 7 Intelligence ──────────────────────────────────────────
        # Web Crawler — every 2 hours
        await maybe_run("web_crawler", "agents.tier7_intelligence.web_crawler", 120)

        # News Aggregator — every hour
        await maybe_run("news_aggregator", "agents.tier7_intelligence.news_aggregator", 60)

        # Data Scientist — Sunday 11am
        if is_sunday and hour == 11 and minute < 5:
            await maybe_run("data_scientist", "agents.tier7_intelligence.data_scientist", 60 * 167)

        # Memory Keeper — every 6 hours
        await maybe_run("memory_keeper", "agents.tier7_intelligence.memory_keeper", 360)

        # ── Tier 8 Watchdogs ─────────────────────────────────────────────
        # Systems Monitor — every 15 min
        await maybe_run("systems_monitor", "agents.tier8_watchdogs.systems_monitor", 15)

        # Quality Inspector — daily 6pm
        if hour == 18 and minute < 5:
            await maybe_run("quality_inspector", "agents.tier8_watchdogs.quality_inspector", 60 * 23)

        # Finance Tracker — daily 8am
        if hour == 8 and minute < 5:
            await maybe_run("finance_tracker", "agents.tier8_watchdogs.finance_tracker", 60 * 23)

        # Compliance Agent — Sunday 12pm
        if is_sunday and hour == 12 and minute < 5:
            await maybe_run("compliance_agent", "agents.tier8_watchdogs.compliance_agent", 60 * 167)

        # Security Agent — every 15 min
        await maybe_run("security_agent", "agents.tier8_watchdogs.security_agent", 15)

        # ── Tier 9 Meta ──────────────────────────────────────────────────
        # Prompt Engineer — Sunday 1pm
        if is_sunday and hour == 13 and minute < 5:
            await maybe_run("prompt_engineer", "agents.tier9_meta.prompt_engineer", 60 * 167)

        # Evolution Agent — 1st of month at 9am (approximate: run on Sunday every ~4 weeks)
        if is_sunday and hour == 9 and minute < 5:
            await maybe_run("evolution_agent", "agents.tier9_meta.evolution_agent", 60 * 24 * 28)

        await asyncio.sleep(60)  # check every minute


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(scheduler_loop())
    print("[AgentEmpire] Scheduler started — 47 agents online")
    yield
    task.cancel()


app = FastAPI(title="Agent Empire Workers", lifespan=lifespan)


@app.get("/")
def root():
    return {
        "status": "running",
        "empire": "online",
        "agents": 47,
        "time": datetime.now(ET).strftime("%I:%M %p ET"),
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/run/{agent_name}")
async def trigger_agent(agent_name: str):
    """Manually trigger any agent via POST /run/<agent_name>"""
    agent_map = {
        # Tier 1
        "chairman": "agents.tier1_gods.chairman",
        "oracle": "agents.tier1_gods.oracle",
        "war_room_judge": "agents.tier1_gods.war_room_judge",
        "architect": "agents.tier1_gods.architect",
        "capital_allocator": "agents.tier1_gods.capital_allocator",
        # Tier 2
        "idea_hunter": "agents.tier2_builders.idea_hunter",
        "market_validator": "agents.tier2_builders.market_validator",
        "coder": "agents.tier2_builders.coder",
        "tester": "agents.tier2_builders.tester",
        "deployer": "agents.tier2_builders.deployer",
        "skill_builder": "agents.tier2_builders.skill_builder",
        # Tier 3
        "prospector": "agents.tier3_revenue.prospector",
        "researcher": "agents.tier3_revenue.researcher",
        "copywriter": "agents.tier3_revenue.copywriter",
        "outreach_agent": "agents.tier3_revenue.outreach_agent",
        "deal_closer": "agents.tier3_revenue.deal_closer",
        "upsell_agent": "agents.tier3_revenue.upsell_agent",
        "retention_agent": "agents.tier3_revenue.retention_agent",
        # Tier 4
        "crypto_watcher": "agents.tier4_market.crypto_watcher",
        "real_estate_scout": "agents.tier4_market.real_estate_scout",
        "trend_surfer": "agents.tier4_market.trend_surfer",
        "competitor_tracker": "agents.tier4_market.competitor_tracker",
        "macro_watcher": "agents.tier4_market.macro_watcher",
        # Tier 5
        "content_strategist": "agents.tier5_content.content_strategist",
        "writer": "agents.tier5_content.writer",
        "social_agent": "agents.tier5_content.social_agent",
        "video_scripter": "agents.tier5_content.video_scripter",
        "seo_agent": "agents.tier5_content.seo_agent",
        "email_marketer": "agents.tier5_content.email_marketer",
        # Tier 6
        "product_scout": "agents.tier6_ecommerce.product_scout",
        "listing_agent": "agents.tier6_ecommerce.listing_agent",
        "pricing_agent": "agents.tier6_ecommerce.pricing_agent",
        "ad_agent": "agents.tier6_ecommerce.ad_agent",
        "inventory_agent": "agents.tier6_ecommerce.inventory_agent",
        "support_agent": "agents.tier6_ecommerce.support_agent",
        # Tier 7
        "web_crawler": "agents.tier7_intelligence.web_crawler",
        "news_aggregator": "agents.tier7_intelligence.news_aggregator",
        "data_scientist": "agents.tier7_intelligence.data_scientist",
        "memory_keeper": "agents.tier7_intelligence.memory_keeper",
        # Tier 8
        "systems_monitor": "agents.tier8_watchdogs.systems_monitor",
        "quality_inspector": "agents.tier8_watchdogs.quality_inspector",
        "finance_tracker": "agents.tier8_watchdogs.finance_tracker",
        "compliance_agent": "agents.tier8_watchdogs.compliance_agent",
        "security_agent": "agents.tier8_watchdogs.security_agent",
        # Tier 9
        "prompt_engineer": "agents.tier9_meta.prompt_engineer",
        "evolution_agent": "agents.tier9_meta.evolution_agent",
    }

    if agent_name not in agent_map:
        return JSONResponse(
            status_code=404,
            content={"error": f"Unknown agent: {agent_name}", "available": list(agent_map.keys())},
        )

    asyncio.create_task(run_agent(agent_name, agent_map[agent_name]))
    return {"status": "triggered", "agent": agent_name}


@app.get("/agents")
def list_agents():
    """List all 47 agents and their tiers."""
    return {
        "total": 47,
        "tiers": {
            "tier1_gods": ["chairman", "oracle", "war_room_judge", "architect", "capital_allocator"],
            "tier2_builders": ["idea_hunter", "market_validator", "coder", "tester", "deployer", "skill_builder"],
            "tier3_revenue": ["prospector", "researcher", "copywriter", "outreach_agent", "deal_closer", "upsell_agent", "retention_agent"],
            "tier4_market": ["crypto_watcher", "real_estate_scout", "trend_surfer", "competitor_tracker", "macro_watcher"],
            "tier5_content": ["content_strategist", "writer", "social_agent", "video_scripter", "seo_agent", "email_marketer"],
            "tier6_ecommerce": ["product_scout", "listing_agent", "pricing_agent", "ad_agent", "inventory_agent", "support_agent"],
            "tier7_intelligence": ["web_crawler", "news_aggregator", "data_scientist", "memory_keeper"],
            "tier8_watchdogs": ["systems_monitor", "quality_inspector", "finance_tracker", "compliance_agent", "security_agent"],
            "tier9_meta": ["prompt_engineer", "evolution_agent"],
        },
    }
