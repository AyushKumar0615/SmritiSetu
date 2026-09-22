import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBackButton } from '../../hooks/useBackButton';
import { BACK_PRIORITY } from '../../services/backButtonService';
import PianoSequenceGame from '../games/PianoSequenceGame';
import GameIntro from '../games/shared/GameIntro';
import GameResult from '../games/shared/GameResult';
import CategoryFilter from '../games/shared/CategoryFilter';
import GameCard, { FeaturedGameCard } from '../games/shared/GameCard';
import Countdown from '../games/shared/Countdown';
import { pageTransition } from '../common/pageTransition';
import { useTranslation } from '../../hooks/useTranslation';
import { CognitiveAnalyticsService } from '../../services/cognitiveAnalyticsService';
import InlineNotice from '../common/InlineNotice';
import confetti from 'canvas-confetti';

const GAME_DEFS = [
  {
    id: 'piano', titleKey: 'gamePianoTitle', category: 'Memory', icon: '🎹',
    skillKey: 'gamePianoSkill', estimatedMinutes: 4,
    descriptionKey: 'gamePianoDesc',
    howItWorksKeys: ['gamePianoHow1', 'gamePianoHow2', 'gamePianoHow3'],
    Component: PianoSequenceGame
  }
];

const CATEGORY_LABEL_KEYS = {
  Memory: 'gameCategoryMemory',
  Attention: 'gameCategoryAttention'
};

export default function GameShell({ session, onBack }) {
  const { t } = useTranslation();
  const [view, setView] = useState('library'); // library | intro | countdown | playing | result
  const [activeGameId, setActiveGameId] = useState(null);
  const [gameStartedAt, setGameStartedAt] = useState(null);
  const [result, setResult] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [saveError, setSaveError] = useState('');

  const translatedGames = GAME_DEFS.map((g) => ({
    ...g,
    title: t(g.titleKey),
    skill: t(g.skillKey),
    description: t(g.descriptionKey),
    difficultyText: t('adaptiveDifficultyText'),
    howItWorks: g.howItWorksKeys.map((k) => t(k)),
    categoryLabel: t(CATEGORY_LABEL_KEYS[g.category])
  }));

  const categories = ['all', ...new Set(GAME_DEFS.map((g) => g.category))];
  const visibleGames = activeCategory === 'all' ? translatedGames : translatedGames.filter((g) => g.category === activeCategory);
  const featured = visibleGames[0];
  const restGames = visibleGames.slice(1);
  const activeGame = translatedGames.find((g) => g.id === activeGameId);

  const openIntro = (game) => { setActiveGameId(game.id); setView('intro'); };
  // Every game (re)start goes through the countdown first — GameIntro's
  // "Start" button and GameResult's "Play Again" both call this same
  // function, so there's one choke point rather than duplicated logic.
  const startGame = () => setView('countdown');
  const beginPlaying = () => { setGameStartedAt(Date.now()); setView('playing'); };
  const exitToLibrary = () => { setActiveGameId(null); setResult(null); setGameStartedAt(null); setSaveError(''); setView('library'); };

  useBackButton(() => { exitToLibrary(); return true; }, { enabled: view !== 'library', priority: BACK_PRIORITY.SCREEN_STEP });

  const handleFinishGame = async (sessionData) => {
    setResult(sessionData);
    setView('result');
    try { confetti({ particleCount: 90, spread: 75, origin: { y: 0.5 }, colors: ['#E2703A', '#4FAE8E', '#F4EFE7'] }); } catch (e) {}
    const saved = await CognitiveAnalyticsService.recordSession({
      ...sessionData,
      gameId: activeGameId,
      completionTimeSeconds: gameStartedAt ? (Date.now() - gameStartedAt) / 1000 : 0
    });
    if (!saved.ok) {
      setSaveError('Your result could not be saved for caregiver analytics. Please check your connection and try another game.');
      return;
    }
    const analysis = await CognitiveAnalyticsService.requestAnalysis(saved.session.id);
    if (!analysis.ok) setSaveError('Your game result was saved, but its cognitive analysis is currently unavailable. A caregiver can retry it later.');
  };

  let content;

  if (view === 'result' && result) {
    content = (<div className="page space-y-4">
      <InlineNotice tone="error" message={saveError} onDismiss={() => setSaveError('')} autoDismissMs={0} />
      <GameResult
        gameName={t(result.gameNameKey)}
        skill={t(result.skillKey)}
        score={result.score}
        accuracy={result.accuracy}
        bestStreak={result.bestStreak}
        difficultyLevel={result.difficultyLevel}
        extraStats={(result.extraStats || []).map((s) => ({ label: t(s.labelKey), value: s.value }))}
        onPlayAgain={() => setView('intro')}
        onBackToGames={exitToLibrary}
      />
    </div>);
  } else if (view === 'intro' && activeGame) {
    content = (
      <GameIntro
        gameId={activeGame.id}
        icon={activeGame.icon}
        title={activeGame.title}
        skill={activeGame.skill}
        howItWorks={activeGame.howItWorks}
        difficultyText={activeGame.difficultyText}
        estimatedMinutes={activeGame.estimatedMinutes}
        onStart={startGame}
        onBack={exitToLibrary}
      />
    );
  } else if (view === 'countdown' && activeGame) {
    // No game UI is mounted at all while this is showing, so there's
    // nothing for the player to interact with until it completes.
    content = <Countdown onComplete={beginPlaying} />;
  } else if (view === 'playing' && activeGame) {
    const GameComponent = activeGame.Component;
    content = <GameComponent onFinishGame={handleFinishGame} onBack={exitToLibrary} />;
  } else {
    content = (
      <div className="page">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5 mb-10">
            <div>
              <span className="eyebrow">{t('cognitiveExercises')}</span>
              <h2 className="font-display text-4xl md:text-5xl font-medium mt-3 leading-[0.98] max-w-xl">{t('gameLibraryHeading')}</h2>
              <p className="text-sm mt-3 max-w-md text-ink-faint">{t('gameLibrarySubtext')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:justify-end shrink-0">
              <CategoryFilter categories={categories} active={activeCategory} onChange={setActiveCategory} />
              <button type="button" onClick={onBack} className="btn btn-quiet shrink-0">{t('back')}</button>
            </div>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {featured && (
              <div className="mb-10">
                <FeaturedGameCard game={featured} onPlay={openIntro} />
              </div>
            )}

            {restGames.length > 0 && (
              <div>
                <span className="eyebrow">{t('exploreExercisesLabel')}</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {restGames.map((game, idx) => (
                    <motion.div
                      key={game.id}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 + idx * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <GameCard game={{ ...game, number: idx + 2 }} onPlay={openIntro} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // intro/countdown/playing intentionally share one key: they're all the
  // same "session" for a given game, so hopping between them (starting the
  // countdown, then the game right after it finishes) is an instant content
  // swap with no extra page-transition fade layered on top — only entering
  // the session (library -> intro) and leaving it (playing -> result,
  // result -> library) get the animated transition.
  const viewKey = view === 'library' ? 'library' : view === 'result' ? `result-${activeGameId}` : `session-${activeGameId}`;

  return (
    <AnimatePresence mode="wait">
      <motion.div key={viewKey} {...pageTransition}>
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
