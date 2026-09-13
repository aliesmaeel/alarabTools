"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ToolDef } from "@alarab/tools";
import { Dropzone } from "./Dropzone";
import { loadToolModule } from "@/tools";
import type { ToolModule, Options } from "@/tools/types";
import * as engine from "@/lib/engine";
import { bundle, formatBytes, saveBlob } from "@/lib/download";
import { TextInput } from "@/tools/fields";

type Phase =
  | { kind: "pick" }
  | { kind: "configure" }
  | { kind: "running"; done: number; total: number }
  | { kind: "done"; blob: Blob; name: string; count: number; size: number; note?: { key: string; count?: number } }
  | { kind: "error"; message: string };

export function ToolRunner({ tool, what }: { tool: ToolDef; what: string }) {
  const t = useTranslations("runner");
  const to = useTranslations("options");
  const locale = useLocale();
  // undefined = still loading, null = no browser engine for this tool yet
  const [mod, setMod] = useState<ToolModule | null | undefined>(undefined);
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<Options>({});
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [needPassword, setNeedPassword] = useState(false);

  useEffect(() => {
    loadToolModule(tool.id).then((m) => {
      setMod(m);
      if (m) setOptions(m.defaults);
      if (m?.noFiles) setPhase({ kind: "configure" });
    });
  }, [tool.id]);

  function onFiles(next: File[]) {
    setFiles(next);
    setNeedPassword(false);
    setPhase({ kind: "configure" });
    engine.warmUp(tool.id);
    if (next[0]?.type === "application/pdf") engine.pageCount(next[0]).then(setPageCount);
    else setPageCount(null);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= files.length) return;
    const next = [...files];
    [next[i], next[j]] = [next[j], next[i]];
    setFiles(next);
  }

  function remove(i: number) {
    const next = files.filter((_, k) => k !== i);
    setFiles(next);
    if (next.length === 0) setPhase({ kind: "pick" });
  }

  async function runTool() {
    if (!mod) return;
    setPhase({ kind: "running", done: 0, total: 1 });
    // Progress travels on its own message channel, so a late update can land after the result; ignore those.
    let finished = false;
    const progress = (done: number, total: number) => {
      if (!finished) setPhase((p) => (p.kind === "running" ? { kind: "running", done, total } : p));
    };
    const prepared = { ...(mod.prepare ? mod.prepare(options) : options), locale };
    const result = mod.runOnMain ? await mod.runOnMain(files, prepared, progress) : await engine.run(tool.id, files, prepared, progress);
    finished = true;
    if (result.ok) {
      const { blob, name } = bundle(result.outputs, mod.zipName ?? `${tool.id}.zip`);
      setPhase({ kind: "done", blob, name, count: result.outputs.length, size: blob.size, note: result.note });
    } else if (result.code === "password") {
      setNeedPassword(true);
      setPhase({ kind: "configure" });
    } else {
      setPhase({ kind: "error", message: result.message === "no-pages" ? to("needPages") : result.message === "png-unsupported" ? t("pngUnsupported") : result.message === "undecodable" ? t("undecodable") : t("failed") });
    }
  }

  const validation = mod?.validate?.(options) ?? null;
  const canRun = (files.length > 0 || !!mod?.noFiles) && !validation && (!needPassword || !!options.password);
  const OptionsForm = mod?.Options;

  if ((phase.kind === "pick" && !mod?.noFiles) || mod === null) {
    return <Dropzone accepts={tool.accepts} maxFiles={tool.limits.maxFiles} maxBytes={tool.limits.maxBytes} what={what} onFiles={mod === null ? undefined : onFiles} camera={mod?.camera} />;
  }
  if (!mod) {
    return <div className="min-h-[260px] rounded-2xl border-2 border-dashed border-line-2 bg-surface" aria-busy="true" />;
  }

  if (phase.kind === "done") {
    return (
      <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-full bg-teal-soft text-teal">
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden className="fill-none stroke-current stroke-[2.2]" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
          </span>
          <div className="flex flex-col">
            <h2 className="text-2xl font-semibold">{t("doneTitle")}</h2>
            <span className="text-sm text-ink-2">{phase.count > 1 ? t("doneFiles", { count: phase.count }) : phase.name} · {formatBytes(phase.size, locale)}</span>
            {phase.note && <span data-testid="result-note" className="text-sm text-ink">{to(phase.note.key, { count: phase.note.count ?? 0 })}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => saveBlob(phase.blob, phase.name)} className="inline-flex h-14 items-center gap-2.5 rounded-[10px] bg-lapis px-7 text-lg font-semibold text-white hover:bg-lapis-deep">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className="fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
            {t("download")}
          </button>
          <button type="button" onClick={() => { setFiles([]); setPhase({ kind: mod.noFiles ? "configure" : "pick" }); }} className="inline-flex h-14 items-center rounded-[10px] border border-line-2 px-6 text-base font-medium hover:border-ink-3">
            {mod.noFiles ? t("again") : t("startOver")}
          </button>
        </div>
        <p className="text-sm text-ink-2">{mod.noFiles ? t("privacyNoteText") : t("privacyNote")}</p>
      </section>
    );
  }

  const errorBox = phase.kind === "error" ? <p role="alert" className="rounded-lg bg-[#fdecea] px-4 py-3 text-sm text-red">{phase.message}</p> : null;

  if (mod.noFiles) {
    return (
      <section className="flex max-w-[760px] flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        {OptionsForm && <OptionsForm value={options} onChange={setOptions} pageCount={null} fileCount={0} />}
        {errorBox}
        {validation && <span className="text-xs text-ink-2">{to(validation)}</span>}
        <button type="button" data-testid="run" disabled={!canRun || phase.kind === "running"} onClick={runTool} className="inline-flex h-14 items-center justify-center rounded-[10px] bg-lapis px-8 text-lg font-semibold text-white hover:bg-lapis-deep disabled:cursor-not-allowed disabled:opacity-40 sm:self-start">
          {phase.kind === "running" ? t("workingShort") : t("run", { name: tool.copy[locale as "ar" | "en"].name })}
        </button>
      </section>
    );
  }

  return (
    <section className={`grid items-start gap-6 ${mod.noRun ? "" : "lg:grid-cols-[minmax(0,1fr)_340px]"}`}>
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{t("fileCount", { count: files.length })}</span>
          {files.length < tool.limits.maxFiles && (
            <label className="cursor-pointer text-sm font-medium text-lapis">
              {t("addMore")}
              <input type="file" className="sr-only" accept={tool.accepts.join(",")} multiple={tool.limits.maxFiles > 1} onChange={(e) => e.target.files && onFiles([...files, ...Array.from(e.target.files)].slice(0, tool.limits.maxFiles))} />
            </label>
          )}
        </div>
        {mod.Workspace ? (
          <mod.Workspace files={files} value={options} onChange={setOptions} />
        ) : (
        <ul className="flex flex-col gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-sm">
              {mod.reorder && <span className="w-6 shrink-0 text-center font-semibold text-ink-2 tabular-nums">{i + 1}</span>}
              <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
              <span className="shrink-0 text-ink-2">{formatBytes(f.size, locale)}</span>
              {mod.reorder && files.length > 1 && (
                <span className="flex shrink-0 gap-1">
                  <button type="button" aria-label={t("moveUp")} disabled={i === 0} onClick={() => move(i, -1)} className="grid size-8 place-items-center rounded-md border border-line hover:border-ink-3 disabled:opacity-30">↑</button>
                  <button type="button" aria-label={t("moveDown")} disabled={i === files.length - 1} onClick={() => move(i, 1)} className="grid size-8 place-items-center rounded-md border border-line hover:border-ink-3 disabled:opacity-30">↓</button>
                </span>
              )}
              <button type="button" aria-label={t("remove")} onClick={() => remove(i)} className="grid size-8 shrink-0 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-red">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="fill-none stroke-current stroke-2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </li>
          ))}
        </ul>
        )}
        {errorBox}
      </div>

      {!mod.noRun && (
      <aside className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5">
        {OptionsForm && <OptionsForm value={options} onChange={setOptions} pageCount={pageCount} fileCount={files.length} />}
        {needPassword && (
          <div className="flex flex-col gap-1.5 rounded-lg bg-saffron-soft p-3">
            <label className="text-sm font-medium text-saffron-deep">{t("passwordNeeded")}</label>
            <TextInput type="password" dir="ltr" autoComplete="off" value={String(options.password ?? "")} onChange={(e) => setOptions({ ...options, password: e.target.value })} />
          </div>
        )}
        {validation && files.length > 0 && <span className="text-xs text-ink-2">{to(validation)}</span>}
        <button
          type="button"
          data-testid="run"
          disabled={!canRun || phase.kind === "running"}
          onClick={runTool}
          className="inline-flex h-14 items-center justify-center gap-2.5 rounded-[10px] bg-lapis text-lg font-semibold text-white hover:bg-lapis-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          {phase.kind === "running" ? t("working", { done: phase.done, total: phase.total }) : t("run", { name: tool.copy[locale as "ar" | "en"].name })}
        </button>
        {phase.kind === "running" && (
          <div className="h-2 overflow-hidden rounded-full bg-ground" role="progressbar" aria-valuemin={0} aria-valuemax={phase.total} aria-valuenow={phase.done}>
            <div className="h-full rounded-full bg-lapis transition-[width]" style={{ width: `${Math.max(8, (phase.done / Math.max(1, phase.total)) * 100)}%` }} />
          </div>
        )}
        <span className="text-xs text-ink-2">{tool.runtime === "browser" ? t("browserNote") : t("serverNote")}</span>
      </aside>
      )}
    </section>
  );
}
