"""Template generation API keys and config — all loaded from .env.local"""
import os
from dotenv import load_dotenv

load_dotenv()

# Template APIs
GUMROAD_API_TOKEN = os.getenv("GUMROAD_API_TOKEN")
NOTION_API_KEY = os.getenv("NOTION_API_KEY")
FIGMA_API_KEY = os.getenv("FIGMA_API_KEY")
TIKTOK_API_TOKEN = os.getenv("TIKTOK_API_TOKEN")

# Existing APIs (for templates)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Validate required keys
def validate_keys():
    required = {
        "GUMROAD_API_TOKEN": GUMROAD_API_TOKEN,
        "NOTION_API_KEY": NOTION_API_KEY,
        "GROQ_API_KEY": GROQ_API_KEY,
        "TAVILY_API_KEY": TAVILY_API_KEY,
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        print(f"⚠️ Missing API keys in .env.local: {', '.join(missing)}")
        print(f"   Add them to /Users/surfs/Desktop/agent-empire/.env.local")
        return False
    return True

# Template generation settings
TEMPLATES_PER_DAY = 10
TIKTOK_HOOKS_PER_TEMPLATE = 3
TEMPLATE_STORAGE_BUCKET = "templates"  # Supabase Storage bucket

# Pricing defaults (can be overridden per template)
NOTION_TEMPLATE_PRICE = 2900  # $29 in cents
FIGMA_TEMPLATE_PRICE = 4900   # $49 in cents
CANVA_TEMPLATE_PRICE = 1900   # $19 in cents
PROMPT_PACK_PRICE = 1500      # $15 in cents

# Gumroad categories
GUMROAD_CATEGORIES = {
    "notion": "education/productivity",
    "figma": "design/ui-and-web/figma",
    "canva": "design/branding/social-media",
    "prompts": "education/ebooks",
}
