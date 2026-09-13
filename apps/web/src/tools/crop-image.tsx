"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import type { ToolModule, WorkspaceProps } from "./types";

type Rect = { x: number; y: number; w: number; h: number }; // fractions of the image
type O = { rect: Rect; aspect: "free" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16" };

const ASPECTS: Record<Exclude<O["aspect"], "free">, number> = { "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4, "16:9": 16 / 9, "9:16": 9 / 16 };
type Handle = "move" | "nw" | "ne" | "sw" | "se";

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function Workspace({ files, value, onChange }: WorkspaceProps<O>) {
  const t = useTranslations("options.cropImage");
  const file = files[0];
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const [imgRatio, setImgRatio] = useState(1); // width / height in pixels
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; start: Rect; px: number; py: number } | null>(null);

  const rect = value.rect;
  const ratio = value.aspect === "free" ? null : ASPECTS[value.aspect];

  /** Fit a rect to the aspect ratio in image-fraction space (accounts for the image's own ratio). */
  function fit(r: Rect, anchor: Handle): Rect {
    if (!ratio) return r;
    // Desired h (fraction) for a given w (fraction): h = w * imgRatio / ratio
    let w = r.w;
    let h = (w * imgRatio) / ratio;
    if (h > 1) { h = 1; w = (h * ratio) / imgRatio; }
    const x = anchor === "ne" || anchor === "se" || anchor === "move" ? r.x : r.x + r.w - w;
    const y = anchor === "sw" || anchor === "se" || anchor === "move" ? r.y : r.y + r.h - h;
    return { x: clamp(x, 0, 1 - w), y: clamp(y, 0, 1 - h), w, h };
  }

  const setAspect = (aspect: O["aspect"]) => {
    const r = aspect === "free" ? rect : (() => {
      const ar = ASPECTS[aspect];
      let w = 0.8, h = (w * imgRatio) / ar;
      if (h > 0.8) { h = 0.8; w = (h * ar) / imgRatio; }
      return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
    })();
    onChange({ aspect, rect: r });
  };

  const pos = (e: ReactPointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    return { px: (e.clientX - b.left) / b.width, py: (e.clientY - b.top) / b.height };
  };
  const down = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const handle = (e.currentTarget as HTMLElement).dataset.handle as Handle;
    const { px, py } = pos(e);
    drag.current = { handle, start: rect, px, py };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const { handle, start, px, py } = drag.current;
    const { px: cx, py: cy } = pos(e);
    const dx = cx - px, dy = cy - py;
    let r: Rect;
    if (handle === "move") {
      r = { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
    } else {
      const min = 0.05;
      let x = start.x, y = start.y, w = start.w, h = start.h;
      if (handle === "se" || handle === "ne") w = clamp(start.w + dx, min, 1 - start.x);
      if (handle === "sw" || handle === "nw") { const nx = clamp(start.x + dx, 0, start.x + start.w - min); w = start.w + (start.x - nx); x = nx; }
      if (handle === "se" || handle === "sw") h = clamp(start.h + dy, min, 1 - start.y);
      if (handle === "ne" || handle === "nw") { const ny = clamp(start.y + dy, 0, start.y + start.h - min); h = start.h + (start.y - ny); y = ny; }
      r = fit({ x, y, w, h }, handle);
    }
    onChange({ ...value, rect: r });
  };
  const up = () => { drag.current = null; };

  const handleCls = "absolute size-4 rounded-full border-2 border-white bg-lapis shadow";
  const aspects: O["aspect"][] = ["free", "1:1", "4:3", "3:4", "16:9", "9:16"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("aspect")}>
        {aspects.map((a) => (
          <button key={a} type="button" role="radio" aria-checked={value.aspect === a} onClick={() => setAspect(a)} className={`h-9 rounded-md border px-3 text-sm font-medium ${value.aspect === a ? "border-lapis bg-lapis text-white" : "border-line bg-surface hover:border-ink-3"}`}>
            {a === "free" ? t("free") : a}
          </button>
        ))}
      </div>
      <div className="relative mx-auto w-full max-w-[720px] select-none">
        {url && (
          <div ref={box} className="relative overflow-hidden rounded-lg bg-ground" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" draggable={false} onLoad={(e) => setImgRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} className="block w-full" />
            <div className="pointer-events-none absolute inset-0 bg-ink/50" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${rect.y * 100}%, ${rect.x * 100}% ${rect.y * 100}%, ${rect.x * 100}% ${(rect.y + rect.h) * 100}%, ${(rect.x + rect.w) * 100}% ${(rect.y + rect.h) * 100}%, ${(rect.x + rect.w) * 100}% ${rect.y * 100}%, 0 ${rect.y * 100}%)` }} />
            <div
              data-testid="crop-rect"
              data-handle="move" onPointerDown={down}
              className="absolute cursor-move touch-none border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
            >
              <span data-handle="nw" onPointerDown={down} className={`${handleCls} -left-2 -top-2 cursor-nwse-resize touch-none`} />
              <span data-handle="ne" onPointerDown={down} className={`${handleCls} -right-2 -top-2 cursor-nesw-resize touch-none`} />
              <span data-handle="sw" onPointerDown={down} className={`${handleCls} -bottom-2 -left-2 cursor-nesw-resize touch-none`} />
              <span data-handle="se" onPointerDown={down} data-testid="crop-se" className={`${handleCls} -bottom-2 -right-2 cursor-nwse-resize touch-none`} />
            </div>
          </div>
        )}
      </div>
      <span className="text-xs text-ink-2">{t("hint")}</span>
    </div>
  );
}

export const cropImage: ToolModule<O> = {
  defaults: { rect: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, aspect: "free" },
  Workspace,
};
