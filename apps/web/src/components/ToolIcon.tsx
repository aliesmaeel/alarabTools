import type { ToolGroup } from "@alarab/tools";

const TONE: Record<ToolGroup, string> = {
  organize: "bg-lapis-soft text-lapis",
  optimize: "bg-lapis-soft text-lapis",
  "to-pdf": "bg-lapis-soft text-lapis",
  "from-pdf": "bg-lapis-soft text-lapis",
  edit: "bg-lapis-soft text-lapis",
  image: "bg-teal-soft text-teal",
  ai: "bg-plum-soft text-plum",
  arabic: "bg-saffron-soft text-saffron",
  media: "bg-plum-soft text-plum",
  web: "bg-teal-soft text-teal",
};

function Glyph({ group }: { group: ToolGroup }) {
  switch (group) {
    case "organize":
      return (<><rect x="8" y="3" width="12" height="15" rx="2" /><path d="M5 7v11a3 3 0 0 0 3 3h8" /></>);
    case "optimize":
      return <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />;
    case "to-pdf":
      return (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 11v6M9 14l3 3 3-3" /></>);
    case "from-pdf":
      return (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 17v-6M9 14l3-3 3 3" /></>);
    case "edit":
      return (<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>);
    case "image":
      return (<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>);
    case "ai":
      return (<><path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z" /><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>);
    case "media":
      return (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></>);
    case "web":
      return (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>);
    case "arabic":
      return null;
  }
}

export function ToolIcon({ group, size = 40 }: { group: ToolGroup; size?: number }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-[10px] ${TONE[group]}`}
      style={{ width: size, height: size }}
    >
      {group === "arabic" ? (
        <span lang="ar" className="font-display font-bold leading-none" style={{ fontSize: size * 0.55 }}>ع</span>
      ) : (
        <svg viewBox="0 0 24 24" width={size / 2} height={size / 2} className="fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round">
          <Glyph group={group} />
        </svg>
      )}
    </span>
  );
}
