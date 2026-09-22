import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { useBackButton } from '../../hooks/useBackButton';
import { BACK_PRIORITY } from '../../services/backButtonService';
import { Volume2, ArrowLeft, Heart, Check, Plus, X, ImagePlus } from 'lucide-react';
import { AudioService } from '../../services/audioService';
import { MemoryService } from '../../services/memoryService';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import Magnetic from '../common/Magnetic';
import Waveform from '../common/Waveform';
import UserAvatar from '../common/UserAvatar';
import { resizeToDataUrl } from '../common/AvatarPicker';
import { useTranslation } from '../../hooks/useTranslation';
import { SkeletonCards } from '../common/Skeleton';

const categories = ['All', 'Family', 'Festivals', 'Places'];
const categoryLabelKeys = { All: 'categoryAll', Family: 'categoryFamily', Festivals: 'categoryFestivals', Places: 'categoryPlaces' };
const formCategories = categories.filter((c) => c !== 'All');

const initialForm = { name: '', category: 'Family', relation: '', description: '', favoriteMemory: '', voiceNote: '', photoUrl: null };

export default function MemoryJournalView({ session, onBack, onOpenVoiceAssistant }) {
  const { t } = useTranslation();
  const [memories, setMemories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeMemory, setActiveMemory] = useState(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const containerRef = useScrollReveal();
  const fallbackTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  const imgTiltX = useMotionValue(0);
  const imgTiltY = useMotionValue(0);
  const imgTiltXSpring = useSpring(imgTiltX, { stiffness: 80, damping: 18, mass: 0.6 });
  const imgTiltYSpring = useSpring(imgTiltY, { stiffness: 80, damping: 18, mass: 0.6 });

  const loadMemories = useCallback(async () => {
    if (!session?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError('');
    const result = await MemoryService.listMemories(session.id);
    if (!result.ok) {
      setLoadError(result.error || t('memoriesLoadError'));
      setIsLoading(false);
      return;
    }
    setMemories(result.memories);
    setActiveMemory(result.memories[0] || null);
    setIsLoading(false);
  }, [session?.id, t]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const filteredMemories = selectedCategory === 'All' ? memories : memories.filter((m) => m.category === selectedCategory);

  const handleNarrate = (mem) => {
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    setActiveMemory(mem);
    setIsPlayingAudio(true);
    setJustFinished(false);

    const text = [mem.name, mem.relation, mem.description, mem.voiceNote].filter(Boolean).join('. ');
    // Speech-synthesis "onend" is notoriously unreliable across browsers/tabs —
    // fall back to a duration estimate so the button can never get stuck.
    const estimatedMs = Math.min(20000, Math.max(3000, text.split(' ').length * 380));

    const finish = () => {
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setIsPlayingAudio(false);
      setJustFinished(true);
      window.setTimeout(() => setJustFinished(false), 1400);
    };

    fallbackTimerRef.current = window.setTimeout(finish, estimatedMs);
    AudioService.speak(text, 'en', finish);
  };

  const handleImageMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    imgTiltX.set(((e.clientX - rect.left) / rect.width - 0.5) * 14);
    imgTiltY.set(((e.clientY - rect.top) / rect.height - 0.5) * 14);
  };

  const handleImageLeave = () => {
    imgTiltX.set(0);
    imgTiltY.set(0);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const dataUrl = resizeToDataUrl(img, img.naturalWidth, img.naturalHeight, 1000);
        setForm((f) => ({ ...f, photoUrl: dataUrl }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const closeForm = () => {
    setShowAddForm(false);
    setForm(initialForm);
    setFormError('');
  };

  useBackButton(() => { closeForm(); return true; }, { enabled: showAddForm, priority: BACK_PRIORITY.OVERLAY });

  const handleAddMemory = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    if (!form.name.trim()) {
      setFormError(t('memoryNameRequired'));
      return;
    }
    setFormError('');
    setIsSaving(true);
    const result = await MemoryService.addMemory(session.id, form);
    setIsSaving(false);
    if (!result.ok) {
      setFormError(result.error || t('memorySaveError'));
      return;
    }
    setMemories((prev) => [result.memory, ...prev]);
    setActiveMemory(result.memory);
    setForm(initialForm);
    setShowAddForm(false);
  };

  const renderAddForm = () => (
    <AnimatePresence>
      {showAddForm && (
        <motion.form
          onSubmit={handleAddMemory}
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden mb-8"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6" style={{ borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)' }}>
            <div>
              <label className="field-label">{t('memoryNameLabel')}</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('memoryNameLabel')} className="input" required />
            </div>
            <div>
              <label className="field-label">{t('memoryCategoryLabel')}</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="select">
                {formCategories.map((cat) => (<option key={cat} value={cat}>{t(categoryLabelKeys[cat])}</option>))}
              </select>
            </div>
            <div>
              <label className="field-label">{t('memoryRelationLabel')}</label>
              <input type="text" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} placeholder="Granddaughter" className="input" />
            </div>
            <div>
              <label className="field-label">{t('memoryPhotoLabel')}</label>
              <div className="flex items-center gap-3 pt-2">
                <UserAvatar avatar={form.photoUrl} fullName={form.name} className="w-11 h-11 rounded-full object-cover shrink-0 overflow-hidden" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-line !min-h-9 !py-2 text-xs whitespace-normal">
                  <ImagePlus className="w-4 h-4" /> {form.photoUrl ? t('memoryPhotoChange') : t('memoryPhotoUpload')}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">{t('memoryDescriptionLabel')}</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="input" style={{ resize: 'none' }} />
            </div>
            <div>
              <label className="field-label">{t('memorySpecialMomentLabel')}</label>
              <input type="text" value={form.favoriteMemory} onChange={(e) => setForm({ ...form, favoriteMemory: e.target.value })} className="input" />
            </div>
            <div>
              <label className="field-label">{t('memoryVoiceNoteLabel')}</label>
              <input type="text" value={form.voiceNote} onChange={(e) => setForm({ ...form, voiceNote: e.target.value })} className="input" />
            </div>
          </div>

          {formError && <div className="notice-strip is-alert mt-4 text-sm text-alert" role="alert">{formError}</div>}

          <div className="flex justify-end gap-3 pt-5">
            <button type="button" onClick={closeForm} className="btn btn-quiet">{t('cancel')}</button>
            <button type="submit" disabled={isSaving} className={`btn btn-ember ${isSaving ? 'is-loading' : ''}`}>{isSaving ? t('savingMemory') : t('saveMemory')}</button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );

  let body;

  if (isLoading) {
    body = <SkeletonCards count={4} height="11rem" label={t('memoriesLoading')} />;
  } else if (loadError) {
    body = (
      <div className="notice-strip is-alert flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <p className="text-sm text-alert">{loadError}</p>
        <button type="button" onClick={loadMemories} className="btn btn-line shrink-0">{t('retry')}</button>
      </div>
    );
  } else if (memories.length === 0 && !showAddForm) {
    body = (
      <motion.div
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="panel-light p-9 sm:p-12 text-center space-y-6 max-w-xl mx-auto"
      >
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(226,112,58,0.15)', color: 'var(--ember-deep)' }}>
          <Heart className="w-7 h-7" />
        </div>
        <div>
          <h3 className="font-display text-2xl sm:text-3xl font-medium">{t('noMemoriesYetTitle')}</h3>
          <p className="text-sm mt-2" style={{ color: 'rgba(23,20,15,0.6)' }}>{t('noMemoriesYetDesc')}</p>
        </div>
        <Magnetic strength={0.15} className="inline-block">
          <button type="button" onClick={() => setShowAddForm(true)} className="btn btn-on-light">
            <Plus className="w-4.5 h-4.5" /> {t('addMemory')}
          </button>
        </Magnetic>
      </motion.div>
    );
  } else if (memories.length > 0) {
    body = (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {activeMemory && (
          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-7"
          >
            <div
              className="relative rounded-[var(--radius-lg)] overflow-hidden h-72 sm:h-[27rem]"
              onMouseMove={handleImageMove}
              onMouseLeave={handleImageLeave}
            >
              {activeMemory.photoUrl ? (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeMemory.id}
                    className="absolute inset-0"
                    initial={{ opacity: 0, scale: 1.03 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <motion.img
                      src={activeMemory.photoUrl}
                      alt={activeMemory.name}
                      className="w-full h-full object-cover"
                      style={{ objectPosition: '50% 28%', x: imgTiltXSpring, y: imgTiltYSpring, scale: 1.06 }}
                    />
                  </motion.div>
                </AnimatePresence>
              ) : (
                <div className="absolute inset-0 grid place-items-center" style={{ background: 'var(--canvas-raised)' }}>
                  <span className="font-display text-6xl font-medium text-ink-faint">{activeMemory.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent 45%, rgba(11,10,8,0.94) 100%)' }} />
              <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-7">
                <span className="text-xs font-semibold uppercase tracking-wider text-on-photo-soft">{t(categoryLabelKeys[activeMemory.category]) || activeMemory.category}</span>
                <h3 className="font-display text-3xl sm:text-[2.15rem] font-medium mt-1.5 leading-tight text-on-photo">{activeMemory.name}</h3>
                {activeMemory.relation && <p className="text-sm font-medium mt-1 text-jade">{activeMemory.relation}</p>}
              </div>
            </div>

            <div className="mt-5 space-y-6">
              <Magnetic strength={0.12} className="block">
                <button type="button" onClick={() => handleNarrate(activeMemory)} className="btn btn-ember w-full">
                  <AnimatePresence mode="wait" initial={false}>
                    {justFinished ? (
                      <motion.span key="done" className="inline-flex items-center gap-2" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.16 }}>
                        <Check className="w-4.5 h-4.5" /> {t('played')}
                      </motion.span>
                    ) : isPlayingAudio ? (
                      <motion.span key="playing" className="inline-flex items-center gap-2.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                        <Waveform active barWidth={2.5} height={16} />
                        {t('narratingEllipsis')}
                      </motion.span>
                    ) : (
                      <motion.span key="idle" className="inline-flex items-center gap-2.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                        <Volume2 className="w-4.5 h-4.5" /> {t('listenToVoiceMemory')}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </Magnetic>

              {activeMemory.description && (
                <p className="text-base leading-relaxed max-w-prose text-ink-soft">{activeMemory.description}</p>
              )}

              {activeMemory.favoriteMemory && (
                <div className="notice-strip is-ember flex items-start gap-3">
                  <Heart className="w-4 h-4 shrink-0 mt-0.5 text-ember" />
                  <p className="text-sm leading-relaxed text-ink-soft">
                    <span className="font-semibold text-ink">{t('specialMoment')}</span> {activeMemory.favoriteMemory}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
          className="lg:col-span-5"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="pin">{filteredMemories.length} {t('memoriesCountSuffix')}</span>
            <button type="button" onClick={onOpenVoiceAssistant} className="text-xs font-semibold text-jade">{t('askWhoIsThis')} →</button>
          </div>

          {filteredMemories.length === 0 ? (
            <div className="text-center py-10 space-y-4">
              <p className="text-sm text-ink-faint">{t('noMemoriesInCategory')}</p>
              <Magnetic strength={0.15} className="inline-block">
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, category: selectedCategory === 'All' ? f.category : selectedCategory }));
                    setShowAddForm(true);
                  }}
                  className="btn btn-line !min-h-9 !py-2 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> {t('addMemory')}
                </button>
              </Magnetic>
            </div>
          ) : (
            <div className="index-list max-h-[560px] overflow-y-auto scrollbar-none">
              {filteredMemories.map((mem) => (
                <button
                  type="button" key={mem.id} onClick={() => handleNarrate(mem)} className="index-row"
                  style={activeMemory?.id === mem.id ? { color: 'var(--ember)' } : undefined}
                >
                  <UserAvatar avatar={mem.photoUrl} fullName={mem.name} className="w-14 h-14 rounded-full object-cover shrink-0 overflow-hidden" style={{ objectPosition: '50% 28%' }} />
                  <span className="flex-1 min-w-0">
                    <span className="font-display text-lg font-medium block truncate">{mem.name}</span>
                    <span className="text-xs block truncate text-ink-faint">{mem.relation}</span>
                  </span>
                  <Volume2 className="w-4 h-4 shrink-0 text-ink-faint" />
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    );
  } else {
    body = null;
  }

  return (
    <div ref={containerRef} className="page max-w-5xl">
      <div className="flex items-center justify-between gap-4 mb-8">
        <button type="button" onClick={onBack} className="btn btn-quiet !px-0"><ArrowLeft className="w-4 h-4" /> {t('back')}</button>
        <h2 className="font-display text-2xl font-medium">{t('memoryJournal')}</h2>
      </div>

      {!isLoading && !loadError && (
        <div className="flex items-center justify-between gap-4 mb-8 tab-strip border-b border-hairline">
          <div className="flex items-center gap-6">
            {categories.map((cat) => (
              <button
                type="button" key={cat} onClick={() => setSelectedCategory(cat)}
                className={`tab-link ${selectedCategory === cat ? 'is-active' : ''}`}
              >
                {t(categoryLabelKeys[cat])}
                {selectedCategory === cat && (
                  <motion.span layoutId="memory-tab-underline" className="absolute left-0 right-0 -bottom-px h-[2px]" style={{ background: 'var(--ember)' }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} />
                )}
              </button>
            ))}
          </div>
          {memories.length > 0 && (
            <button type="button" onClick={() => (showAddForm ? closeForm() : setShowAddForm(true))} className="btn btn-quiet shrink-0 !px-0 text-ember">
              {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showAddForm ? t('close') : t('addMemory')}
            </button>
          )}
        </div>
      )}

      {renderAddForm()}

      {body}
    </div>
  );
}
