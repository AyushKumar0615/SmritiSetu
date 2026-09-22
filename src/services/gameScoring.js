// Shared scoring engine used by every cognitive exercise so results stay
// comparable across games (accuracy, speed, difficulty and streaks all feed
// the same formula rather than each game inventing its own).

export function computeRoundScore({ correct, difficultyLevel = 1, timeTakenSec = 0, timeLimitSec = 0, streak = 0 }) {
  if (!correct) return 0;
  const base = 100;
  const difficultyBonus = difficultyLevel * 15;
  const speedRatio = timeLimitSec > 0 ? Math.max(0, (timeLimitSec - timeTakenSec) / timeLimitSec) : 0;
  const speedBonus = Math.round(speedRatio * 40);
  const streakBonus = Math.min(streak, 5) * 10;
  return base + difficultyBonus + speedBonus + streakBonus;
}

export function computeAccuracy(correctCount, totalCount) {
  return totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);
}

export function nextDifficultyLevel(currentLevel, accuracy, maxLevel = 5) {
  if (accuracy >= 85 && currentLevel < maxLevel) return currentLevel + 1;
  if (accuracy < 50 && currentLevel > 1) return currentLevel - 1;
  return currentLevel;
}

// Progressive difficulty ladder shared by every game (moved here from the
// old culturalContent.js, which was game-specific and has been removed).
export const DIFFICULTY_LEVELS = [
  { level: 1, labelKey: 'difficultyLevelFamiliar' },
  { level: 2, labelKey: 'difficultyLevelFocus' },
  { level: 3, labelKey: 'difficultyLevelChallenge' },
  { level: 4, labelKey: 'difficultyLevelAdvanced' },
  { level: 5, labelKey: 'difficultyLevelExpert' }
];

// Returns a translation KEY (not display text) — callers must wrap with t().
export function difficultyLabelKey(level) {
  return DIFFICULTY_LEVELS.find((d) => d.level === level)?.labelKey || 'difficultyLevelFamiliar';
}
