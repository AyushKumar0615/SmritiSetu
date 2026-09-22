// Real, current list of shipped elder-facing games — the admin dashboard's
// "Games Available" count reads GAME_CATALOG.length rather than a hard-coded
// number, so it can never silently drift out of sync with what's actually
// playable.
//
// Kept as its own small manifest instead of importing GameShell's GAME_DEFS
// directly: that array also carries the actual game component references,
// and pulling those into the admin bundle just to read a count would be
// unnecessary coupling. If a game is added or removed in GameShell.jsx,
// update this list too.
export const GAME_CATALOG = [
  { id: 'piano', titleKey: 'gamePianoTitle' }
];
