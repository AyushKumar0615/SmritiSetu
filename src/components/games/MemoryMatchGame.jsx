import React, { useEffect, useState } from 'react';
import { computeRoundScore, computeAccuracy, difficultyLabelKey } from '../../services/gameScoring';
import GameHeader from './shared/GameHeader';
import FeedbackState from './shared/FeedbackState';
import { useTranslation } from '../../hooks/useTranslation';

const MAX_LEVEL = 5;
// A user is never stuck on a level: pass within this many attempts and it's
// an immediate advance; fail all of them and the game still moves on rather
// than locking the player in (see completeBoard()).
const MAX_ATTEMPTS_PER_LEVEL = 3;
const PASS_ACCURACY_THRESHOLD = 75;

// Familiar, recognizable pictures rather than abstract symbols/letters —
// enough unique ones to cover level 5's 18 pairs with no repeats on a
// single board.
const ICONS = ['🍎', '🐶', '🌸', '🚗', '⭐', '🌙', '🐱', '🎈', '🍊', '🐦', '🌳', '☀️', '🐟', '🍌', '🌈', '🐢', '🧸', '☂️'];

// Difficulty 1-5, matching the game_sessions.difficulty_level CHECK
// constraint and the same 1-5 scale/labels PianoSequenceGame uses. Each
// level adds more pairs (board grows per the spec's 3x3/4x4/5x4/6x5/6x6
// progression) and gets slightly less forgiving on timing — never enough
// to feel rushed, just enough to keep pace with the bigger board.
// Level 1 also deals one extra, permanently unmatched card (4 pairs on a
// 3x3 board) so the very first level still asks for real attention.
const LEVEL_CONFIG = {
  1: { pairs: 4, extra: true, cols: 3, timeLimitSec: 9, mismatchPauseMs: 950, iconRem: 2.5, containerRem: 24 }, // 3x3
  2: { pairs: 8, extra: false, cols: 4, timeLimitSec: 8, mismatchPauseMs: 900, iconRem: 2.3, containerRem: 30 }, // 4x4
  3: { pairs: 10, extra: false, cols: 5, timeLimitSec: 7, mismatchPauseMs: 850, iconRem: 2, containerRem: 34 }, // 5x4
  4: { pairs: 15, extra: false, cols: 6, timeLimitSec: 7, mismatchPauseMs: 800, iconRem: 1.7, containerRem: 38 }, // 6x5
  5: { pairs: 18, extra: false, cols: 6, timeLimitSec: 6, mismatchPauseMs: 750, iconRem: 1.6, containerRem: 38 } // 6x6
};

const FEEDBACK_CLEAR_MS = 800;
const BOARD_COMPLETE_PAUSE_MS = 500;
const TRANSITION_PAUSE_MS = 1400;

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// The "extra" card (when present) gets its own sentinel pairId so it can
// never match anything else on the board — it's a deliberate distractor,
// not a bug. Board completion only ever requires the real pairs.
function buildBoard(config) {
  const icons = ICONS.slice(0, config.pairs);
  const deck = icons.flatMap((icon, pairId) => [
    { id: `${pairId}-a`, pairId, icon },
    { id: `${pairId}-b`, pairId, icon }
  ]);
  if (config.extra) deck.push({ id: 'extra', pairId: 'extra-unmatched', icon: ICONS[config.pairs] });
  return shuffle(deck);
}

