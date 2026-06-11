import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { agent } = await req.json();
  if (!agent) return NextResponse.json({ ok: false, error: "agent name required" }, { status: 400 });

  const workerUrl = process.env.WORKER_SERVICE_URL;
  if (!workerUrl) return NextResponse.json({ ok: false, error: "WORKER_SERVICE_URL not configured" }, { status: 500 });

  try {
    const res = await fetch(`${workerUrl}/run/${agent}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: `Worker returned ${res.status}: ${text}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Worker unreachable" }, { status: 502 });
  }
}
