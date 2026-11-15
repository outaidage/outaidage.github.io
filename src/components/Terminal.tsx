// Terminal.tsx — a small terminal line under the hero.
// Types a real command, then prints real site info (the homepage copy only).
// Nothing here is faked: no hacker operations, no system logs, no fake data.
// Uses `motion` (MIT) for the fade-in of the output line. Respects
// prefers-reduced-motion via useReducedMotion (prints instantly).
// Command/output come from the Hero content (admin-editable); defaults are
// the original copy.
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const DEFAULT_COMMAND = "outai --about";
const DEFAULT_OUTPUT = "个人数字空间 — 记录技术、AI、互联网与工具，收藏有价值的链接。";

export default function Terminal({ command = DEFAULT_COMMAND, output = DEFAULT_OUTPUT }: { command?: string; output?: string }) {
  const reduceMotion = useReducedMotion();
  const [typed, setTyped] = useState(reduceMotion ? command.length : 0);
  const [done, setDone] = useState(reduceMotion);

  useEffect(() => {
    if (reduceMotion) return;
    if (typed >= command.length) {
      const t = setTimeout(() => setDone(true), 260);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTyped((v) => v + 1), 55 + Math.random() * 60);
    return () => clearTimeout(t);
  }, [typed, reduceMotion, command.length]);

  return (
    <div className="hero-terminal" aria-label="关于本站">
      <span className="hero-terminal-prompt">$</span>
      <span className="hero-terminal-cmd">{command.slice(0, typed)}</span>
      {!done && <span className="hero-terminal-cursor" aria-hidden="true" />}
      {done && (
        <motion.span
          className="hero-terminal-out"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {output}
        </motion.span>
      )}
    </div>
  );
}