export default function MemoryMatchGame({ onFinishGame, onBack }) {
  const { t } = useTranslation();
  const [level, setLevel] = useState(1);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [cards, setCards] = useState([]);
  const [revealedIds, setRevealedIds] = useState([]);
  const [matchedIds, setMatchedIds] = useState([]);
  const [mismatchPending, setMismatchPending] = useState(false);
  const [inputLocked, setInputLocked] = useState(false);
  const [attemptStartedAt, setAttemptStartedAt] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [transition, setTransition] = useState(null); // { titleKey, subtitleKey } | null

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [accuracySum, setAccuracySum] = useState(0);
  const [boardsPlayed, setBoardsPlayed] = useState(0);
  const [levelsPassed, setLevelsPassed] = useState(0);
  const [totalAttemptsOverall, setTotalAttemptsOverall] = useState(0);
  const [boardTotalAttempts, setBoardTotalAttempts] = useState(0);
  const [boardCorrectAttempts, setBoardCorrectAttempts] = useState(0);

  const config = LEVEL_CONFIG[level];
  const requiredPairs = config.pairs;

  // Deals a fresh board whenever the level changes (advance) or the same
  // level is retried (attemptNumber changes).
  useEffect(() => {
    setCards(buildBoard(config));
    setRevealedIds([]);
    setMatchedIds([]);
    setMismatchPending(false);
    setInputLocked(false);
    setAttemptStartedAt(null);
    setFeedback(null);
    setBoardTotalAttempts(0);
    setBoardCorrectAttempts(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, attemptNumber]);

  const finishGame = ({ finalScore, finalBestStreak, finalTotalAttemptsOverall, finalAccuracySum, finalBoardsPlayed, finalLevelsPassed }) => {
    const finalAccuracy = Math.round(finalAccuracySum / finalBoardsPlayed);
    onFinishGame({
      gameNameKey: 'gameMemoryMatchTitle', domain: 'Memory', skillKey: 'gameMemoryMatchSkill',
      score: finalScore, accuracy: finalAccuracy, bestStreak: finalBestStreak, difficultyLevel: level,
      extraStats: [
        { labelKey: 'totalAttemptsLabel', value: finalTotalAttemptsOverall },
        { labelKey: 'levelsPassedLabel', value: finalLevelsPassed }
      ]
    });
  };

  // Called once the current board is fully solved. Decides, per the spec's
  // attempt rules: pass -> advance immediately; fail with attempts left ->
  // retry the same level; fail with attempts exhausted -> advance anyway so
  // the player is never trapped. The hardest level ends the session either
  // way once it's passed or its attempts run out.
  const completeBoard = ({ finalScore, finalBestStreak, finalTotalAttemptsOverall }) => {
    const boardAccuracy = computeAccuracy(boardCorrectAttempts, boardTotalAttempts);
    const passed = boardAccuracy >= PASS_ACCURACY_THRESHOLD;
    const finalAccuracySum = accuracySum + boardAccuracy;
    const finalBoardsPlayed = boardsPlayed + 1;
    const finalLevelsPassed = levelsPassed + (passed ? 1 : 0);
    setAccuracySum(finalAccuracySum);
    setBoardsPlayed(finalBoardsPlayed);
    setLevelsPassed(finalLevelsPassed);

    const isFinalLevel = level >= MAX_LEVEL;
    const attemptsExhausted = attemptNumber >= MAX_ATTEMPTS_PER_LEVEL;

    if (passed || (isFinalLevel && attemptsExhausted)) {
      if (isFinalLevel) {
        finishGame({ finalScore, finalBestStreak, finalTotalAttemptsOverall, finalAccuracySum, finalBoardsPlayed, finalLevelsPassed });
        return;
      }
      setTransition({ titleKey: 'levelCompleteTitle', subtitleKey: 'levelAdvancingHint' });
      window.setTimeout(() => { setTransition(null); setLevel((l) => l + 1); setAttemptNumber(1); }, TRANSITION_PAUSE_MS);
      return;
    }

    if (attemptsExhausted) {
      setTransition({ titleKey: 'levelMovingOnTitle', subtitleKey: 'levelAdvancingHint' });
      window.setTimeout(() => { setTransition(null); setLevel((l) => Math.min(l + 1, MAX_LEVEL)); setAttemptNumber(1); }, TRANSITION_PAUSE_MS);
      return;
    }

    setTransition({ titleKey: 'levelRetryTitle', subtitleKey: 'levelRetryHint' });
    window.setTimeout(() => { setTransition(null); setAttemptNumber((a) => a + 1); }, TRANSITION_PAUSE_MS);
  };

  const handleCardTap = (cardId) => {
    if (inputLocked || transition || matchedIds.includes(cardId) || revealedIds.includes(cardId)) return;

    if (revealedIds.length === 0) {
      setAttemptStartedAt(Date.now());
      setRevealedIds([cardId]);
      return;
    }

    const firstId = revealedIds[0];
    const firstCard = cards.find((c) => c.id === firstId);
    const secondCard = cards.find((c) => c.id === cardId);
    const isMatch = firstCard.pairId === secondCard.pairId;
    const timeTakenSec = Math.max(0, Math.round((Date.now() - (attemptStartedAt || Date.now())) / 1000));

    setRevealedIds([firstId, cardId]);

    const newBoardTotalAttempts = boardTotalAttempts + 1;
    const newTotalAttemptsOverall = totalAttemptsOverall + 1;
    setBoardTotalAttempts(newBoardTotalAttempts);
    setTotalAttemptsOverall(newTotalAttemptsOverall);

    if (isMatch) {
      const newStreak = streak + 1;
      const newBestStreak = Math.max(bestStreak, newStreak);
      const matchScore = computeRoundScore({ correct: true, difficultyLevel: level, timeTakenSec, timeLimitSec: config.timeLimitSec, streak: newStreak });
      const newScore = score + matchScore;
      const newBoardCorrectAttempts = boardCorrectAttempts + 1;
      const newMatchedIds = [...matchedIds, firstId, cardId];

      setScore(newScore);
      setStreak(newStreak);
      setBestStreak(newBestStreak);
      setBoardCorrectAttempts(newBoardCorrectAttempts);
      setMatchedIds(newMatchedIds);
      setRevealedIds([]);
      setFeedback('correct');
      window.setTimeout(() => setFeedback(null), FEEDBACK_CLEAR_MS);

      if (newMatchedIds.length === requiredPairs * 2) {
        setInputLocked(true);
        window.setTimeout(() => completeBoard({
          finalScore: newScore,
          finalBestStreak: newBestStreak,
          finalTotalAttemptsOverall: newTotalAttemptsOverall
        }), BOARD_COMPLETE_PAUSE_MS);
      }
      return;
    }

    setStreak(0);
    setMismatchPending(true);
    setInputLocked(true);
    setFeedback('incorrect');
    window.setTimeout(() => {
      setRevealedIds([]);
      setMismatchPending(false);
      setInputLocked(false);
      setFeedback(null);
    }, config.mismatchPauseMs);
  };

  const pairsFound = matchedIds.length / 2;

  return (
    <div className="page max-w-2xl">
      <GameHeader
        title={t('gameMemoryMatchTitle')}
        level={level}
        totalLevels={MAX_LEVEL}
        progress={`${t('attemptLabel')} ${attemptNumber}/${MAX_ATTEMPTS_PER_LEVEL}`}
        score={score}
        onExit={onBack}
      />

      {transition ? (
        <div className="panel-light p-8 sm:p-10 text-center space-y-2 max-w-lg mx-auto">
          <h3 className="font-display text-2xl sm:text-3xl font-medium text-paper-ink">{t(transition.titleKey)}</h3>
          <p className="text-sm text-ink-soft">{t(transition.subtitleKey)}</p>
        </div>
      ) : (
        <>
          <div className="text-center mb-6">
            <span className="eyebrow justify-center">{t('pairsFoundLabel')} {pairsFound}/{requiredPairs}</span>
            <p className="text-base sm:text-lg font-medium mt-2 text-ink">{t('memoryMatchHint')}</p>
          </div>

          <div className="flex justify-center gap-2.5 mb-6" aria-hidden="true">
            {Array.from({ length: MAX_ATTEMPTS_PER_LEVEL }, (_, idx) => (
              <span key={idx} className={`piano-progress-dot ${idx < attemptNumber ? 'is-filled' : ''}`} />
            ))}
          </div>

          <div
            className="grid gap-3 mx-auto"
            style={{ gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`, maxWidth: `${config.containerRem}rem` }}
            role="group"
            aria-label={t('gameMemoryMatchTitle')}
          >
            {cards.map((card) => {
              const isMatched = matchedIds.includes(card.id);
              const isRevealed = revealedIds.includes(card.id);
              const isFaceUp = isMatched || isRevealed;
              let stateClass = '';
              if (isMatched) stateClass = 'is-correct';
              else if (isRevealed && mismatchPending) stateClass = 'is-incorrect';
              else if (isRevealed) stateClass = 'is-selected';

              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={inputLocked || isFaceUp}
                  onClick={() => handleCardTap(card.id)}
                  className={`cog-slot is-selectable memory-card ${stateClass}`}
                  aria-label={isFaceUp ? undefined : t('memoryCardHiddenLabel')}
                >
                  <span className="memory-card-icon" style={{ fontSize: `${config.iconRem}rem` }}>{isFaceUp ? card.icon : '❓'}</span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-center mt-6 min-h-[2.5rem]">
            <FeedbackState state={feedback} correctText={t('matchFoundFeedback')} incorrectText={t('noMatchFeedback')} />
          </div>
        </>
      )}

      <p className="text-center text-xs font-semibold mt-8 text-ink-faint">{t(difficultyLabelKey(level))} · {t('levelLabel')} {level}</p>
    </div>
  );
}
