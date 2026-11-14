// Terminal.tsx — a small terminal line under the hero.
// Types a real command, then prints real site info (the homepage copy only).
// Nothing here is faked: no hacker operations, no system logs, no fake data.
// Uses `motion` (MIT) for the fade-in of the output line. Respects
// prefers-reduced-motion via useReducedMotion (prints instantly).
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const COMMAND = "outai --about";
const OUTPUT = "个人数字空间 — 记录技术、AI、互联网与工具，收藏有价值的链接。";

export default function Terminal() {
  const reduceMotion = useReducedMotion();
  const [typed, setTyped] = useState(reduceMotion ? COMMAND.length : 0);
  const [done, setDone] = useState(reduceMotion);

  useEffect(() => {
    if (reduceMotion) return;
    if (typed >= COMMAND.length) {
      const t = setTimeout(() => setDone(true), 260);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTyped((v) => v + 1), 55 + Math.random() * 60);
    return () => clearTimeout(t);
  }, [typed, reduceMotion]);

  return (
    <div className="hero-terminal" aria-label="关于本站">
      <span className="hero-terminal-prompt">$</span>
      <span className="hero-terminal-cmd">{COMMAND.slice(0, typed)}</span>
      {!done && <span className="hero-terminal-cursor" aria-hidden="true" />}
      {done && (
        <motion.span
          className="hero-terminal-out"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {OUTPUT}
        </motion.span>
      )}
    </div>
  );
}
