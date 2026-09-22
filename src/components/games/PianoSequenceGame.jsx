import React, { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { PianoAudioService } from '../../services/pianoAudioService';
import { computeRoundScore, nextDifficultyLevel, difficultyLabelKey } from '../../services/gameScoring';
import GameHeader from './shared/GameHeader';
import FeedbackState from './shared/FeedbackState';
import { useTranslation } from '../../hooks/useTranslation';

const TOTAL_ROUNDS = 8;

// One octave of white keys, fixed order/position — always rendered the same
// way so an elder's sense of "where each note is" never has to be relearned
// between rounds. Only how many are enabled changes with difficulty.
const WHITE_NOTES = [
  { id: 'C', freq: 261.63 },
  { id: 'D', freq: 293.66 },
  { id: 'E', freq: 329.63 },
  { id: 'F', freq: 349.23 },
  { id: 'G', freq: 392.0 },
  { id: 'A', freq: 440.0 },
  { id: 'B', freq: 493.88 },
  { id: 'C5', freq: 523.25 }
];
const WHITE_COUNT = WHITE_NOTES.length;
// Decorative only — never part of a sequence or tappable — drawn purely so
// the keyboard reads as a real piano. Positioned after these 0-based white
// key indices (no black key between E-F or B-C, exactly like a real piano).
const BLACK_KEY_AFTER = [0, 1, 3, 4, 5];

// Difficulty 1-5 (matches the game_sessions.difficulty_level CHECK
// constraint and the app-wide difficulty ladder). Each step up asks for one
// more note and a slightly faster playback, and the playable range only
// widens twice (level 2, then level 5) — small, bounded increments;
// nextDifficultyLevel() below only ever moves one level per round, so a
// single mistake never causes a big drop.
const LEVEL_CONFIG = {
  1: { sequenceLength: 2, whiteKeys: 3, noteMs: 750, gapMs: 380 },
  2: { sequenceLength: 3, whiteKeys: 5, noteMs: 680, gapMs: 340 },
  3: { sequenceLength: 4, whiteKeys: 7, noteMs: 620, gapMs: 300 },
  4: { sequenceLength: 5, whiteKeys: 7, noteMs: 560, gapMs: 260 },
  5: { sequenceLength: 6, whiteKeys: 8, noteMs: 500, gapMs: 220 }
};

// This is a test of learned sequence memory, not of musical knowledge or of
// getting it right under pressure — a wrong tap re-teaches the sequence
// (sound + which key lit up) and lets the elder try again, rather than
// ending the round. Only giving up after repeatedly struggling — not a
// single slip — is allowed to count against difficulty.
const MAX_ATTEMPTS_PER_ROUND = 3;

const INPUT_DEBOUNCE_MS = 160;
const FEEDBACK_PAUSE_MS = 1300;

function pickSequence(length, whiteKeys) {
  return Array.from({ length }, () => Math.floor(Math.random() * whiteKeys));
}

// How much credit a round earns for nextDifficultyLevel()/the accuracy stat:
// a clean first try is a full "consistent success" (pushes difficulty up);
// an eventual success after watching again is progress but not a clean
// pass (holds difficulty steady); running out of attempts is the only case
// that counts as "repeated struggle" and can step difficulty down.
function roundAccuracyFor(succeeded, failedAttempts) {
  if (!succeeded) return 0;
  if (failedAttempts === 0) return 100;
  return failedAttempts === 1 ? 70 : 55;
}

export default function PianoSequenceGame({ onFinishGame, onBack }) {
  const { t } = useTranslation();
  const [level, setLevel] = useState(1);
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState('demo'); // demo | recall | feedback
  const [sequence, setSequence] = useState([]);
  const [userIndex, setUserIndex] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0); // wrong attempts so far THIS round
  const [demoActiveKey, setDemoActiveKey] = useState(null); // white-key index lit up right now, or null
  const [inputStartedAt, setInputStartedAt] = useState(null);
  const [isPlayingDemo, setIsPlayingDemo] = useState(true);
  const [inputLocked, setInputLocked] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [feedbackKind, setFeedbackKind] = useState('retry'); // retry | struggle — which incorrect copy to show

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [accuracySum, setAccuracySum] = useState(0);
  const [maxSequenceLength, setMaxSequenceLength] = useState(0);
  // Tracked per the exercise's own bookkeeping even though only the 5
  // headline stats are shown on the results screen — see the GAME_1 spec's
  // TRACK list. totalAttempts counts every completed pass through the
  // sequence (right or wrong), across every round and every retry.
  const [correctRounds, setCorrectRounds] = useState(0);
  const [incorrectRounds, setIncorrectRounds] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);

  const config = LEVEL_CONFIG[level];

  // Plays the demo — sound and matching key-press together, in order — for
  // the given sequence. Used both to start a round and to replay it (after
  // a wrong attempt, or on request). Returns nothing; callers await the
  // returned promise directly.
  const runDemo = (seq, roundConfig) => {
    setIsPlayingDemo(true);
    setPhase('demo');
    setDemoActiveKey(null);
    PianoAudioService.unlock();
    let clearTimer = null;
    const playback = PianoAudioService.playSequence(
      seq.map((i) => WHITE_NOTES[i].freq),
      {
        noteDurationMs: roundConfig.noteMs,
        gapMs: roundConfig.gapMs,
        onNoteStart: (i) => {
          setDemoActiveKey(seq[i]);
          if (clearTimer) window.clearTimeout(clearTimer);
          clearTimer = window.setTimeout(() => setDemoActiveKey(null), roundConfig.noteMs);
        }
      }
    );
    return playback;
  };

  // Starts a fresh round: new sequence, then the demo plays automatically.
  // Guarded with a cancellation flag so React StrictMode's dev-only double
  // invoke (mount -> cleanup -> mount) can never play the sequence twice,
  // and so leaving the game mid-playback never keeps making sound after unmount.
  useEffect(() => {
    let cancelled = false;
    const roundConfig = LEVEL_CONFIG[level];
    const seq = pickSequence(roundConfig.sequenceLength, roundConfig.whiteKeys);
    setSequence(seq);
    setUserIndex(0);
    setFailedAttempts(0);
    setFeedback(null);
    setInputStartedAt(Date.now());

    let cancelPlayback = () => {};
    const startTimer = window.setTimeout(() => {
      if (cancelled) return;
      const playback = runDemo(seq, roundConfig);
      cancelPlayback = playback.cancel;
      playback.promise.then(() => {
        if (cancelled) return;
        setDemoActiveKey(null);
        setIsPlayingDemo(false);
        setPhase('recall');
      });
    }, 450);

    return () => { cancelled = true; window.clearTimeout(startTimer); cancelPlayback(); };
  }, [round, level]);

  // Replays the same demo on request — during recall, or after a wrong
  // attempt. Never penalized: it doesn't touch score, streak or attempts.
  const replayDemo = () => {
    if (isPlayingDemo) return;
    setUserIndex(0);
    const playback = runDemo(sequence, config);
    playback.promise.then(() => {
      setDemoActiveKey(null);
      setIsPlayingDemo(false);
      setPhase('recall');
    });
  };

  // Called once the feedback pause has already elapsed (callers below wait
  // FEEDBACK_PAUSE_MS before invoking this) — so this runs immediately,
  // with no further delay of its own.
  const finalizeRound = (succeeded, failedCount) => {
    const roundAccuracy = roundAccuracyFor(succeeded, failedCount);
    const timeTaken = Math.round((Date.now() - (inputStartedAt || Date.now())) / 1000);
    const timeLimitSec = Math.max(1, ((config.noteMs + config.gapMs) * config.sequenceLength) / 1000) * 3 * MAX_ATTEMPTS_PER_ROUND;
    const nextStreak = succeeded ? streak + 1 : 0;
    const roundScore = computeRoundScore({ correct: succeeded, difficultyLevel: level, timeTakenSec: timeTaken, timeLimitSec, streak: nextStreak });

    const newScore = score + roundScore;
    const newBestStreak = Math.max(bestStreak, nextStreak);
    const newAccuracySum = accuracySum + roundAccuracy;
    const newMaxSequenceLength = Math.max(maxSequenceLength, sequence.length);
    const newCorrectRounds = correctRounds + (succeeded ? 1 : 0);
    const newIncorrectRounds = incorrectRounds + (succeeded ? 0 : 1);

    setScore(newScore);
    setStreak(nextStreak);
    setBestStreak(newBestStreak);
    setAccuracySum(newAccuracySum);
    setMaxSequenceLength(newMaxSequenceLength);
    setCorrectRounds(newCorrectRounds);
    setIncorrectRounds(newIncorrectRounds);
    setFeedback(null);

    if (round >= TOTAL_ROUNDS) {
      const finalAccuracy = Math.round(newAccuracySum / TOTAL_ROUNDS);
      onFinishGame({
        gameNameKey: 'gamePianoTitle', domain: 'Memory', skillKey: 'gamePianoSkill',
        score: newScore, accuracy: finalAccuracy, bestStreak: newBestStreak, difficultyLevel: level,
        extraStats: [{ labelKey: 'maxSequenceLabel', value: newMaxSequenceLength }],
        attempts: totalAttempts + 1, correctRounds: newCorrectRounds, incorrectRounds: newIncorrectRounds
      });
      return;
    }
    setLevel(nextDifficultyLevel(level, roundAccuracy));
    setRound((r) => r + 1);
  };

  const handleKeyTap = (keyIndex) => {
    if (phase !== 'recall' || inputLocked) return;
    setInputLocked(true);
    window.setTimeout(() => setInputLocked(false), INPUT_DEBOUNCE_MS);
    PianoAudioService.playNote(WHITE_NOTES[keyIndex].freq, 260);

    if (keyIndex !== sequence[userIndex]) {
      setTotalAttempts((a) => a + 1);
      const newFailedAttempts = failedAttempts + 1;
      setFailedAttempts(newFailedAttempts);
      setPhase('feedback');

      if (newFailedAttempts >= MAX_ATTEMPTS_PER_ROUND) {
        setFeedbackKind('struggle');
        setFeedback('incorrect');
        window.setTimeout(() => finalizeRound(false, newFailedAttempts), FEEDBACK_PAUSE_MS);
      } else {
        setFeedbackKind('retry');
        setFeedback('incorrect');
        window.setTimeout(() => {
          setFeedback(null);
          const playback = runDemo(sequence, config);
          playback.promise.then(() => {
            setDemoActiveKey(null);
            setIsPlayingDemo(false);
            setPhase('recall');
          });
        }, FEEDBACK_PAUSE_MS);
      }
      return;
    }

    const nextIndex = userIndex + 1;
    setUserIndex(nextIndex);
    if (nextIndex >= sequence.length) {
      setTotalAttempts((a) => a + 1);
      setPhase('feedback');
      setFeedback('correct');
      const failedCount = failedAttempts;
      window.setTimeout(() => finalizeRound(true, failedCount), FEEDBACK_PAUSE_MS);
    }
  };

  const isDemoPhase = phase === 'demo' || isPlayingDemo;

  return (
    <div className="page max-w-2xl">
      <GameHeader
        title={t('gamePianoTitle')}
        level={level}
        progress={`${t('roundLabel')} ${round}/${TOTAL_ROUNDS}`}
        score={score}
        onExit={onBack}
      />

      <div className="text-center mb-6 min-h-[5.5rem]">
        {isDemoPhase ? (
          <>
            <span className="eyebrow eyebrow-jade justify-center inline-flex items-center gap-2">
              <Volume2 className="w-4 h-4 piano-listening-icon" aria-hidden="true" /> {t('pianoListenLabel')}
            </span>
            <p className="text-base sm:text-lg font-medium mt-2 text-ink">{t('pianoListeningHint')}</p>
            <p className="text-sm mt-1 text-ink-faint">{t('pianoDemoWatchHint')}</p>
          </>
        ) : phase === 'feedback' ? (
          // The FeedbackState banner below is the sole message here — no
          // "Now repeat the sequence" hint competing with it right above.
          <span className="eyebrow justify-center">{t('pianoYourTurnLabel')}</span>
        ) : (
          <>
            <span className="eyebrow justify-center">{t('pianoYourTurnLabel')}</span>
            <p className="text-base sm:text-lg font-medium mt-2 text-ink">{t('pianoYourTurnMainHint')}</p>
            <p className="text-sm mt-1 text-ink-faint">{t('pianoYourTurnHint')}</p>
          </>
        )}
      </div>

      <div className="flex justify-center gap-2.5 mb-6" aria-hidden="true">
        {sequence.map((_, idx) => (
          <span key={idx} className={`piano-progress-dot ${idx < userIndex ? 'is-filled' : ''}`} />
        ))}
      </div>

      <div className="piano-keyboard" role="group" aria-label={t('gamePianoTitle')}>
        <div className="piano-white-row">
          {WHITE_NOTES.map((note, idx) => {
            const isActive = idx < config.whiteKeys;
            const disabled = phase !== 'recall' || inputLocked || !isActive;
            const isDemoLit = isDemoPhase && demoActiveKey === idx;
            return (
              <button
                key={note.id}
                type="button"
                disabled={disabled}
                onClick={() => handleKeyTap(idx)}
                className={`piano-white-key ${!isActive ? 'is-inactive' : ''} ${isDemoLit ? 'is-demo-active' : ''}`}
                aria-label={note.id}
              >
                <span className="piano-key-label">{note.id}</span>
              </button>
            );
          })}
        </div>
        <div className="piano-black-row">
          {BLACK_KEY_AFTER.map((afterIdx) => (
            <span
              key={afterIdx}
              className="piano-black-key"
              style={{ left: `${((afterIdx + 1) / WHITE_COUNT) * 100}%`, width: `${(0.62 / WHITE_COUNT) * 100}%` }}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-center mt-6 min-h-[2.5rem]">
        <FeedbackState
          state={feedback}
          correctText={t('sequenceCorrectFeedback')}
          incorrectText={t(feedbackKind === 'struggle' ? 'notQuiteFeedback' : 'pianoRetryFeedback')}
        />
      </div>

      {phase === 'recall' && (
        <div className="flex justify-center mt-2">
          <button type="button" onClick={replayDemo} disabled={isPlayingDemo} className="btn btn-line">
            <Volume2 className="w-4 h-4" /> {t('pianoReplayLabel')}
          </button>
        </div>
      )}

      <p className="text-center text-xs font-semibold mt-8 text-ink-faint">{t(difficultyLabelKey(level))} · {t('levelLabel')} {level}</p>
    </div>
  );
}
