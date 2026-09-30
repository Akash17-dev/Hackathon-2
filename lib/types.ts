export const PLATFORMS = ["linkedin", "instagram", "facebook", "youtube"] as const;

export type PlatformId = (typeof PLATFORMS)[number];

export type ProviderName = "gemini" | "grok" | "offline";

export type Brief = {
  productName: string;
  audience: string;
  objective: string;
  benefits: string;
  tone: string;
};

export type PlatformDraft = {
  body: string;
  hashtags: string[];
  cta: string;
  mediaType: "image" | "video";
  mediaPrompt: string;
  title?: string;
};

export type Campaign = {
  id: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  status: "draft" | "published";
  brief: Brief;
  provider: ProviderName;
  platforms: Record<PlatformId, PlatformDraft>;
};

export const PLATFORM_META: Record<
  PlatformId,
  { label: string; note: string; mediaLabel: string }
> = {
  linkedin: {
    label: "LinkedIn",
    note: "Professional, 120–180 words, 3–5 hashtags",
    mediaLabel: "Image prompt",
  },
  instagram: {
    label: "Instagram",
    note: "Short caption, 8–12 hashtags",
    mediaLabel: "Image prompt",
  },
  facebook: {
    label: "Facebook",
    note: "Conversational, 60–100 words, 2–4 hashtags",
    mediaLabel: "Image prompt",
  },
  youtube: {
    label: "YouTube",
    note: "Title, description, 5–8 tags, video prompt",
    mediaLabel: "Video prompt",
  },
};
