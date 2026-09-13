"use client";

import { useId, type ReactNode } from "react";

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children(id)}
      {hint && <span className="text-xs text-ink-2">{hint}</span>}
    </div>
  );
}

export const inputCls = "h-11 w-full rounded-lg border border-line-2 bg-surface px-3 text-base text-ink placeholder:text-ink-3 focus:border-lapis";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function RadioGroup<T extends string>({ name, value, onChange, options }: { name: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[] }) {
  return (
    <div role="radiogroup" className="flex flex-col gap-2">
      {options.map((o) => (
        <label key={o.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${value === o.value ? "border-lapis bg-lapis-soft" : "border-line bg-surface"}`}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1 accent-lapis" />
          <span className="flex flex-col">
            <span className="text-sm font-medium">{o.label}</span>
            {o.hint && <span className="text-xs text-ink-2">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-lapis" />
      {label}
    </label>
  );
}
