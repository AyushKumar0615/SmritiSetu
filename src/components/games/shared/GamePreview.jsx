import React from 'react';
import { Music2 } from 'lucide-react';

// Purely decorative, static preview of a game's mechanic for the Game
// Library card/featured panel/intro screen — never used by real gameplay.

function PianoPreview() {
  const keys = [
    { color: 'var(--ember)', bg: 'var(--ember-soft)' },
    { color: 'var(--jade)', bg: 'var(--jade-soft)' },
    { color: 'var(--sky)', bg: 'var(--sky-soft)' },
    { color: 'var(--violet)', bg: 'var(--violet-soft)' }
  ];
  return (
    <div className="game-preview">
      {keys.map((k, idx) => (
        <span key={idx} className="gp-chip" style={{ borderColor: k.color, background: k.bg }}>
          <Music2 className="w-3.5 h-3.5" style={{ color: k.color }} />
        </span>
      ))}
    </div>
  );
}

function MemoryMatchPreview() {
  return (
    <div className="gp-grid" aria-hidden="true">
      <span className="gp-chip is-target">🍎</span>
      <span className="gp-chip">❓</span>
      <span className="gp-chip">❓</span>
      <span className="gp-chip">❓</span>
      <span className="gp-chip is-target">🍎</span>
      <span className="gp-chip">❓</span>
    </div>
  );
}

const PREVIEWS = {
  piano: PianoPreview,
  memory_match: MemoryMatchPreview
};

export default function GamePreview({ gameId, size = 'sm' }) {
  const Preview = PREVIEWS[gameId];
  if (!Preview) return null;
  return (
    <div className={`game-preview-stage ${size === 'lg' ? 'game-preview-lg' : ''}`}>
      <Preview />
    </div>
  );
}
