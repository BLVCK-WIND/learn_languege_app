'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import styles from './vocab.module.css';
import type { VocabItemDTO, VocabListResponse } from '@/types/vocab';
import { AudioButton } from '@/components/AudioButton';

const POS_OPTIONS = [
  { value: 'all', label: 'Tất cả từ loại' },
  { value: 'noun', label: 'Danh từ (noun)' },
  { value: 'verb', label: 'Động từ (verb)' },
  { value: 'adj', label: 'Tính từ (adj)' },
  { value: 'adv', label: 'Trạng từ (adv)' },
  { value: 'phrase', label: 'Cụm từ (phrase)' },
  { value: 'preposition', label: 'Giới từ (preposition)' },
  { value: 'conjunction', label: 'Liên từ (conjunction)' },
  { value: 'pronoun', label: 'Đại từ (pronoun)' },
  { value: 'determiner', label: 'Từ hạn định (determiner)' },
  { value: 'interjection', label: 'Thán từ (interjection)' },
];

export default function VocabPage() {
  const [data, setData] = useState<VocabListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState('all');
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Soft delete modal state
  const [deletingItem, setDeletingItem] = useState<VocabItemDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchVocab = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('q', search.trim());
      if (pos !== 'all') query.set('pos', pos);
      query.set('page', String(page));
      query.set('pageSize', '20');

      const res = await fetch(`/api/vocab?${query.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setFeedback({ type: 'error', message: json.error || 'Lỗi khi tải từ vựng' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Không thể kết nối đến máy chủ local' });
    } finally {
      setLoading(false);
    }
  }, [search, pos, page]);

  useEffect(() => {
    fetchVocab();
  }, [fetchVocab]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handlePosChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPos(e.target.value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setPos('all');
    setPage(1);
  };

  const confirmSoftDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/vocab/${deletingItem.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        setFeedback({
          type: 'success',
          message: `Đã xóa mềm từ "${deletingItem.normalizedWord}" (${deletingItem.pos}) thành công`,
        });
        setDeletingItem(null);
        await fetchVocab();
      } else {
        setFeedback({ type: 'error', message: json.error || 'Lỗi khi xóa từ vựng' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Lỗi kết nối khi xóa từ vựng' });
    } finally {
      setIsDeleting(false);
    }
  };

  const renderPosBadge = (itemPos: string) => {
    let className = styles.posOther;
    if (itemPos === 'noun') className = styles.posNoun;
    else if (itemPos === 'verb') className = styles.posVerb;
    else if (itemPos === 'adj') className = styles.posAdj;
    else if (itemPos === 'adv') className = styles.posAdv;

    return <span className={`${styles.posBadge} ${className}`}>{itemPos}</span>;
  };

  const renderSentenceWithHighlight = (text: string, targetForm: string | null) => {
    if (!targetForm || !text.toLowerCase().includes(targetForm.toLowerCase())) {
      return text;
    }

    const regex = new RegExp(`(${targetForm})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (part.toLowerCase() === targetForm.toLowerCase()) {
        return (
          <span key={index} className={styles.highlightTarget}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Thư viện Từ vựng</h1>
          <p className={styles.subtitle}>
            Kho dữ liệu trung tâm lưu trữ toàn bộ từ vựng, phiên âm, nghĩa tiếng Việt và câu ví dụ
          </p>
        </div>
        {data && (
          <div className={styles.statsBadge}>
            <span>📚 Tổng số từ:</span>
            <strong>{data.total}</strong>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`${styles.feedbackAlert} ${
            feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Tìm kiếm từ vựng (ví dụ: achieve, consistent)..."
          value={search}
          onChange={handleSearchChange}
        />
        <select className={styles.posSelect} value={pos} onChange={handlePosChange}>
          {POS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {(search || pos !== 'all') && (
          <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
            Đặt lại bộ lọc
          </button>
        )}
      </div>

      {/* Main Content */}
      {loading ? (
        <div className={styles.emptyState}>
          <p>Đang tải danh sách từ vựng...</p>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>Chưa có từ vựng nào</h3>
          <p>
            {search || pos !== 'all'
              ? 'Không tìm thấy từ vựng nào phù hợp với bộ lọc tìm kiếm.'
              : 'Thư viện hiện đang trống. Hãy nhập bài học mới từ AI tutor để bắt đầu tích lũy vốn từ!'}
          </p>
          {!search && pos === 'all' && (
            <Link href="/import" className={styles.primaryLink}>
              Đến trang Nhập liệu (Import)
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className={styles.cardList}>
            {data.items.map((word) => (
              <div key={word.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.wordTitleWrap}>
                    <span className={styles.wordText}>{word.normalizedWord}</span>
                    {renderPosBadge(word.pos)}
                    {word.ipa && <span className={styles.ipa}>{word.ipa}</span>}
                    <AudioButton
                      text={word.normalizedWord}
                      size="sm"
                      title={`Nghe phát âm từ "${word.normalizedWord}"`}
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => setDeletingItem(word)}
                    title="Xóa mềm từ vựng"
                  >
                    🗑️ Xóa mềm
                  </button>
                </div>

                {/* Meanings */}
                {word.meanings.length > 0 && (
                  <div className={styles.meaningsSection}>
                    <ul className={styles.meaningsList}>
                      {word.meanings.map((m) => (
                        <li key={m.id}>
                          <span>{m.meaningVi}</span>
                          {m.context && (
                            <span className={styles.contextTag}>({m.context})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Sentences */}
                {word.sentences.length > 0 && (
                  <div className={styles.sentencesSection}>
                    {word.sentences.map((sentence) => (
                      <div key={sentence.id} className={styles.sentenceItem}>
                        <div className={styles.sentenceEn} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <AudioButton
                            text={sentence.text}
                            size="sm"
                            title="Nghe phát âm câu ví dụ"
                          />
                          <span>{renderSentenceWithHighlight(sentence.text, sentence.targetForm)}</span>
                        </div>
                        <div className={styles.sentenceVi}>{sentence.translationVi}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* SRS Footer */}
                <div className={styles.cardFooter}>
                  <div className={styles.srsBadges}>
                    {word.reviewState ? (
                      <>
                        <span className={styles.srsBadge}>
                          🔁 Lần ôn: {word.reviewState.repetitions}
                        </span>
                        <span className={styles.srsBadge}>
                          📅 Cách quãng: {word.reviewState.interval} ngày
                        </span>
                        <span className={styles.srsBadge}>
                          ⭐ EF: {word.reviewState.easeFactor.toFixed(2)}
                        </span>
                        <span className={styles.srsBadge}>
                          ⏰ Hạn ôn: {word.reviewState.dueDate}
                        </span>
                      </>
                    ) : (
                      <span className={`${styles.srsBadge} ${styles.newBadge}`}>
                        ✨ Thẻ mới (Chưa ôn tập)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Trang trước
              </button>
              <span className={styles.pageInfo}>
                Trang {data.page} / {data.totalPages} (Tổng {data.total} từ)
              </span>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              >
                Trang sau →
              </button>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Xác nhận xóa mềm từ vựng</h3>
            <p className={styles.modalBody}>
              Bạn có chắc chắn muốn xóa từ vựng <strong>&ldquo;{deletingItem.normalizedWord}&rdquo;</strong> (
              <em>{deletingItem.pos}</em>)?
              <br />
              <br />
              Từ vựng này cùng các nghĩa và câu ví dụ sẽ được ẩn khỏi thư viện và danh sách ôn tập.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setDeletingItem(null)}
                disabled={isDeleting}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className={styles.confirmDeleteBtn}
                onClick={confirmSoftDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
