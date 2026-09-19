import React from 'react';
import { motion } from 'framer-motion';

const BARS = [0, 1, 2, 3, 4];

// The one shared "audio is playing" signature used anywhere voice
// narration happens — the orb, the memory-journal CTA.
export default function Waveform({ active = true, color = '#1a0f08', barWidth = 3, height = 24 }) {
  return (
    <div className="flex items-center justify-center gap-[3px]" style={{ height }}>
      {BARS.map((i) => (
        <motion.span
          key={i}
          className="rounded-full"
          style={{ background: color, width: barWidth }}
          animate={active ? { height: [6, 20, 10, 24, 6] } : { height: 6 }}
          transition={active ? { duration: 0.9, repeat: Infinity, delay: i * 0.09, ease: 'easeInOut' } : { duration: 0.2 }}
        />
      ))}
    </div>
  );
}
