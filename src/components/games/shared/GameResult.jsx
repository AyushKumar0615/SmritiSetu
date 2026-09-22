import React from 'react';
import { motion } from 'framer-motion';
import { Award, RotateCcw } from 'lucide-react';
import { useTranslation } from '../../../hooks/useTranslation';
import { difficultyLabelKey } from '../../../services/gameScoring';

export default function GameResult({ gameName, skill, score, accuracy, bestStreak, difficultyLevel, extraStats = [], onPlayAgain, onBackToGames }) {
  const { t } = useTranslation();
  return (
    <div className="page max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="panel-light p-9 sm:p-12 text-center space-y-8"
      >
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4, ease: [0.34, 1.4, 0.4, 1] }}
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ background: 'rgba(79,174,142,0.15)', color: 'var(--jade-deep)' }}
        >
          <Award className="w-8 h-8" />
        </motion.div>
        <div>
          <span className="eyebrow eyebrow-jade justify-center">{t('sessionComplete')}</span>
          <h2 className="font-display text-3xl sm:text-4xl font-medium mt-2">{gameName}</h2>
          <p className="text-sm mt-1" style={{ color: 'rgba(23,20,15,0.55)' }}>{t('cognitiveSkillTrainedLabel')}: {skill}</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-lg mx-auto"
          style={{ borderTop: '1px solid var(--paper-line)', borderBottom: '1px solid var(--paper-line)', padding: '1.5rem 0' }}
        >
          <div>
            <span className="figure-label" style={{ color: 'rgba(23,20,15,0.5)' }}>{t('scoreLabel')}</span>
            <span className="figure-value text-paper-ink">{score}</span>
          </div>
          <div>
            <span className="figure-label" style={{ color: 'rgba(23,20,15,0.5)' }}>{t('accuracyLabel')}</span>
            <span className="figure-value text-jade-deep">{accuracy}%</span>
          </div>
          <div>
            <span className="figure-label" style={{ color: 'rgba(23,20,15,0.5)' }}>{t('bestStreakLabel')}</span>
            <span className="figure-value text-ember-deep">{bestStreak}</span>
          </div>
          <div>
            <span className="figure-label" style={{ color: 'rgba(23,20,15,0.5)' }}>{t('difficultyReachedLabel')}</span>
            <span className="figure-value" style={{ fontSize: '1.4rem', color: 'var(--paper-ink)' }}>{t(difficultyLabelKey(difficultyLevel))}</span>
          </div>
          {extraStats.map((stat) => (
            <div key={stat.label}>
              <span className="figure-label" style={{ color: 'rgba(23,20,15,0.5)' }}>{stat.label}</span>
              <span className="figure-value text-paper-ink">{stat.value}</span>
            </div>
          ))}
        </motion.div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
          <button type="button" onClick={onPlayAgain} className="btn btn-line btn-line-on-light">
            <RotateCcw className="w-4 h-4" /> {t('anotherGame')}
          </button>
          <button type="button" onClick={onBackToGames} className="btn btn-on-light">{t('returnHome')}</button>
        </div>
      </motion.div>
    </div>
  );
}
