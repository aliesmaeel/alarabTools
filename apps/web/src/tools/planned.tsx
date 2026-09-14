"use client";

/**
 * Option forms for the planned tools (README "Future plans"). The pages exist so the UI can be reviewed;
 * ToolRunner refuses to run tools whose registry status is "planned", so nothing here reaches a worker yet.
 * When a tool is built, move its module out of this file and drop `status: "planned"` from the registry.
 */

import { useTranslations } from "next-intl";
import type { OptionsProps, ToolModule } from "./types";
import { Checkbox, Field, RadioGroup, TextInput, inputCls } from "./fields";
import { validUrl } from "./server-options";

// ---------- URL shortener ----------
type ShortenO = { url: string; alias: string; expiry: "never" | "1d" | "7d" | "30d" | "1y"; stats: boolean };
function ShortenOptions({ value, onChange }: OptionsProps<ShortenO>) {
  const t = useTranslations("options.shorten");
  const set = (patch: Partial<ShortenO>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("url")} hint={t("urlHint")}>
        {(id) => <TextInput id={id} dir="ltr" type="url" inputMode="url" placeholder="https://example.com/a-very-long-address" value={value.url} onChange={(e) => set({ url: e.target.value })} />}
      </Field>
      <Field label={t("alias")} hint={t("aliasHint")}>
        {(id) => (
          <div dir="ltr" className="flex items-center gap-1 text-sm text-ink-2">
            <span className="shrink-0">alarab.to/</span>
            <TextInput id={id} dir="ltr" placeholder="my-link" maxLength={30} value={value.alias} onChange={(e) => set({ alias: e.target.value.replace(/[^a-zA-Z0-9-_]/g, "") })} />
          </div>
        )}
      </Field>
      <Field label={t("expiry")}>
        {(id) => (
          <select id={id} value={value.expiry} onChange={(e) => set({ expiry: e.target.value as ShortenO["expiry"] })} className={inputCls}>
            <option value="never">{t("never")}</option>
            <option value="1d">{t("day")}</option>
            <option value="7d">{t("week")}</option>
            <option value="30d">{t("month")}</option>
            <option value="1y">{t("year")}</option>
          </select>
        )}
      </Field>
      <Checkbox checked={value.stats} onChange={(stats) => set({ stats })} label={t("stats")} />
      <p className="text-xs text-ink-2">{t("safety")}</p>
    </div>
  );
}
export const shortenUrl: ToolModule<ShortenO> = {
  defaults: { url: "", alias: "", expiry: "never", stats: true },
  Options: ShortenOptions,
  noFiles: true,
  validate: (o) => (validUrl(o.url) ? null : "needUrl"),
};

