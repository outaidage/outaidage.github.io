// CommandTerminal.tsx — OUTAI SYSTEM TERMINAL (DIGITAL UNIVERSE 2.0).
// A floating command panel opened by Ctrl/Cmd+K or the header TERMINAL button.
// Commands navigate the real site (no fake data). Uses Astro's client-side
// navigate() when available, falls back to a full navigation.
import { useCallback, useEffect, useRef, useState } from "react";

type Line = { kind: "out" | "echo" | "err"; text: string };

const BASE = (import.meta.env.BASE_URL || "/") as string;
const ROUTES: Record<string, { href: string; label: string }> = {
  home: { href: BASE, label: "首页" },
  blog: { href: `${BASE}blog/`, label: "文章" },
  bookmarks: { href: `${BASE}collection/`, label: "书签" },
  collection: { href: `${BASE}collection/`, label: "书签" },
  projects: { href: `${BASE}projects/`, label: "项目" },
  about: { href: `${BASE}about/`, label: "关于" },
  links: { href: `${BASE}links/`, label: "推荐链接" },
  guestbook: { href: `${BASE}guestbook/`, label: "留言板" },
  search: { href: `${BASE}search/`, label: "搜索" },
  admin: { href: `${BASE}admin/`, label: "管理后台" },
};

const HELP = [
  "commands:",
  "  home / blog / bookmarks / projects / about",
  "  links / guestbook / search / admin",
  "  clear — 清空终端",
  "  help — 显示本帮助",
];

export default function CommandTerminal() {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([
    { kind: "out", text: "OUTAI OS [Version 2026.11]" },
    { kind: "out", text: "Personal Digital Space initialized." },
    { kind: "out", text: "Type help to see available commands." },
  ]);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [open, lines]);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    const onToggle = () => toggle();
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("outai:toggle-terminal", onToggle);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("outai:toggle-terminal", onToggle);
      window.removeEventListener("keydown", onKey);
    };
  }, [toggle]);

  async function go(href: string) {
    try {
      const mod = await import("astro:transitions/client");
      mod.navigate(href);
    } catch {
      window.location.href = href;
    }
  }

  function run(raw: string) {
    const cmd = raw.trim().toLowerCase();
    const next: Line[] = [...lines, { kind: "echo" as const, text: `OUTAI $ ${raw.trim()}` }];
    if (!cmd) {
      setLines(next);
      return;
    }
    if (cmd === "clear") {
      setLines([]);
      return;
    }
    if (cmd === "help") {
      setLines([...next, ...HELP.map((t) => ({ kind: "out" as const, text: t }))]);
      return;
    }
    const route = ROUTES[cmd];
    if (route) {
      setLines([...next, { kind: "out", text: `→ ${route.label} ${route.href}` }]);
      setOpen(false);
      void go(route.href);
      return;
    }
    setLines([...next, { kind: "err", text: `unknown command: ${cmd} — type help` }]);
  }

  if (!open) return null;
  return (
    <div className="cmd-terminal" role="dialog" aria-label="OUTAI 终端">
      <div className="cmd-terminal-head">
        <span>OUTAI SYSTEM TERMINAL</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="关闭终端">ESC ✕</button>
      </div>
      <div className="cmd-terminal-body" ref={bodyRef}>
        {lines.map((l, i) => (
          <div key={i} className={l.kind === "echo" ? "cmd-echo" : l.kind === "err" ? "cmd-out" : "cmd-out"}>
            {l.text}
          </div>
        ))}
      </div>
      <form
        className="cmd-terminal-input"
        onSubmit={(e) => {
          e.preventDefault();
          run(value);
          setValue("");
        }}
      >
        <span>OUTAI $</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="输入命令… (help)"
          aria-label="终端命令"
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </div>
  );
}
