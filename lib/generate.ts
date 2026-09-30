import type { Brief, PlatformDraft, PlatformId, ProviderName } from "./types";
import { PLATFORMS } from "./types";

const SYSTEM_PROMPT = `You are a marketing content agent. Convert one product brief into four platform-specific campaign drafts.

Return only JSON with this shape:
{
  "platforms": {
    "linkedin": { "body": "", "hashtags": [], "cta": "", "mediaType": "image", "mediaPrompt": "" },
    "instagram": { "body": "", "hashtags": [], "cta": "", "mediaType": "image", "mediaPrompt": "" },
    "facebook": { "body": "", "hashtags": [], "cta": "", "mediaType": "image", "mediaPrompt": "" },
    "youtube": { "title": "", "body": "", "hashtags": [], "cta": "", "mediaType": "video", "mediaPrompt": "" }
  }
}

Rules:
- LinkedIn: professional voice, about 120-180 words, 3-5 hashtags, a soft professional call to action. mediaType must be "image". mediaPrompt is a still-image prompt.
- Instagram: short caption with line breaks, 8-12 hashtags, a direct call to action. mediaType "image".
- Facebook: conversational, about 60-100 words, 2-4 hashtags, a community call to action. mediaType "image".
- YouTube: title, description in body (about 80-140 words), 5-8 tags in hashtags without requiring #, a subscribe or watch call to action. mediaType "video". mediaPrompt describes hook, shots, on-screen text, and end card.
- Match the requested tone. Use the product name, audience, objective, and benefits. Do not invent discounts, awards, or statistics.
- Hashtags start with # except YouTube tags, which are plain keywords.
- No markdown fences. JSON only.`;

export function briefToPrompt(brief: Brief) {
  return `Product name: ${brief.productName}
Target audience: ${brief.audience}
Campaign objective: ${brief.objective}
Key benefits: ${brief.benefits}
Desired tone: ${brief.tone}`;
}

function stripFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : trimmed;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizePlatform(
  id: PlatformId,
  value: unknown,
): PlatformDraft | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const body = asString(raw.body) || asString(raw.description);
  const cta = asString(raw.cta);
  const mediaPrompt = asString(raw.mediaPrompt);
  const hashtags = asTags(raw.hashtags);
  if (!body || !cta || !mediaPrompt || hashtags.length === 0) return null;
  const draft: PlatformDraft = {
    body,
    hashtags,
    cta,
    mediaType: id === "youtube" ? "video" : "image",
    mediaPrompt,
  };
  if (id === "youtube") {
    draft.title = asString(raw.title) || body.split("\n")[0].slice(0, 80);
  }
  return draft;
}

export function parsePlatforms(text: string) {
  const parsed = JSON.parse(stripFence(text)) as { platforms?: unknown };
  const source =
    parsed.platforms && typeof parsed.platforms === "object"
      ? (parsed.platforms as Record<string, unknown>)
      : (parsed as Record<string, unknown>);
  const platforms = {} as Record<PlatformId, PlatformDraft>;
  for (const id of PLATFORMS) {
    const draft = normalizePlatform(id, source[id]);
    if (!draft) return null;
    platforms[id] = draft;
  }
  return platforms;
}

async function readError(response: Response) {
  try {
    return (await response.text()).slice(0, 400);
  } catch {
    return response.statusText;
  }
}

async function generateWithGemini(brief: Brief) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(process.env.VERCEL ? 8000 : 25000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: briefToPrompt(brief) }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${await readError(response)}`);
  }
  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const platforms = parsePlatforms(text);
  if (!platforms) throw new Error("Gemini returned an incomplete campaign");
  return platforms;
}

async function generateWithGrok(brief: Brief) {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) throw new Error("XAI_API_KEY is not set");
  const model = process.env.XAI_MODEL?.trim() || "grok-3";
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(process.env.VERCEL ? 8000 : 25000),
    body: JSON.stringify({
      model,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: briefToPrompt(brief) },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Grok ${response.status}: ${await readError(response)}`);
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content || "";
  const platforms = parsePlatforms(text);
  if (!platforms) throw new Error("Grok returned an incomplete campaign");
  return platforms;
}

function tagify(value: string) {
  const clean = value.replace(/[^a-zA-Z0-9]+/g, "");
  return clean ? `#${clean.slice(0, 28)}` : "#Campaign";
}

function benefitList(benefits: string) {
  const parts = benefits
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length ? parts : [benefits.trim()];
}

function toneLine(tone: string) {
  const key = tone.toLowerCase();
  if (key.includes("play")) return "Said simply, and easy to pass along.";
  if (key.includes("bold") || key.includes("urgent")) return "The outcome comes first, and the ask stays direct.";
  if (key.includes("warm")) return "Told the way you would recommend it to a friend.";
  if (key.includes("witty")) return "One sharp observation, then the practical part.";
  return "Clear, credible, and free of hype.";
}

