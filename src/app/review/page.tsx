'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import styles from './review.module.css';
import type { DueCardDTO } from '@/types/review';
import type { Rating } from '@/lib/srs/scheduler';
import { MISTAKE_CATEGORY_LABELS, type MistakeCategoryType } from '@/types/import';
import { AudioButton } from '@/components/AudioButton';
import { playWebSpeech } from '@/lib/audio/web-speech';
import { compareMistakeSentence } from '@/lib/diff';
import { determineWordCardMode, createClozeSentence, type WordCardMode } from '@/lib/cloze';

export default function ReviewPage() {
  const [cards, setCards] = useState<DueCardDTO[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [userAttempt, setUserAttempt] = useState('');
  const [selectedWordMode, setSelectedWordMode] = useState<WordCardMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [studyDate, setStudyDate] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isEndedEarly, setIsEndedEarly] = useState(false);
  const [cardStartTime, setCardStartTime] = useState<number>(Date.now());
  const typingInputRef = useRef<HTMLTextAreaElement>(null);

  const fetchDueCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/review/due');
      const json = await res.json();
      if (json.success && json.data) {
        setCards(json.data.cards);
        setStudyDate(json.data.studyDate);
        setSessionId(json.data.sessionId || null);
        if (typeof json.data.currentIndex === 'number') {
          setCurrentIndex(json.data.currentIndex);
        }
        if (typeof json.data.completedCount === 'number') {
          setCompletedCount(json.data.completedCount);
        }
        setCardStartTime(Date.now());
      }
    } catch (error) {
      console.error('Error fetching due cards:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDueCards();
  }, [fetchDueCards]);

  const currentCard = cards[currentIndex] || null;

  // Auto-focus textarea on mistake cards when not flipped
  useEffect(() => {
    if (currentCard?.itemType === 'MISTAKE' && !isFlipped) {
      const timer = setTimeout(() => {
        typingInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentCard, isFlipped, currentIndex]);

  const wordModeInfo = useMemo(() => {
    if (currentCard?.itemType !== 'WORD' || !currentCard.wordContent) return null;

    const auto = determineWordCardMode({
      repetitions: currentCard.repetitions,
      sentenceText: currentCard.wordContent.exampleSentence?.text,
      targetForm: currentCard.wordContent.exampleSentence?.targetForm,
    });

    if (selectedWordMode) {
      if (selectedWordMode === 'CLOZE') {
        if (
          currentCard.wordContent.exampleSentence?.text &&
          currentCard.wordContent.exampleSentence?.targetForm
        ) {
          const cloze = createClozeSentence(
            currentCard.wordContent.exampleSentence.text,
            currentCard.wordContent.exampleSentence.targetForm
          );
          if (cloze.success) {
            return { mode: 'CLOZE' as WordCardMode, isFallback: false, clozeResult: cloze };
          }
        }
        return auto;
      }
      return { mode: selectedWordMode, isFallback: false };
    }

    return auto;
  }, [currentCard, selectedWordMode]);

  const handleRating = useCallback(
    async (rating: Rating) => {
      if (!currentCard || submitting) return;
      setSubmitting(true);

      const durationMs = Math.max(0, Date.now() - cardStartTime);

      try {
        const res = await fetch('/api/review/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            reviewStateId: currentCard.reviewStateId,
            rating,
            reviewDurationMs: durationMs,
          }),
        });

        const json = await res.json();
        if (json.success) {
          // If a card was re-queued in the active session, append it to cards state
          if (json.data?.session?.items && json.data.session.items.length > cards.length) {
            const lastItem = json.data.session.items[json.data.session.items.length - 1];
            setCards((prev) => [
              ...prev,
              {
                ...currentCard,
                requeueCount: lastItem.requeueCount,
                hasLapsedInSession: lastItem.hasLapsedInSession,
              },
            ]);
          }

          if (typeof json.data?.session?.completedCount === 'number') {
            setCompletedCount(json.data.session.completedCount);
          } else {
            setCompletedCount((prev) => prev + 1);
          }

          setIsFlipped(false);
          setUserAttempt('');
          setSelectedWordMode(null);
          setCurrentIndex((prev) => prev + 1);
          setCardStartTime(Date.now());
        } else {
          alert(json.error || 'Lỗi khi lưu kết quả ôn tập');
        }
      } catch (err) {
        console.error('Submit review error:', err);
        alert('Lỗi kết nối khi chấm điểm thẻ');
      } finally {
        setSubmitting(false);
      }
    },
    [currentCard, submitting, cardStartTime, sessionId, cards.length]
  );

  const handleEndEarly = useCallback(async () => {
    if (
      !confirm(
        'Bạn có chắc chắn muốn kết thúc buổi học hôm nay? Các thẻ chưa ôn sẽ được bảo lưu an toàn và tự động gối sang ngày mai.'
      )
    ) {
      return;
    }
    try {
      const res = await fetch('/api/review/end-early', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (json.success) {
        setIsEndedEarly(true);
      } else {
        alert(json.error || 'Lỗi khi kết thúc phiên');
      }
    } catch (err) {
      console.error('Error ending early:', err);
      alert('Lỗi kết nối khi kết thúc phiên');
    }
  }, [sessionId]);

  const speakCurrentCard = useCallback(() => {
    if (!currentCard) return;
    if (currentCard.itemType === 'WORD' && currentCard.wordContent) {
      if (wordModeInfo?.mode === 'CLOZE' && isFlipped && currentCard.wordContent.exampleSentence) {
        playWebSpeech(currentCard.wordContent.exampleSentence.text);
      } else {
        playWebSpeech(currentCard.wordContent.normalizedWord);
      }
    } else if (currentCard.itemType === 'MISTAKE' && currentCard.mistakeContent) {
      playWebSpeech(currentCard.mistakeContent.correct);
    }
  }, [currentCard, wordModeInfo, isFlipped]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTyping = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);

      if (isTyping) {
        // If typing in Mistake textarea, Enter without Shift submits and flips card
        if (e.key === 'Enter' && !e.shiftKey) {
          if (currentCard?.itemType === 'MISTAKE' && !isFlipped) {
            e.preventDefault();
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            setIsFlipped(true);
          }
        }
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        speakCurrentCard();
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!isFlipped && currentCard) {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          setIsFlipped(true);
        }
      } else if (isFlipped && !submitting && currentCard) {
        if (e.key === '1') {
          e.preventDefault();
          handleRating('FORGOTTEN');
        } else if (e.key === '2') {
          e.preventDefault();
          handleRating('HARD');
        } else if (e.key === '3') {
          e.preventDefault();
          handleRating('REMEMBERED');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, submitting, currentCard, handleRating, speakCurrentCard]);

  const mistakeDiff = useMemo(() => {
    if (currentCard?.itemType === 'MISTAKE' && currentCard.mistakeContent) {
      return compareMistakeSentence(userAttempt, currentCard.mistakeContent.correct);
    }
    return null;
  }, [currentCard, userAttempt]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <h2>Đang tải hàng đợi ôn tập...</h2>
          <p>Kiểm tra các thẻ từ vựng và câu sai đến hạn hôm nay.</p>
        </div>
      </div>
    );
  }

  // Completion Screen (when all cards in this session are done or ended early)
  if (isEndedEarly || (cards.length > 0 && currentIndex >= cards.length)) {
    return (
      <div className={styles.container}>
        <div className={styles.completionCard}>
          <div className={styles.completionIcon}>{isEndedEarly ? '🛑' : '🎉'}</div>
          <h2 className={styles.completionTitle}>
            {isEndedEarly ? 'Đã lưu lại tiến độ học hôm nay!' : 'Hoàn thành xuất sắc phiên ôn tập!'}
          </h2>
          <p className={styles.completionText}>
            Bạn đã ôn tập thành công <strong>{completedCount}</strong> thẻ trong ngày học hôm nay ({studyDate}).{' '}
            {isEndedEarly
              ? 'Các thẻ chưa ôn đã được bảo lưu an toàn và sẽ tự động xuất hiện vào ngày học tiếp theo!'
              : 'Kiên trì đều đặn 1 giờ mỗi ngày là chìa khóa đạt band 6.5!'}
          </p>
          <div className={styles.actionLinks}>
            <Link href="/vocab" className={styles.btnSecondary}>
              Xem Thư viện Từ vựng
            </Link>
            <Link href="/mistakes" className={styles.btnSecondary}>
              Xem Sổ tay Lỗi sai
            </Link>
            <Link href="/" className={styles.btnPrimary}>
              Về Trang chủ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Empty state (no cards due at all)
  if (cards.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <h2>Hôm nay không có thẻ nào đến hạn! 🌟</h2>
          <p>
            Bạn đã hoàn thành mọi mục tiêu hoặc chưa có thẻ nào đến hạn ôn tập trong ngày học ({studyDate}).
            (Mốc chuyển ngày học kế tiếp là lúc 04:00 sáng).
          </p>
          <div className={styles.actionLinks}>
            <Link href="/import" className={styles.btnPrimary}>
              Nhập bài học mới
            </Link>
            <Link href="/vocab" className={styles.btnSecondary}>
              Duyệt Thư viện Từ vựng
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const progressPercent = Math.round((currentIndex / cards.length) * 100);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Ôn tập SRS Flashcard</h1>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.studyDateBadge}>
            🗓️ Ngày học: <strong>{studyDate}</strong> (đổi ngày 04:00 AM)
          </div>
          {cards.length > 0 && currentIndex < cards.length && (
            <button
              type="button"
              className={styles.btnEndEarly}
              onClick={handleEndEarly}
              title="Dừng phiên học sớm, các thẻ còn lại sẽ gối sang ngày mai"
            >
              🛑 Kết thúc hôm nay
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className={styles.progressWrap}>
        <div className={styles.progressInfo}>
          <span>
            Thẻ <strong>{currentIndex + 1}</strong> / {cards.length}
          </span>
          <span>{progressPercent}% hoàn thành</span>
        </div>
        <div className={styles.progressBarBg}>
          <div
            className={styles.progressBarFill}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Card Container */}
      <div className={styles.cardContainer}>
        <div className={styles.cardTop}>
          <span
            className={`${styles.cardTypeBadge} ${
              currentCard.itemType === 'WORD' ? styles.typeWord : styles.typeMistake
            }`}
          >
            {currentCard.itemType === 'WORD' ? '📖 Từ vựng' : '⚠️ Lỗi sai cần nhớ'}
          </span>
          <span className={styles.srsMeta}>
            Cách quãng: {currentCard.interval}d | EF: {currentCard.easeFactor.toFixed(2)} | Lần: {currentCard.repetitions}
          </span>
        </div>

        {/* Card Front & Back Content */}
        <div className={styles.cardContent}>
          {currentCard.itemType === 'WORD' && currentCard.wordContent && wordModeInfo && (
            <>
              {/* Word Mode Switcher */}
              <div className={styles.wordModeRow}>
                <button
                  type="button"
                  className={`${styles.modePill} ${
                    wordModeInfo.mode === 'RECOGNITION' ? styles.modePillActive : ''
                  }`}
                  onClick={() => setSelectedWordMode('RECOGNITION')}
                >
                  🔤 Từ → Nghĩa
                </button>
                <button
                  type="button"
                  className={`${styles.modePill} ${
                    wordModeInfo.mode === 'RECALL' ? styles.modePillActive : ''
                  }`}
                  onClick={() => setSelectedWordMode('RECALL')}
                >
                  💡 Nghĩa → Từ
                </button>
                <button
                  type="button"
                  className={`${styles.modePill} ${
                    wordModeInfo.mode === 'CLOZE' ? styles.modePillActive : ''
                  }`}
                  onClick={() => setSelectedWordMode('CLOZE')}
                  disabled={!currentCard.wordContent.exampleSentence?.targetForm}
                  title={
                    !currentCard.wordContent.exampleSentence?.targetForm
                      ? 'Câu ví dụ chưa có targetForm để đục lỗ'
                      : undefined
                  }
                >
                  🧩 Đục lỗ Cloze
                </button>
                {wordModeInfo.isFallback && (
                  <span className={styles.fallbackBadge}>⚠️ Tự động fallback</span>
                )}
              </div>

              {/* Mode 1: RECOGNITION (Từ -> Nghĩa) */}
              {wordModeInfo.mode === 'RECOGNITION' && (
                <>
                  <div className={styles.wordMain}>
                    <span>{currentCard.wordContent.normalizedWord}</span>
                    <span className={styles.posTag}>{currentCard.wordContent.pos}</span>
                    <AudioButton
                      text={currentCard.wordContent.normalizedWord}
                      size="md"
                      title={`Nghe phát âm từ "${currentCard.wordContent.normalizedWord}" (Phím R)`}
                    />
                  </div>

                  {!isFlipped ? (
                    <div className={styles.flipHint}>
                      Nhấn <kbd className={styles.kbd}>Space</kbd> để xem nghĩa và câu ví dụ • Nhấn <kbd className={styles.kbd}>R</kbd> để nghe phát âm
                    </div>
                  ) : (
                    <>
                      {currentCard.wordContent.ipa && (
                        <div className={styles.ipaText}>{currentCard.wordContent.ipa}</div>
                      )}

                      <div className={styles.backDivider} />

                      <div className={styles.backContent}>
                        {currentCard.wordContent.meanings.length > 0 && (
                          <div className={styles.meaningsBox}>
                            <div className={styles.meaningsTitle}>Nghĩa tiếng Việt:</div>
                            <ul className={styles.meaningsList}>
                              {currentCard.wordContent.meanings.map((m, idx) => (
                                <li key={idx}>{m}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {currentCard.wordContent.exampleSentence && (
                          <div className={styles.exampleBox}>
                            <div className={styles.exampleEn} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <AudioButton
                                text={currentCard.wordContent.exampleSentence.text}
                                size="sm"
                                title="Nghe phát âm câu ví dụ"
                              />
                              <span>&ldquo;{currentCard.wordContent.exampleSentence.text}&rdquo;</span>
                            </div>
                            <div className={styles.exampleVi}>
                              {currentCard.wordContent.exampleSentence.translationVi}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Mode 2: RECALL (Nghĩa -> Từ) */}
              {wordModeInfo.mode === 'RECALL' && (
                <>
                  {!isFlipped ? (
                    <div className={styles.recallContainer}>
                      <span className={styles.recallPrompt}>Hồi tưởng từ tiếng Anh mang nghĩa:</span>
                      <div className={styles.recallMeanings}>
                        {currentCard.wordContent.meanings.join(', ') || 'Chưa có định nghĩa'}
                      </div>
                      <span className={styles.posTag}>Từ loại: {currentCard.wordContent.pos}</span>

                      <div className={styles.flipHint} style={{ marginTop: 'var(--space-2)' }}>
                        Nhấn <kbd className={styles.kbd}>Space</kbd> để xem từ tiếng Anh và phát âm
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.wordMain}>
                        <span>{currentCard.wordContent.normalizedWord}</span>
                        <span className={styles.posTag}>{currentCard.wordContent.pos}</span>
                        <AudioButton
                          text={currentCard.wordContent.normalizedWord}
                          size="md"
                          title={`Nghe phát âm từ "${currentCard.wordContent.normalizedWord}" (Phím R)`}
                        />
                      </div>

                      {currentCard.wordContent.ipa && (
                        <div className={styles.ipaText}>{currentCard.wordContent.ipa}</div>
                      )}

                      <div className={styles.backDivider} />

                      <div className={styles.backContent}>
                        {currentCard.wordContent.meanings.length > 0 && (
                          <div className={styles.meaningsBox}>
                            <div className={styles.meaningsTitle}>Nghĩa tiếng Việt:</div>
                            <ul className={styles.meaningsList}>
                              {currentCard.wordContent.meanings.map((m, idx) => (
                                <li key={idx}>{m}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {currentCard.wordContent.exampleSentence && (
                          <div className={styles.exampleBox}>
                            <div className={styles.exampleEn} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <AudioButton
                                text={currentCard.wordContent.exampleSentence.text}
                                size="sm"
                                title="Nghe phát âm câu ví dụ"
                              />
                              <span>&ldquo;{currentCard.wordContent.exampleSentence.text}&rdquo;</span>
                            </div>
                            <div className={styles.exampleVi}>
                              {currentCard.wordContent.exampleSentence.translationVi}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Mode 3: CLOZE (Đục lỗ câu ngữ cảnh) */}
              {wordModeInfo.mode === 'CLOZE' && wordModeInfo.clozeResult && (
                <>
                  {!isFlipped ? (
                    <div className={styles.clozeContainer}>
                      <span className={styles.clozePrompt}>Điền dạng từ đúng vào chỗ trống:</span>
                      <div className={styles.clozeSentenceBox}>
                        &ldquo;{wordModeInfo.clozeResult.prefix}
                        <span className={styles.clozeBlank}>[ ... ]</span>
                        {wordModeInfo.clozeResult.suffix}&rdquo;
                      </div>

                      <div className={styles.clozeHintBox}>
                        <div>
                          <strong>Gợi ý:</strong> từ gốc <strong>{currentCard.wordContent.normalizedWord}</strong> (<em>{currentCard.wordContent.pos}</em>)
                        </div>
                        {currentCard.wordContent.exampleSentence?.translationVi && (
                          <div className={styles.clozeHintTranslation}>
                            Dịch câu: &ldquo;{currentCard.wordContent.exampleSentence.translationVi}&rdquo;
                          </div>
                        )}
                      </div>

                      <div className={styles.flipHint}>
                        Nhấn <kbd className={styles.kbd}>Space</kbd> để xem đáp án dạng từ và câu đầy đủ
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.clozeContainer}>
                        <div className={styles.clozeSentenceBox}>
                          &ldquo;{wordModeInfo.clozeResult.prefix}
                          <span className={styles.clozeRevealed}>
                            {wordModeInfo.clozeResult.matchedForm || wordModeInfo.clozeResult.targetForm}
                          </span>
                          {wordModeInfo.clozeResult.suffix}&rdquo;
                        </div>

                        <div className={styles.clozeMetaRow}>
                          <span>Từ gốc: <strong>{currentCard.wordContent.normalizedWord}</strong></span>
                          <span>•</span>
                          <span>Dạng trong câu: <span className={styles.clozeRevealed}>{wordModeInfo.clozeResult.matchedForm || wordModeInfo.clozeResult.targetForm}</span></span>
                          <span className={styles.posTag}>{currentCard.wordContent.pos}</span>
                          {currentCard.wordContent.ipa && (
                            <span className={styles.ipaText}>{currentCard.wordContent.ipa}</span>
                          )}
                          <AudioButton
                            text={currentCard.wordContent.exampleSentence?.text || currentCard.wordContent.normalizedWord}
                            size="sm"
                            title="Nghe câu hoàn chỉnh (Phím R)"
                          />
                        </div>
                      </div>

                      <div className={styles.backDivider} />

                      <div className={styles.backContent}>
                        {currentCard.wordContent.meanings.length > 0 && (
                          <div className={styles.meaningsBox}>
                            <div className={styles.meaningsTitle}>Nghĩa tiếng Việt:</div>
                            <ul className={styles.meaningsList}>
                              {currentCard.wordContent.meanings.map((m, idx) => (
                                <li key={idx}>{m}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {currentCard.wordContent.exampleSentence?.translationVi && (
                          <div className={styles.exampleBox}>
                            <div className={styles.exampleVi}>
                              {currentCard.wordContent.exampleSentence.translationVi}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {currentCard.itemType === 'MISTAKE' && currentCard.mistakeContent && (
            <>
              <div className={styles.mistakeWrong}>
                ❌ {currentCard.mistakeContent.wrong}
              </div>

              {!isFlipped ? (
                <div className={styles.typingContainer}>
                  <label htmlFor="mistake-input" className={styles.typingLabel}>
                    <span>✍️ Gõ lại câu đúng chuẩn:</span>
                    <span className={styles.typingHint}>Nhấn Enter để kiểm tra</span>
                  </label>
                  <textarea
                    id="mistake-input"
                    ref={typingInputRef}
                    className={styles.typingTextarea}
                    value={userAttempt}
                    onChange={(e) => setUserAttempt(e.target.value)}
                    placeholder="Gõ lại câu hoàn chỉnh đúng chính tả, hoa/thường và dấu câu..."
                    rows={2}
                  />
                  <div className={styles.typingActions}>
                    <button
                      type="button"
                      className={styles.btnSkip}
                      onClick={() => {
                        setUserAttempt('');
                        setIsFlipped(true);
                      }}
                    >
                      Tôi không nhớ (Xem đáp án)
                    </button>
                    <button
                      type="button"
                      className={styles.btnCheck}
                      onClick={() => setIsFlipped(true)}
                    >
                      Kiểm tra &amp; Lật thẻ (<kbd className={styles.kbd}>Enter</kbd>)
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.backDivider} />

                  <div className={styles.backContent}>
                    {mistakeDiff && (
                      <div className={styles.diffContainer}>
                        {mistakeDiff.isExactMatch && (
                          <div className={styles.diffExactBanner}>
                            🎉 Xuất sắc! Bạn đã gõ chính xác 100% câu đúng chuẩn (đúng từng ký tự hoa/thường và dấu câu).
                          </div>
                        )}

                        {/* User Typed Sentence */}
                        <div className={styles.diffSection}>
                          <div className={styles.diffSectionHeader}>
                            <span className={styles.diffSectionTitle}>Câu bạn đã gõ:</span>
                          </div>
                          <div className={styles.diffBox}>
                            {mistakeDiff.cleanUserInput.length === 0 ? (
                              <span className={styles.diffEmpty}>(Bạn chưa nhập câu trả lời)</span>
                            ) : (
                              mistakeDiff.userChunks.map((chunk, idx) => (
                                <span
                                  key={idx}
                                  className={chunk.isError ? styles.diffError : undefined}
                                >
                                  {chunk.value}
                                </span>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Target Correct Sentence */}
                        <div className={styles.diffSection}>
                          <div className={styles.diffSectionHeader}>
                            <span className={styles.diffSectionTitle}>Đáp án chuẩn:</span>
                            <AudioButton
                              text={currentCard.mistakeContent.correct}
                              size="sm"
                              title="Nghe phát âm câu đúng (Phím R)"
                            />
                          </div>
                          <div className={styles.diffBox}>
                            {mistakeDiff.targetChunks.map((chunk, idx) => (
                              <span
                                key={idx}
                                className={chunk.isMissingOrChanged ? styles.diffSuccess : undefined}
                              >
                                {chunk.value}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className={styles.explanationText}>
                      <strong>
                        💡 {MISTAKE_CATEGORY_LABELS[currentCard.mistakeContent.category as MistakeCategoryType] || currentCard.mistakeContent.category}:
                      </strong>{' '}
                      {currentCard.mistakeContent.explanationVi}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Action Controls */}
        {!isFlipped ? (
          currentCard.itemType === 'WORD' ? (
            <button
              type="button"
              className={styles.flipBtn}
              onClick={() => setIsFlipped(true)}
            >
              Lật thẻ / Xem đáp án (<kbd className={styles.kbd}>Space</kbd>)
            </button>
          ) : null
        ) : (
          <div className={styles.ratingCluster}>
            <button
              type="button"
              className={`${styles.ratingBtn} ${styles.ratingBtnForgotten}`}
              onClick={() => handleRating('FORGOTTEN')}
              disabled={submitting}
            >
              <span className={styles.btnTitle}>🔴 Quên (1)</span>
              <span className={styles.btnSub}>1 ngày, -0.2 EF</span>
            </button>
            <button
              type="button"
              className={`${styles.ratingBtn} ${styles.ratingBtnHard}`}
              onClick={() => handleRating('HARD')}
              disabled={submitting}
            >
              <span className={styles.btnTitle}>🟡 Khó nhớ (2)</span>
              <span className={styles.btnSub}>+1 ngày, -0.15 EF</span>
            </button>
            <button
              type="button"
              className={`${styles.ratingBtn} ${styles.ratingBtnRemembered}`}
              onClick={() => handleRating('REMEMBERED')}
              disabled={submitting}
            >
              <span className={styles.btnTitle}>🟢 Nhớ rõ (3)</span>
              <span className={styles.btnSub}>Giãn cách, +0.1 EF</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
