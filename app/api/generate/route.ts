import { NextResponse } from "next/server";
import { generateCampaignContent } from "@/lib/generate";
import { saveCampaign } from "@/lib/store";
import type { Brief, Campaign } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const FIELDS: (keyof Brief)[] = [
  "productName",
  "audience",
  "objective",
  "benefits",
  "tone",
];

function readBrief(body: unknown): Brief | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const brief = {} as Brief;
  for (const field of FIELDS) {
    const value = typeof raw[field] === "string" ? raw[field].trim() : "";
    if (!value || value.length > 800) return null;
    brief[field] = value;
  }
  return brief;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON brief." }, { status: 400 });
  }

  const source = payload && typeof payload === "object" ? (payload as { brief?: unknown }).brief ?? payload : payload;
  const brief = readBrief(source);
  if (!brief) {
    return NextResponse.json(
      { error: "Product name, audience, objective, benefits, and tone are required." },
      { status: 400 },
    );
  }

  const generated = await generateCampaignContent(brief);
  const now = new Date().toISOString();
  const campaign: Campaign = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: "draft",
    brief,
    provider: generated.provider,
    platforms: generated.platforms,
  };
  try {
    await saveCampaign(campaign);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
  return NextResponse.json({ campaign, notes: generated.notes });
}
