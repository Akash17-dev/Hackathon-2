import { NextResponse } from "next/server";
import { getCampaign, listCampaigns, saveCampaign } from "@/lib/store";
import { PLATFORMS, type Campaign, type PlatformDraft, type PlatformId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function unavailable(error: unknown) {
  const message = error instanceof Error ? error.message : "Database unavailable";
  return NextResponse.json({ error: message }, { status: 503 });
}

function isDraft(value: unknown): value is PlatformDraft {
  if (!value || typeof value !== "object") return false;
  const raw = value as PlatformDraft;
  return (
    typeof raw.body === "string" &&
    Array.isArray(raw.hashtags) &&
    typeof raw.cta === "string" &&
    (raw.mediaType === "image" || raw.mediaType === "video") &&
    typeof raw.mediaPrompt === "string"
  );
}

function readPlatforms(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const platforms = {} as Campaign["platforms"];
  for (const id of PLATFORMS) {
    if (!isDraft(raw[id])) return null;
    const draft = raw[id] as PlatformDraft;
    const hashtags = draft.hashtags.map((tag) => String(tag).trim()).filter(Boolean);
    if (!draft.body.trim() || !draft.cta.trim() || !draft.mediaPrompt.trim() || hashtags.length === 0) {
      return null;
    }
    platforms[id as PlatformId] = {
      body: draft.body.trim(),
      hashtags,
      cta: draft.cta.trim(),
      mediaType: id === "youtube" ? "video" : "image",
      mediaPrompt: draft.mediaPrompt.trim(),
      title: typeof draft.title === "string" ? draft.title.trim() : undefined,
    };
  }
  return platforms;
}

export async function GET() {
  try {
    const campaigns = await listCampaigns();
    return NextResponse.json({ campaigns });
  } catch (error) {
    return unavailable(error);
  }
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { id?: string; platforms?: unknown };
  if (!body.id) {
    return NextResponse.json({ error: "Campaign id is required." }, { status: 400 });
  }
  let existing;
  try {
    existing = await getCampaign(body.id);
  } catch (error) {
    return unavailable(error);
  }
  if (!existing) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  const platforms = readPlatforms(body.platforms);
  if (!platforms) {
    return NextResponse.json({ error: "Each platform needs copy, hashtags, a CTA, and a media prompt." }, { status: 400 });
  }
  const updated: Campaign = {
    ...existing,
    platforms,
    updatedAt: new Date().toISOString(),
  };
  try {
    await saveCampaign(updated);
  } catch (error) {
    return unavailable(error);
  }
  return NextResponse.json({ campaign: updated });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    id?: string;
    action?: string;
    platforms?: unknown;
  };
  if (body.action !== "publish" || !body.id) {
    return NextResponse.json({ error: "Use action publish with a campaign id." }, { status: 400 });
  }
  let existing;
  try {
    existing = await getCampaign(body.id);
  } catch (error) {
    return unavailable(error);
  }
  if (!existing) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  const platforms = body.platforms ? readPlatforms(body.platforms) : existing.platforms;
  if (!platforms) {
    return NextResponse.json({ error: "Each platform needs copy, hashtags, a CTA, and a media prompt." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const updated: Campaign = {
    ...existing,
    platforms,
    status: "published",
    publishedAt: now,
    updatedAt: now,
  };
  try {
    await saveCampaign(updated);
  } catch (error) {
    return unavailable(error);
  }
  return NextResponse.json({
    campaign: updated,
    notice: "Simulated publish. Nothing was sent to LinkedIn, Instagram, Facebook, or YouTube.",
  });
}
