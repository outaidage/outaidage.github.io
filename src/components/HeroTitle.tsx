// HeroTitle.tsx — hero headline with a word/character stagger entrance.
// Uses `motion` (MIT). The animation only changes opacity/transform, so the
// headline text is in the HTML on first paint (no LCP cost). Respects the
// site motion toggle: when motion is reduced, renders the text statically.
// Segments keep the original emphasis: "值得留下" is highlighted in brand green.
import { motion, useReducedMotion } from "motion/react";

interface Segment {
  text: string;
  em?: boolean;
}

const LINES: Segment[][] = [
  [{ text: "探索互联网，" }],
  [{ text: "记录" }, { text: "值得留下", em: true }, { text: "的东西。" }],
];

export default function HeroTitle() {
  const reduceMotion = useReducedMotion();
  let i = 0;
  return (
    <h1>
      {LINES.map((line, li) => (
        <span key={li} style={{ display: "block" }}>
          {line.map((seg) =>
            seg.text.split("").map((ch) => {
              const idx = i++;
              const inner = seg.em ? <em>{ch}</em> : ch;
              if (reduceMotion) {
                return (
                  <span key={idx} style={{ display: "inline-block" }}>
                    {inner}
                  </span>
                );
              }
              return (
                <motion.span
                  key={idx}
                  style={{ display: "inline-block" }}
                  initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.45, delay: 0.05 + idx * 0.035, ease: "easeOut" }}
                >
                  {inner}
                </motion.span>
              );
            })
          )}
        </span>
      ))}
    </h1>
  );
}