function offlinePlatforms(brief: Brief): Record<PlatformId, PlatformDraft> {
  const benefits = benefitList(brief.benefits);
  const lead = benefits[0];
  const rest = benefits.slice(1, 3);
  const product = brief.productName.trim();
  const audience = brief.audience.trim();
  const objective = brief.objective.trim();
  const tone = brief.tone.trim();
  const voice = toneLine(tone);
  const productTag = tagify(product);
  const extra = rest.length ? ` Also in the brief: ${rest.join("; ")}.` : "";

  const linkedinBody = [
    `${audience} are being asked to do more with the same attention. ${product} is built for that pressure.`,
    `The campaign objective is simple: ${objective}. The first thing people should remember is this: ${lead}.${extra}`,
    `${voice} In a feed full of generic launches, name the job ${product} actually takes off someone's plate. Mention who it is for, what changes in the first week, and why waiting keeps the old workflow in place.`,
    `If you lead, buy, or recommend tools for ${audience}, this is a practical next conversation rather than another product announcement. Share it with the person who owns the workflow, and keep the claim tied to the benefits above.`,
  ].join("\n\n");

  const instagramBody = [
    `${product} for ${audience}.`,
    lead.endsWith(".") ? lead : `${lead}.`,
    rest[0] ? rest[0] : `Built around one goal: ${objective}.`,
    `${voice}`,
    `Save this if ${objective.toLowerCase()} is on your list.`,
  ].join("\n\n");

  const facebookBody = [
    `Quick one for ${audience}.`,
    `${product} leads with this: ${lead}.${extra}`,
    `The point of this campaign: ${objective}. ${voice}`,
    `If that sounds like your week, tell us what you would try first.`,
  ].join(" ");

  const youtubeTitle = `${product}: ${objective}`.slice(0, 90);
  const youtubeBody = [
    `${youtubeTitle}`,
    ``,
    `This video is for ${audience}. The outcome to remember: ${objective}.`,
    `${product} matters here because of this: ${lead}.${extra}`,
    `${voice}`,
    `Watch for the problem, the product in use, and a clear next step. No invented stats, just the benefits in the brief.`,
  ].join("\n");

  return {
    linkedin: {
      body: linkedinBody,
      hashtags: [productTag, "#B2BMarketing", "#ProductLaunch", "#GoToMarket"].slice(0, 4),
      cta: `See how ${product} supports ${audience}.`,
      mediaType: "image",
      mediaPrompt: `Editorial still photograph, 4:5. One person from this audience — ${audience} — at a calm desk. ${product} is suggested by a clean object in frame, warm paper and ink tones, no logos, no fake UI text. Mood: ${tone}. Headline space at the top for "${lead}".`,
    },
    instagram: {
      body: instagramBody,
      hashtags: [
        productTag,
        "#Campaign",
        "#BrandStory",
        "#Marketing",
        "#Creators",
        "#ProductDesign",
        "#LaunchDay",
        "#ForYou",
        "#NewDrop",
        "#MadeForWork",
      ],
      cta: "Tap through and tell a friend who needs this.",
      mediaType: "image",
      mediaPrompt: `Square lifestyle frame. Bold crop, one person from ${audience}, saturated but natural light, ${product} as the hero object. On-image text area left empty. Tone: ${tone}. Feeling of ${objective}.`,
    },
    facebook: {
      body: facebookBody,
      hashtags: [productTag, "#Community", "#SmallWins"],
      cta: "Comment with the benefit you would use first.",
      mediaType: "image",
      mediaPrompt: `Wide 1.91:1 photo for a feed. Two people from ${audience} in conversation, ${product} nearby, friendly and specific, not stock-smile. Natural color, room for a short caption overlay: "${lead}". Tone: ${tone}.`,
    },
    youtube: {
      title: youtubeTitle,
      body: youtubeBody,
      hashtags: [
        product.replace(/\s+/g, ""),
        audience.split(" ")[0] || "audience",
        "product demo",
        "campaign",
        objective.split(" ")[0] || "launch",
        "how it works",
      ],
      cta: `Watch to the end, then subscribe for the next ${product} walkthrough.`,
      mediaType: "video",
      mediaPrompt: `30-45s vertical and 16:9 cut. Hook in 3 seconds: someone from this audience — ${audience} — stuck on the old way, on-screen text "${lead}". Cut to three quick shots showing ${product} in use. Mid card states the objective: "${objective}". End card: product name ${product}, tone ${tone}, and the spoken CTA to watch the next video. No fake testimonials.`,
    },
  };
}

export async function generateCampaignContent(brief: Brief): Promise<{
  provider: ProviderName;
  platforms: Record<PlatformId, PlatformDraft>;
  notes: string[];
}> {
  const notes: string[] = [];
  const attempts: { name: ProviderName; run: () => Promise<Record<PlatformId, PlatformDraft>> }[] = [
    { name: "gemini", run: () => generateWithGemini(brief) },
    { name: "grok", run: () => generateWithGrok(brief) },
  ];

  for (const attempt of attempts) {
    try {
      const platforms = await attempt.run();
      return { provider: attempt.name, platforms, notes };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      notes.push(`${attempt.name}: ${message}`);
    }
  }

  notes.push("offline: used the built-in studio generator");
  return { provider: "offline", platforms: offlinePlatforms(brief), notes };
}
