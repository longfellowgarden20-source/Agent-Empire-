import { NextRequest, NextResponse } from "next/server";

const ANALYZE_PROMPT = (query: string, searchResults: string) => `You are a ruthless startup analyst. A founder wants to clone a competitor.

Competitor / query: "${query}"

Web research results:
${searchResults}

Give a brutal, specific breakdown. No fluff. If you don't have data on something, say "couldn't find" — don't make things up.

Return ONLY valid JSON (no markdown):
{
  "company_name": "...",
  "what_they_sell": "one sentence, brutally specific",
  "target_customer": "exact person who buys this",
  "pricing": {
    "plans": [{"name": "...", "price": "...", "what_you_get": "..."}],
    "model": "subscription|one-time|usage-based|freemium"
  },
  "revenue_estimate": "rough ARR or MRR if known, else 'unknown'",
  "tech_stack": ["..."],
  "what_customers_hate": ["specific complaint from reviews", "..."],
  "what_customers_love": ["specific praise from reviews", "..."],
  "their_weaknesses": ["specific gap or pain point", "..."],
  "how_to_clone": {
    "positioning": "how to position against them in one sentence",
    "differentiator": "the one thing you do differently that wins customers",
    "undercut_price": "what to charge to beat them",
    "build_time": "realistic days to build an MVP that competes",
    "first_10_customers": "exactly how to steal their first 10 customers"
  },
  "clone_spec": {
    "product_name": "your version's name",
    "tagline": "...",
    "mvp_features": ["feature 1", "feature 2", "feature 3", "feature 4"],
    "revenue_model": "...",
    "target_customer": "...",
    "estimated_mrr_30d": "$X-Y MRR realistic in 30 days"
  },
  "verdict": "one sentence: is this worth cloning? be direct"
}`;

export async function POST(req: NextRequest) {
  try {
    const { query, idea_title, idea_description } = await req.json();
    if (!query?.trim()) return NextResponse.json({ ok: false, error: "Query required" }, { status: 400 });

    const searchQuery = idea_title
      ? `${query} ${idea_title} competitor pricing reviews`
      : `${query} competitor pricing reviews customers`;

    // search with Tavily
    let searchResults = "";
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      try {
        const tavilyRes = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: tavilyKey,
            query: searchQuery,
            search_depth: "advanced",
            max_results: 8,
            include_domains: ["g2.com", "trustpilot.com", "reddit.com", "producthunt.com", "techcrunch.com"],
          }),
        });
        if (tavilyRes.ok) {
          const td = await tavilyRes.json();
          searchResults = (td.results || [])
            .map((r: any) => `[${r.title}]\n${r.content}`)
            .join("\n\n")
            .slice(0, 4000);
        }
      } catch {}
    }

    // fallback: ask Groq to use training knowledge if no search results
    if (!searchResults) {
      searchResults = `No live search results available. Use your training knowledge about ${query} to answer as accurately as possible. Mark any uncertain fields with "(estimated)".`;
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: ANALYZE_PROMPT(query, searchResults) }],
        max_tokens: 1500,
        temperature: 0.4,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return NextResponse.json({ ok: false, error: `Groq error: ${err}` }, { status: 500 });
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/```$/, "").trim();
    const result = JSON.parse(cleaned);

    return NextResponse.json({ ok: true, analysis: result });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
