'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import styles from './review.module.css';
import type { DueCardDTO } from '@/types/review';
import type { Rating } from '@/lib/srs/scheduler';
import { MISTAKE_CATEGORY_LABELS, type MistakeCategoryType } from '@/types/import';
import { AudioButton } from '@/components/AudioButton';
import { playWebSpeech } from '@/lib/audio/web-speech';

export default function ReviewPage() {
  const [cards, setCards] = useState<DueCardDTO[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [studyDate, setStudyDate] = useState('');
  const [cardStartTime, setCardStartTime] = useState<number>(Date.now());

  const fetchDueCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/review/due');
      const json = await res.json();
      if (json.success && json.data) {
        setCards(json.data.cards);
        setStudyDate(json.data.studyDate);
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
            reviewStateId: currentCard.reviewStateId,
            rating,
            reviewDurationMs: durationMs,
          }),
        });

        const json = await res.json();
        if (json.success) {
          setIsFlipped(false);
          setCurrentIndex((prev) => prev + 1);
          setCompletedCount((prev) => prev + 1);
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
    [currentCard, submitting, cardStartTime]
  );

  const speakCurrentCard = useCallback(() => {
    if (!currentCard) return;
    if (currentCard.itemType === 'WORD' && currentCard.wordContent) {
      playWebSpeech(currentCard.wordContent.normalizedWord);
    } else if (currentCard.itemType === 'MISTAKE' && currentCard.mistakeContent) {
      playWebSpeech(currentCard.mistakeContent.correct);
    }
  }, [currentCard]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        speakCurrentCard();
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!isFlipped && currentCard) {
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

  // Completion Screen (when all cards in this session are done)
  if (cards.length > 0 && currentIndex >= cards.length) {
    return (
      <div className={styles.container}>
        <div className={styles.completionCard}>
          <div className={styles.completionIcon}>🎉</div>
          <h2 className={styles.completionTitle}>Hoàn thành xuất sắc phiên ôn tập!</h2>
          <p className={styles.completionText}>
            Bạn đã ôn tập thành công <strong>{completedCount}</strong> thẻ trong ngày học hôm nay ({studyDate}).
            Kiên trì đều đặn 1 giờ mỗi ngày là chìa khóa đạt band 6.5!
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
        <div className={styles.studyDateBadge}>
          🗓️ Ngày học: <strong>{studyDate}</strong> (đổi ngày 04:00 AM)
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
          {currentCard.itemType === 'WORD' && currentCard.wordContent && (
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
                  Nhấn <kbd className={styles.kbd}>Space</kbd> để lật thẻ • Nhấn <kbd className={styles.kbd}>R</kbd> để nghe phát âm
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

          {currentCard.itemType === 'MISTAKE' && currentCard.mistakeContent && (
            <>
              <div className={styles.mistakeWrong}>
                ❌ {currentCard.mistakeContent.wrong}
              </div>

              {!isFlipped ? (
                <div className={styles.flipHint}>
                  Nhấn <kbd className={styles.kbd}>Space</kbd> để xem câu đúng • Nhấn <kbd className={styles.kbd}>R</kbd> để nghe phát âm câu đúng
                </div>
              ) : (
                <>
                  <div className={styles.backDivider} />

                  <div className={styles.backContent}>
                    <div className={styles.mistakeCorrect} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ flex: 1 }}>✅ {currentCard.mistakeContent.correct}</span>
                      <AudioButton
                        text={currentCard.mistakeContent.correct}
                        size="sm"
                        title="Nghe phát âm câu đúng (Phím R)"
                      />
                    </div>

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
          <button
            type="button"
            className={styles.flipBtn}
            onClick={() => setIsFlipped(true)}
          >
            Lật thẻ / Xem đáp án (<kbd className={styles.kbd}>Space</kbd>)
          </button>
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
