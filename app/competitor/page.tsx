"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Pricing = {
  plans: { name: string; price: string; what_you_get: string }[];
  model: string;
};

type CloneSpec = {
  product_name: string;
  tagline: string;
  mvp_features: string[];
  revenue_model: string;
  target_customer: string;
  estimated_mrr_30d: string;
};

type HowToClone = {
  positioning: string;
  differentiator: string;
  undercut_price: string;
  build_time: string;
  first_10_customers: string;
};

type Analysis = {
  company_name: string;
  what_they_sell: string;
  target_customer: string;
  pricing: Pricing;
  revenue_estimate: string;
  tech_stack: string[];
  what_customers_hate: string[];
  what_customers_love: string[];
  their_weaknesses: string[];
  how_to_clone: HowToClone;
  clone_spec: CloneSpec;
  verdict: string;
};

function Section({ title, color = "var(--text-muted)", children }: { title: string; color?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--bg-panel)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "18px 20px",
    }}>
      <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function BulletList({ items, color = "var(--text-muted)" }: { items: string[]; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ color, fontSize: 12, flexShrink: 0, marginTop: 1 }}>—</span>
          <span style={{ color: "var(--text-primary)", fontSize: 13, lineHeight: 1.5 }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

function CompetitorPageInner() {
  const params = useSearchParams();
  const router = useRouter();

  const [query, setQuery] = useState(params.get("q") || "");
  const [ideaTitle] = useState(params.get("idea") || "");
  const [ideaId] = useState(params.get("idea_id") || "");
  const [running, setRunning] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloned, setCloned] = useState(false);

  // auto-run if query is pre-filled from ideas page
  useEffect(() => {
    if (params.get("q") && params.get("auto")) {
      analyze();
    }
  }, []);

  async function analyze() {
    if (!query.trim() || running) return;
    setRunning(true);
    setError("");
    setAnalysis(null);
    try {
      const res = await fetch("/api/analyze-competitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), idea_title: ideaTitle }),
      });
      const data = await res.json();
      if (data.ok) {
        setAnalysis(data.analysis);
      } else {
        setError(data.error || "Analysis failed");
      }
    } catch {
      setError("Could not reach server");
    }
    setRunning(false);
  }

  async function cloneToIdeas() {
    if (!analysis || cloning) return;
    setCloning(true);
    const spec = analysis.clone_spec;
    const clone = analysis.how_to_clone;
    await supabase.from("ideas").insert({
      title: spec.product_name,
      description: `Clone of ${analysis.company_name}. ${clone.positioning}`,
      source: "competitor",
      raw_score: 75,
      status: "raw",
      market_data: {
        revenue_model: spec.revenue_model,
        target_customer: spec.target_customer,
        market_size: "medium",
        reasoning: `${clone.differentiator}. First 10 customers: ${clone.first_10_customers}`,
        risks: `Going up against ${analysis.company_name} directly`,
        refined_pitch: spec.tagline,
        competitor_analysis: {
          original: analysis.company_name,
          their_weaknesses: analysis.their_weaknesses,
          what_customers_hate: analysis.what_customers_hate,
          undercut_price: clone.undercut_price,
          build_time: clone.build_time,
        },
        estimated_mrr_30d: spec.estimated_mrr_30d,
      },
    });
    setCloned(true);
    setCloning(false);
  }

  return (
    <div style={{ padding: "28px", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
            Competitor Intel
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0", fontFamily: "var(--font-geist-mono)" }}>
            Drop a competitor name or URL — get a clone brief
          </p>
        </div>
        {ideaTitle && (
          <div style={{
            padding: "6px 14px", borderRadius: 8,
            background: "rgba(124,106,255,0.08)", border: "1px solid rgba(124,106,255,0.2)",
          }}>
            <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>From idea</p>
            <p style={{ fontSize: 12, color: "#a78bfa", margin: 0 }}>{ideaTitle}</p>
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "18px 20px", display: "flex", gap: 10,
      }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") analyze(); }}
          placeholder='e.g. "Lemlist", "apollo.io", "https://lemlist.com", "AI cold email tool"'
          autoFocus
          style={{
            flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
            borderRadius: 8, color: "var(--text-primary)", fontSize: 14, padding: "10px 16px",
            outline: "none",
          }}
        />
        <button onClick={analyze} disabled={running || !query.trim()} style={{
          fontFamily: "var(--font-geist-mono)", fontSize: 11, letterSpacing: "0.06em",
          padding: "0 24px", borderRadius: 8, cursor: running || !query.trim() ? "default" : "pointer",
          background: running ? "rgba(251,191,36,0.1)" : "rgba(248,113,113,0.12)",
          border: `1px solid ${running ? "rgba(251,191,36,0.25)" : "rgba(248,113,113,0.3)"}`,
          color: running ? "#fbbf24" : "#f87171",
          textTransform: "uppercase", flexShrink: 0,
          opacity: !query.trim() ? 0.4 : 1,
        }}>
          {running ? "Analyzing..." : "🔍 Dissect"}
        </button>
      </div>

      {/* Loading state */}
      {running && (
        <div style={{
          background: "var(--bg-panel)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "40px 20px", textAlign: "center",
        }}>
          <div style={{ fontSize: 11, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", letterSpacing: "0.08em" }}>
            Searching reviews, pricing, and weaknesses...
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: "14px 18px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10 }}>
          <span style={{ fontSize: 13, color: "#f87171" }}>{error}</span>
        </div>
      )}

      {/* Analysis */}
      {analysis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Verdict banner */}
          <div style={{
            padding: "14px 20px", borderRadius: 10,
            background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)",
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
          }}>
            <div>
              <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "#f87171", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>Verdict</p>
              <p style={{ fontSize: 14, color: "var(--text-primary)", margin: 0, lineHeight: 1.5 }}>{analysis.verdict}</p>
            </div>
            <button
              onClick={cloneToIdeas}
              disabled={cloning || cloned}
              style={{
                fontFamily: "var(--font-geist-mono)", fontSize: 11, padding: "8px 20px", borderRadius: 8,
                cursor: cloned ? "default" : "pointer", whiteSpace: "nowrap", flexShrink: 0,
                background: cloned ? "rgba(52,211,153,0.12)" : "rgba(124,106,255,0.12)",
                border: `1px solid ${cloned ? "rgba(52,211,153,0.3)" : "rgba(124,106,255,0.3)"}`,
                color: cloned ? "#34d399" : "#a78bfa", textTransform: "uppercase",
              }}
            >
              {cloned ? "✓ Added to Pipeline" : cloning ? "Adding..." : "⚡ Clone to Ideas"}
            </button>
          </div>

          {/* Top row — what they sell + pricing */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Section title={`What ${analysis.company_name} actually sells`}>
              <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6, margin: "0 0 10px" }}>{analysis.what_they_sell}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)" }}>
                  👤 {analysis.target_customer}
                </span>
              </div>
              {analysis.revenue_estimate !== "unknown" && (
                <p style={{ fontSize: 11, fontFamily: "var(--font-geist-mono)", color: "#34d399", margin: "8px 0 0" }}>
                  💰 Est. revenue: {analysis.revenue_estimate}
                </p>
              )}
              {analysis.tech_stack?.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {analysis.tech_stack.map((t, i) => (
                    <span key={i} style={{
                      fontSize: 9, fontFamily: "var(--font-geist-mono)", padding: "2px 7px", borderRadius: 4,
                      background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--text-muted)",
                    }}>{t}</span>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Their pricing">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {analysis.pricing?.plans?.map((plan, i) => (
                  <div key={i} style={{
                    padding: "10px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{plan.name}</span>
                      <span style={{ fontSize: 12, fontFamily: "var(--font-geist-mono)", color: "#fbbf24" }}>{plan.price}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{plan.what_you_get}</span>
                  </div>
                ))}
                {(!analysis.pricing?.plans || analysis.pricing.plans.length === 0) && (
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Pricing not found publicly</p>
                )}
              </div>
            </Section>
          </div>

          {/* Customer intel */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Section title="What customers hate" color="#f87171">
              <BulletList items={analysis.what_customers_hate || []} color="#f87171" />
            </Section>
            <Section title="What customers love" color="#34d399">
              <BulletList items={analysis.what_customers_love || []} color="#34d399" />
            </Section>
          </div>

          {/* Weaknesses */}
          <Section title="Their weaknesses — where you win" color="#fbbf24">
            <BulletList items={analysis.their_weaknesses || []} color="#fbbf24" />
          </Section>

          {/* How to clone */}
          <div style={{
            background: "rgba(124,106,255,0.05)", border: "1px solid rgba(124,106,255,0.2)",
            borderRadius: 12, padding: "20px",
          }}>
            <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 16px" }}>
              How to clone it
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { label: "Positioning", value: analysis.how_to_clone?.positioning, color: "#a78bfa" },
                { label: "Your differentiator", value: analysis.how_to_clone?.differentiator, color: "#34d399" },
                { label: "Undercut price", value: analysis.how_to_clone?.undercut_price, color: "#fbbf24" },
                { label: "Build time", value: analysis.how_to_clone?.build_time, color: "#60a5fa" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>{label}</p>
                  <p style={{ fontSize: 13, color, margin: 0, lineHeight: 1.5 }}>{value || "—"}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 8 }}>
              <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "#34d399", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>How to steal their first 10 customers</p>
              <p style={{ fontSize: 13, color: "var(--text-primary)", margin: 0, lineHeight: 1.5 }}>{analysis.how_to_clone?.first_10_customers || "—"}</p>
            </div>
          </div>

          {/* Clone spec */}
          <div style={{
            background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.2)",
            borderRadius: 12, padding: "20px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>
                  Your version
                </p>
                <p style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>{analysis.clone_spec?.product_name}</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, fontStyle: "italic" }}>"{analysis.clone_spec?.tagline}"</p>
              </div>
              {analysis.clone_spec?.estimated_mrr_30d && (
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>MRR target</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: "#34d399", fontFamily: "var(--font-geist-mono)", margin: 0 }}>{analysis.clone_spec.estimated_mrr_30d}</p>
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Revenue model</p>
                <p style={{ fontSize: 12, color: "#a78bfa", margin: 0 }}>{analysis.clone_spec?.revenue_model}</p>
              </div>
              <div>
                <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Target customer</p>
                <p style={{ fontSize: 12, color: "var(--text-primary)", margin: 0 }}>{analysis.clone_spec?.target_customer}</p>
              </div>
            </div>
            {analysis.clone_spec?.mvp_features && (
              <div>
                <p style={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>MVP features</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {analysis.clone_spec.mvp_features.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 8 }}>
                      <span style={{ color: "#60a5fa", fontSize: 12, flexShrink: 0 }}>{i + 1}.</span>
                      <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={cloneToIdeas}
                disabled={cloning || cloned}
                style={{
                  fontFamily: "var(--font-geist-mono)", fontSize: 11, padding: "9px 24px", borderRadius: 8,
                  cursor: cloned ? "default" : "pointer",
                  background: cloned ? "rgba(52,211,153,0.12)" : "rgba(124,106,255,0.15)",
                  border: `1px solid ${cloned ? "rgba(52,211,153,0.3)" : "rgba(124,106,255,0.4)"}`,
                  color: cloned ? "#34d399" : "#a78bfa", textTransform: "uppercase",
                }}
              >
                {cloned ? "✓ Added to Ideas Pipeline" : cloning ? "Adding..." : "⚡ Clone to Ideas Pipeline"}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

export default function CompetitorPage() {
  return (
    <Suspense fallback={<div style={{ padding: 28, color: "var(--text-muted)", fontSize: 13 }}>Loading...</div>}>
      <CompetitorPageInner />
    </Suspense>
  );
}
