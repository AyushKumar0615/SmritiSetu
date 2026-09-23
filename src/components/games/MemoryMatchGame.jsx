import React, { useEffect, useState } from 'react';
import { computeRoundScore, computeAccuracy, nextDifficultyLevel, difficultyLabelKey } from '../../services/gameScoring';
import GameHeader from './shared/GameHeader';
import FeedbackState from './shared/FeedbackState';
import { useTranslation } from '../../hooks/useTranslation';

const TOTAL_ROUNDS = 3;
const MAX_LEVEL = 3;

// Familiar, recognizable pictures rather than abstract symbols/letters.
const ICONS = ['🍎', '🐶', '🌸', '🚗', '⭐', '🌙'];

// Difficulty 1-3 (Easy/Medium/Hard from the game spec), matching the
// game_sessions.difficulty_level CHECK constraint's 1-5 range and the same
// nextDifficultyLevel() ladder PianoSequenceGame uses, just capped at 3
// tiers since that's all this game defines.
const LEVEL_CONFIG = {
  1: { pairs: 3, cols: 3, timeLimitSec: 8 }, // Easy — 2x3 grid
  2: { pairs: 4, cols: 4, timeLimitSec: 9 }, // Medium — 4x2 grid
  3: { pairs: 6, cols: 4, timeLimitSec: 10 } // Hard — 4x3 grid
};

const MISMATCH_PAUSE_MS = 900;
const FEEDBACK_CLEAR_MS = 900;
const ROUND_COMPLETE_PAUSE_MS = 600;

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildBoard(pairs) {
  const icons = ICONS.slice(0, pairs);
  const deck = icons.flatMap((icon, pairId) => [
    { id: `${pairId}-a`, pairId, icon },
    { id: `${pairId}-b`, pairId, icon }
  ]);
  return shuffle(deck);
}

export default function MemoryMatchGame({ onFinishGame, onBack }) {
  const { t } = useTranslation();
  const [level, setLevel] = useState(1);
  const [round, setRound] = useState(1);
  const [cards, setCards] = useState([]);
  const [revealedIds, setRevealedIds] = useState([]);
  const [matchedIds, setMatchedIds] = useState([]);
  const [mismatchPending, setMismatchPending] = useState(false);
  const [inputLocked, setInputLocked] = useState(false);
  const [attemptStartedAt, setAttemptStartedAt] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [accuracySum, setAccuracySum] = useState(0);
  const [totalAttemptsOverall, setTotalAttemptsOverall] = useState(0);
  const [roundTotalAttempts, setRoundTotalAttempts] = useState(0);
  const [roundCorrectAttempts, setRoundCorrectAttempts] = useState(0);

  const config = LEVEL_CONFIG[level];

  // Deals a fresh board at the start of every round (new level, new shuffle).
  useEffect(() => {
    setCards(buildBoard(config.pairs));
    setRevealedIds([]);
    setMatchedIds([]);
    setMismatchPending(false);
    setInputLocked(false);
    setAttemptStartedAt(null);
    setFeedback(null);
    setRoundTotalAttempts(0);
    setRoundCorrectAttempts(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, level]);

  const finalizeRound = ({ roundAttempts, roundCorrect, finalScore, finalBestStreak, finalTotalAttemptsOverall }) => {
    const roundAccuracy = computeAccuracy(roundCorrect, roundAttempts);
    const newAccuracySum = accuracySum + roundAccuracy;
    setAccuracySum(newAccuracySum);

    if (round >= TOTAL_ROUNDS) {
      const finalAccuracy = Math.round(newAccuracySum / TOTAL_ROUNDS);
      onFinishGame({
        gameNameKey: 'gameMemoryMatchTitle', domain: 'Memory', skillKey: 'gameMemoryMatchSkill',
        score: finalScore, accuracy: finalAccuracy, bestStreak: finalBestStreak, difficultyLevel: level,
        extraStats: [{ labelKey: 'totalAttemptsLabel', value: finalTotalAttemptsOverall }]
      });
      return;
    }
    setLevel(nextDifficultyLevel(level, roundAccuracy, MAX_LEVEL));
    setRound((r) => r + 1);
  };

  const handleCardTap = (cardId) => {
    if (inputLocked || matchedIds.includes(cardId) || revealedIds.includes(cardId)) return;

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

    const newRoundTotalAttempts = roundTotalAttempts + 1;
    const newTotalAttemptsOverall = totalAttemptsOverall + 1;
    setRoundTotalAttempts(newRoundTotalAttempts);
    setTotalAttemptsOverall(newTotalAttemptsOverall);

    if (isMatch) {
      const newStreak = streak + 1;
      const newBestStreak = Math.max(bestStreak, newStreak);
      const roundScore = computeRoundScore({ correct: true, difficultyLevel: level, timeTakenSec, timeLimitSec: config.timeLimitSec, streak: newStreak });
      const newScore = score + roundScore;
      const newRoundCorrectAttempts = roundCorrectAttempts + 1;
      const newMatchedIds = [...matchedIds, firstId, cardId];

      setScore(newScore);
      setStreak(newStreak);
      setBestStreak(newBestStreak);
      setRoundCorrectAttempts(newRoundCorrectAttempts);
      setMatchedIds(newMatchedIds);
      setRevealedIds([]);
      setFeedback('correct');
      window.setTimeout(() => setFeedback(null), FEEDBACK_CLEAR_MS);

      if (newMatchedIds.length === cards.length) {
        setInputLocked(true);
        window.setTimeout(() => finalizeRound({
          roundAttempts: newRoundTotalAttempts,
          roundCorrect: newRoundCorrectAttempts,
          finalScore: newScore,
          finalBestStreak: newBestStreak,
          finalTotalAttemptsOverall: newTotalAttemptsOverall
        }), ROUND_COMPLETE_PAUSE_MS);
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
    }, MISMATCH_PAUSE_MS);
  };

  const pairsFound = matchedIds.length / 2;

  return (
    <div className="page max-w-2xl">
      <GameHeader
        title={t('gameMemoryMatchTitle')}
        level={level}
        totalLevels={MAX_LEVEL}
        progress={`${t('roundLabel')} ${round}/${TOTAL_ROUNDS}`}
        score={score}
        onExit={onBack}
      />

      <div className="text-center mb-6">
        <span className="eyebrow justify-center">{t('pairsFoundLabel')} {pairsFound}/{config.pairs}</span>
        <p className="text-base sm:text-lg font-medium mt-2 text-ink">{t('memoryMatchHint')}</p>
      </div>

      <div
        className="grid gap-3 mx-auto max-w-xl"
        style={{ gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))` }}
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
              <span className="memory-card-icon">{isFaceUp ? card.icon : '❓'}</span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-center mt-6 min-h-[2.5rem]">
        <FeedbackState state={feedback} correctText={t('matchFoundFeedback')} incorrectText={t('noMatchFeedback')} />
      </div>

      <p className="text-center text-xs font-semibold mt-8 text-ink-faint">{t(difficultyLabelKey(level))} · {t('levelLabel')} {level}</p>
    </div>
  );
}
