export async function groqCall(prompt: string, maxTokens = 600, temperature = 0.7): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set on server — add it to Vercel environment variables");

  const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

  for (const model of models) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature }),
    });

    if (res.status === 429) {
      // rate limited on this model — try the next one
      if (model === models[models.length - 1]) {
        const err = await res.json();
        const wait = err?.error?.message?.match(/try again in (.+?)\./)?.[1] ?? "a few minutes";
        throw new Error(`Rate limit on all models. Try again in ${wait}.`);
      }
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq error: ${err}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  throw new Error("Groq: all models exhausted");
}