// ---------- Convert video ----------
type VideoFormat = "mp4" | "webm" | "mov" | "mkv" | "avi" | "gif";
type VideoO = { format: VideoFormat; quality: "same" | "high" | "medium" | "small"; resolution: "original" | "1080" | "720" | "480"; mute: boolean; gifFps: 10 | 15 | 24 };
function VideoOptions({ value, onChange }: OptionsProps<VideoO>) {
  const t = useTranslations("options.video");
  const set = (patch: Partial<VideoO>) => onChange({ ...value, ...patch });
  const formats: { value: VideoFormat; label: string; hint: string }[] = [
    { value: "mp4", label: "MP4", hint: t("mp4Hint") },
    { value: "webm", label: "WebM", hint: t("webmHint") },
    { value: "mov", label: "MOV", hint: t("movHint") },
    { value: "mkv", label: "MKV", hint: t("mkvHint") },
    { value: "avi", label: "AVI", hint: t("aviHint") },
    { value: "gif", label: t("gif"), hint: t("gifHint") },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("format")}</span>
        <div className="grid grid-cols-2 gap-2">
          {formats.map((f) => (
            <button key={f.value} type="button" aria-pressed={value.format === f.value} title={f.hint} onClick={() => set({ format: f.value })} className={`flex h-12 flex-col items-center justify-center rounded-lg border text-sm font-semibold ${value.format === f.value ? "border-lapis bg-lapis-soft text-lapis-deep" : "border-line bg-surface hover:border-ink-3"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-ink-2">{formats.find((f) => f.value === value.format)?.hint}</span>
      </div>
      {value.format === "gif" ? (
        <Field label={t("gifFps")}>
          {(id) => (
            <select id={id} value={value.gifFps} onChange={(e) => set({ gifFps: Number(e.target.value) as VideoO["gifFps"] })} className={inputCls}>
              <option value={10}>10 fps</option>
              <option value={15}>15 fps</option>
              <option value={24}>24 fps</option>
            </select>
          )}
        </Field>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("quality")}</span>
          <RadioGroup
            name="video-quality"
            value={value.quality}
            onChange={(quality) => set({ quality })}
            options={[
              { value: "same", label: t("same"), hint: t("sameHint") },
              { value: "high", label: t("high"), hint: t("highHint") },
              { value: "medium", label: t("medium"), hint: t("mediumHint") },
              { value: "small", label: t("small"), hint: t("smallHint") },
            ]}
          />
        </div>
      )}
      <Field label={t("resolution")}>
        {(id) => (
          <select id={id} value={value.resolution} onChange={(e) => set({ resolution: e.target.value as VideoO["resolution"] })} className={inputCls}>
            <option value="original">{t("original")}</option>
            <option value="1080">1080p</option>
            <option value="720">720p</option>
            <option value="480">480p</option>
          </select>
        )}
      </Field>
      {value.format !== "gif" && <Checkbox checked={value.mute} onChange={(mute) => set({ mute })} label={t("mute")} />}
    </div>
  );
}
export const convertVideo: ToolModule<VideoO> = {
  defaults: { format: "mp4", quality: "same", resolution: "original", mute: false, gifFps: 15 },
  Options: VideoOptions,
  zipName: "videos.zip",
};

// ---------- Video to audio (MP4 to MP3) ----------
type AudioFormat = "mp3" | "m4a" | "wav";
type ToAudioO = { format: AudioFormat; bitrate: "128" | "192" | "320"; trim: boolean; start: string; end: string };
const TIME = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
function ToAudioOptions({ value, onChange }: OptionsProps<ToAudioO>) {
  const t = useTranslations("options.audio");
  const set = (patch: Partial<ToAudioO>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("format")}</span>
        <RadioGroup
          name="audio-format"
          value={value.format}
          onChange={(format) => set({ format })}
          options={[
            { value: "mp3", label: "MP3", hint: t("mp3Hint") },
            { value: "m4a", label: "M4A (AAC)", hint: t("m4aHint") },
            { value: "wav", label: "WAV", hint: t("wavHint") },
          ]}
        />
      </div>
      {value.format !== "wav" && (
        <Field label={t("bitrate")}>
          {(id) => (
            <select id={id} value={value.bitrate} onChange={(e) => set({ bitrate: e.target.value as ToAudioO["bitrate"] })} className={inputCls}>
              <option value="128">128 kbps · {t("bitrateSmall")}</option>
              <option value="192">192 kbps · {t("bitrateGood")}</option>
              <option value="320">320 kbps · {t("bitrateBest")}</option>
            </select>
          )}
        </Field>
      )}
      <Checkbox checked={value.trim} onChange={(trim) => set({ trim })} label={t("trim")} />
      {value.trim && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("start")}>
            {(id) => <TextInput id={id} dir="ltr" inputMode="numeric" placeholder="0:00" value={value.start} onChange={(e) => set({ start: e.target.value })} />}
          </Field>
          <Field label={t("end")} hint={t("endHint")}>
            {(id) => <TextInput id={id} dir="ltr" inputMode="numeric" placeholder="1:30" value={value.end} onChange={(e) => set({ end: e.target.value })} />}
          </Field>
        </div>
      )}
    </div>
  );
}
export const videoToAudio: ToolModule<ToAudioO> = {
  defaults: { format: "mp3", bitrate: "192", trim: false, start: "", end: "" },
  Options: ToAudioOptions,
  zipName: "audio.zip",
  validate: (o) => (o.trim && ((o.start && !TIME.test(o.start)) || (o.end && !TIME.test(o.end))) ? "badTime" : null),
};

// ---------- Audio to video (MP3 to MP4) ----------
type ToVideoO = { background: "image" | "waveform" | "color"; image: File | null; color: string; accent: string; aspect: "16:9" | "1:1" | "9:16"; title: string };
function ToVideoOptions({ value, onChange }: OptionsProps<ToVideoO>) {
  const t = useTranslations("options.toVideo");
  const set = (patch: Partial<ToVideoO>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("background")}</span>
        <RadioGroup
          name="video-bg"
          value={value.background}
          onChange={(background) => set({ background })}
          options={[
            { value: "image", label: t("image"), hint: t("imageHint") },
            { value: "waveform", label: t("waveform"), hint: t("waveformHint") },
            { value: "color", label: t("color"), hint: t("colorHint") },
          ]}
        />
      </div>
      {value.background === "image" && (
        <Field label={t("chooseImage")}>
          {(id) => <input id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => set({ image: e.target.files?.[0] ?? null })} className="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-lapis-soft file:px-3 file:py-2 file:font-medium file:text-lapis" />}
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("bgColor")}>
          {(id) => <input id={id} type="color" value={value.color} onChange={(e) => set({ color: e.target.value })} className="h-11 w-full cursor-pointer rounded-lg border border-line-2 bg-surface p-1" />}
        </Field>
        {value.background === "waveform" && (
          <Field label={t("waveColor")}>
            {(id) => <input id={id} type="color" value={value.accent} onChange={(e) => set({ accent: e.target.value })} className="h-11 w-full cursor-pointer rounded-lg border border-line-2 bg-surface p-1" />}
          </Field>
        )}
      </div>
      <Field label={t("aspect")}>
        {(id) => (
          <select id={id} value={value.aspect} onChange={(e) => set({ aspect: e.target.value as ToVideoO["aspect"] })} className={inputCls}>
            <option value="16:9">16:9 · {t("landscape")}</option>
            <option value="1:1">1:1 · {t("square")}</option>
            <option value="9:16">9:16 · {t("portrait")}</option>
          </select>
        )}
      </Field>
      <Field label={t("title")} hint={t("titleHint")}>
        {(id) => <TextInput id={id} value={value.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} />}
      </Field>
    </div>
  );
}
export const audioToVideo: ToolModule<ToVideoO> = {
  defaults: { background: "waveform", image: null, color: "#161b2f", accent: "#3346b8", aspect: "16:9", title: "" },
  Options: ToVideoOptions,
  zipName: "videos.zip",
  validate: (o) => (o.background === "image" && !o.image ? "needImage" : null),
};

// ---------- Download from social media ----------
type SocialO = { url: string; quality: "best" | "720" | "audio"; own: boolean };
const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(facebook\.com|fb\.watch)$/, "Facebook"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
];
export function platformOf(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return PLATFORMS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}
function SocialOptions({ value, onChange }: OptionsProps<SocialO>) {
  const t = useTranslations("options.social");
  const set = (patch: Partial<SocialO>) => onChange({ ...value, ...patch });
  const platform = platformOf(value.url);
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("url")} hint={platform ? t("detected", { platform }) : t("urlHint")}>
        {(id) => <TextInput id={id} dir="ltr" type="url" inputMode="url" placeholder="https://www.instagram.com/p/…" value={value.url} onChange={(e) => set({ url: e.target.value })} />}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("quality")}</span>
        <RadioGroup
          name="social-quality"
          value={value.quality}
          onChange={(quality) => set({ quality })}
          options={[
            { value: "best", label: t("best") },
            { value: "720", label: t("small") },
            { value: "audio", label: t("audio") },
          ]}
        />
      </div>
      <Checkbox checked={value.own} onChange={(own) => set({ own })} label={t("own")} />
      <p className="text-xs text-ink-2">{t("policy")}</p>
    </div>
  );
}
export const socialDownload: ToolModule<SocialO> = {
  defaults: { url: "", quality: "best", own: false },
  Options: SocialOptions,
  noFiles: true,
  validate: (o) => (!platformOf(o.url) ? "needSocialUrl" : !o.own ? "needOwnContent" : null),
};
