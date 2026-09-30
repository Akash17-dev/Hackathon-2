"use client";

import { useEffect, useState } from "react";
import { PLATFORM_META, PLATFORMS, type Brief, type Campaign, type PlatformId } from "@/lib/types";

const EMPTY_BRIEF: Brief = {
  productName: "",
  audience: "",
  objective: "",
  benefits: "",
  tone: "Warm and specific",
};

const SAMPLE: Brief = {
  productName: "Northline Carry",
  audience: "urban commuters who bike to work",
  objective: "drive pre-orders for the autumn drop",
  benefits: "weatherproof shell, an 18L pack that still fits under a cafe table, reflective night piping",
  tone: "Warm and specific",
};

const TONES = ["Warm and specific", "Professional", "Bold", "Playful"];

const PROVIDER_LABEL = {
  gemini: "Written by Gemini",
  grok: "Written by Grok",
  offline: "Studio draft",
};

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function formatWhen(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function CampaignStudio() {
  const [brief, setBrief] = useState<Brief>(EMPTY_BRIEF);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState<"generate" | "save" | "publish" | null>(null);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function refreshHistory() {
    const response = await fetch("/api/campaigns");
    const data = (await response.json()) as { campaigns: Campaign[] };
    setHistory(data.campaigns || []);
  }

  useEffect(() => {
    void refreshHistory().catch(() => setMessage("Could not load campaign history."));
  }, []);

  function updateBrief(field: keyof Brief, value: string) {
    setBrief((current) => ({ ...current, [field]: value }));
  }

  function updatePlatform(id: PlatformId, field: "body" | "cta" | "mediaPrompt" | "title" | "hashtags", value: string) {
    setCampaign((current) => {
      if (!current) return current;
      const next = {
        ...current.platforms[id],
        [field]: field === "hashtags" ? value.split(",").map((tag) => tag.trim()) : value,
      };
      return {
        ...current,
        platforms: { ...current.platforms, [id]: next },
      };
    });
  }

  async function generate() {
    setBusy("generate");
    setMessage("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Generation failed");
      setCampaign(data.campaign);
      setMessage(
        data.campaign.provider === "offline"
          ? "Draft ready from the studio generator. Add API keys to use Gemini or Grok."
          : `Draft ready. ${PROVIDER_LABEL[data.campaign.provider as keyof typeof PROVIDER_LABEL]}.`,
      );
      await refreshHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!campaign) return;
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch("/api/campaigns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id, platforms: campaign.platforms }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Save failed");
      setCampaign(data.campaign);
      setMessage("Edits saved. Still on this machine.");
      await refreshHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!campaign) return;
    setBusy("publish");
    setMessage("");
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: campaign.id,
          action: "publish",
          platforms: campaign.platforms,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Publish failed");
      setCampaign(data.campaign);
      setConfirming(false);
      setMessage(data.notice);
      await refreshHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publish failed");
    } finally {
      setBusy(null);
    }
  }

  function openCampaign(item: Campaign) {
    setCampaign(item);
    setBrief(item.brief);
    setConfirming(false);
    setMessage(`Opened ${item.brief.productName}.`);
  }

  return (
    <div className="app-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Campaign desk</p>
          <h1>One brief.<br />Four platforms.</h1>
        </div>
        <p className="lede">
          Write the product once. Review LinkedIn, Instagram, Facebook, and YouTube before a simulated publish.
        </p>
      </header>

      <div className="workspace">
        <form
          className="panel brief"
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <h2>Product brief</h2>
          <label className="field">
            <span>Product name</span>
            <input value={brief.productName} onChange={(event) => updateBrief("productName", event.target.value)} required />
          </label>
          <label className="field">
            <span>Target audience</span>
            <input value={brief.audience} onChange={(event) => updateBrief("audience", event.target.value)} required />
          </label>
          <label className="field">
            <span>Campaign objective</span>
            <textarea value={brief.objective} onChange={(event) => updateBrief("objective", event.target.value)} required />
          </label>
          <label className="field">
            <span>Key benefits</span>
            <textarea value={brief.benefits} onChange={(event) => updateBrief("benefits", event.target.value)} required />
          </label>
          <label className="field">
            <span>Desired tone</span>
            <input value={brief.tone} onChange={(event) => updateBrief("tone", event.target.value)} required />
          </label>
          <div className="tones">
            {TONES.map((tone) => (
              <button
                key={tone}
                type="button"
                className={brief.tone === tone ? "chip active" : "chip"}
                onClick={() => updateBrief("tone", tone)}
              >
                {tone}
              </button>
            ))}
          </div>
          <div className="actions">
            <button className="primary" type="submit" disabled={busy !== null}>
              {busy === "generate" ? "Writing…" : "Generate drafts"}
            </button>
            <button className="secondary" type="button" onClick={() => setBrief(SAMPLE)}>
              Use sample
            </button>
          </div>
          {message ? <p className="note">{message}</p> : null}
        </form>

        <section>
          {campaign ? (
            <div className="cards">
              {PLATFORMS.map((id) => {
                const draft = campaign.platforms[id];
                const meta = PLATFORM_META[id];
                return (
                  <article className="panel card" key={id}>
                    <div className="card-top">
                      <div>
                        <h3>{meta.label}</h3>
                        <p className="meta">{meta.note}</p>
                      </div>
                      <span className={campaign.status === "published" ? "status published" : "status"}>
                        {campaign.status}
                      </span>
                    </div>
                    <p className="meta">{PROVIDER_LABEL[campaign.provider]} · {wordCount(draft.body)} words</p>
                    {id === "youtube" ? (
                      <label className="field">
                        <span>Title</span>
                        <input value={draft.title || ""} onChange={(event) => updatePlatform(id, "title", event.target.value)} />
                      </label>
                    ) : null}
                    <label className="field">
                      <span>{id === "youtube" ? "Description" : "Post"}</span>
                      <textarea value={draft.body} onChange={(event) => updatePlatform(id, "body", event.target.value)} />
                    </label>
                    <label className="field">
                      <span>{id === "youtube" ? "Tags" : "Hashtags"}</span>
                      <input
                        value={draft.hashtags.join(", ")}
                        onChange={(event) => updatePlatform(id, "hashtags", event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Call to action</span>
                      <input value={draft.cta} onChange={(event) => updatePlatform(id, "cta", event.target.value)} />
                    </label>
                    <label className="field">
                      <span>{meta.mediaLabel}</span>
                      <textarea value={draft.mediaPrompt} onChange={(event) => updatePlatform(id, "mediaPrompt", event.target.value)} />
                    </label>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="panel empty">
              <div>
                <h2>Nothing on the desk yet.</h2>
                <p className="lede">Add a brief, or use the sample, then generate four drafts you can edit.</p>
              </div>
            </div>
          )}
          {campaign ? (
            <div className="card-actions">
              <button className="secondary" type="button" onClick={() => void save()} disabled={busy !== null}>
                {busy === "save" ? "Saving…" : "Save edits"}
              </button>
              <button className="publish" type="button" onClick={() => setConfirming(true)} disabled={busy !== null}>
                Approve and publish
              </button>
            </div>
          ) : null}
        </section>

        <aside className="panel history">
          <div className="history-top">
            <h2>History</h2>
            <span className="meta">{history.length}</span>
          </div>
          {history.length === 0 ? <p className="note">Published and draft campaigns stay in this list.</p> : null}
          <ul className="history-list">
            {history.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={campaign?.id === item.id ? "active" : ""}
                  onClick={() => openCampaign(item)}
                >
                  <strong>{item.brief.productName}</strong>
                  <small>
                    {item.status} · {formatWhen(item.publishedAt || item.createdAt)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {confirming && campaign ? (
        <div className="modal-back" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="publish-title">
            <h2 id="publish-title">Approve and publish</h2>
            <p>
              This is a simulation for {campaign.brief.productName}. Nothing will be sent to LinkedIn, Instagram, Facebook, or YouTube. The campaign will be marked published in history.
            </p>
            <div className="actions">
              <button className="publish" type="button" onClick={() => void publish()} disabled={busy !== null}>
                {busy === "publish" ? "Publishing…" : "Confirm publish"}
              </button>
              <button className="secondary" type="button" onClick={() => setConfirming(false)}>
                Keep editing
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
