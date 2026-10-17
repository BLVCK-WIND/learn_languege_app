'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import styles from './mistakes.module.css';
import type { MistakeItemDTO, MistakeListResponse } from '@/types/mistake';
import { MISTAKE_CATEGORY_LABELS, type MistakeCategoryType } from '@/types/import';

export default function MistakesPage() {
  const [data, setData] = useState<MistakeListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Soft delete modal state
  const [deletingItem, setDeletingItem] = useState<MistakeItemDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMistakes = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('q', search.trim());
      if (category !== 'all') query.set('category', category);
      query.set('page', String(page));
      query.set('pageSize', '20');

      const res = await fetch(`/api/mistakes?${query.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setFeedback({ type: 'error', message: json.error || 'Lỗi khi tải sổ tay lỗi sai' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Không thể kết nối đến máy chủ local' });
    } finally {
      setLoading(false);
    }
  }, [search, category, page]);

  useEffect(() => {
    fetchMistakes();
  }, [fetchMistakes]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCategory(e.target.value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setCategory('all');
    setPage(1);
  };

  const confirmSoftDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/mistakes/${deletingItem.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        setFeedback({
          type: 'success',
          message: 'Đã xóa mềm lỗi sai thành công',
        });
        setDeletingItem(null);
        await fetchMistakes();
      } else {
        setFeedback({ type: 'error', message: json.error || 'Lỗi khi xóa lỗi sai' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Lỗi kết nối khi xóa lỗi sai' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Sổ tay Nhật ký Lỗi sai</h1>
          <p className={styles.subtitle}>
            Ghi nhận và phân tích các lỗi ngữ pháp, dùng từ thực tế từ các buổi học với AI tutor
          </p>
        </div>
        {data && (
          <div className={styles.statsBadge}>
            <span>⚠️ Tổng số lỗi:</span>
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
          placeholder="Tìm theo câu sai, câu đúng, giải thích..."
          value={search}
          onChange={handleSearchChange}
        />
        <select
          className={styles.categorySelect}
          value={category}
          onChange={handleCategoryChange}
        >
          <option value="all">Tất cả danh mục (13 nhóm lỗi)</option>
          {Object.entries(MISTAKE_CATEGORY_LABELS).map(([catKey, label]) => (
            <option key={catKey} value={catKey}>
              {label} ({catKey})
            </option>
          ))}
        </select>
        {(search || category !== 'all') && (
          <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
            Đặt lại bộ lọc
          </button>
        )}
      </div>

      {/* Main Content */}
      {loading ? (
        <div className={styles.emptyState}>
          <p>Đang tải danh sách lỗi sai...</p>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>Chưa có lỗi sai nào</h3>
          <p>
            {search || category !== 'all'
              ? 'Không tìm thấy lỗi sai nào phù hợp với bộ lọc tìm kiếm.'
              : 'Sổ tay hiện đang trống. Hãy nhập bài học mới từ AI tutor để theo dõi các lỗi cần khắc phục!'}
          </p>
          {!search && category === 'all' && (
            <Link href="/import" className={styles.primaryLink}>
              Đến trang Nhập liệu (Import)
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className={styles.cardList}>
            {data.items.map((mistake) => {
              const categoryLabel =
                MISTAKE_CATEGORY_LABELS[mistake.category as MistakeCategoryType] ||
                mistake.category;
              const isHighFrequency = mistake.frequency >= 2;

              return (
                <div key={mistake.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.metaWrap}>
                      <span className={styles.categoryBadge} title={mistake.category}>
                        {categoryLabel}
                      </span>
                      {mistake.subCategory && (
                        <span className={styles.subCategoryBadge}>
                          {mistake.subCategory}
                        </span>
                      )}
                      <span
                        className={`${styles.freqBadge} ${
                          isHighFrequency ? styles.freqHigh : ''
                        }`}
                        title="Số lần ghi nhận qua các buổi học (tính theo SessionItem)"
                      >
                        Đã gặp: {mistake.frequency} lần
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => setDeletingItem(mistake)}
                      title="Xóa mềm lỗi sai"
                    >
                      🗑️ Xóa mềm
                    </button>
                  </div>

                  {/* Comparison Box */}
                  <div className={styles.comparisonBox}>
                    <div className={`${styles.sentenceRow} ${styles.wrongRow}`}>
                      <span className={styles.sentenceIcon}>❌</span>
                      <span className={styles.sentenceText}>{mistake.wrong}</span>
                    </div>
                    <div className={`${styles.sentenceRow} ${styles.correctRow}`}>
                      <span className={styles.sentenceIcon}>✅</span>
                      <span className={styles.sentenceText}>{mistake.correct}</span>
                    </div>
                  </div>

                  {/* Explanation */}
                  <div className={styles.explanationBox}>
                    <div className={styles.explanationTitle}>💡 Giải thích chi tiết:</div>
                    <div>{mistake.explanationVi}</div>
                  </div>

                  {/* SRS Footer */}
                  <div className={styles.cardFooter}>
                    <div className={styles.srsBadges}>
                      {mistake.reviewState ? (
                        <>
                          <span className={styles.srsBadge}>
                            🔁 Lần ôn: {mistake.reviewState.repetitions}
                          </span>
                          <span className={styles.srsBadge}>
                            📅 Cách quãng: {mistake.reviewState.interval} ngày
                          </span>
                          <span className={styles.srsBadge}>
                            ⭐ EF: {mistake.reviewState.easeFactor.toFixed(2)}
                          </span>
                          <span className={styles.srsBadge}>
                            ⏰ Hạn ôn: {mistake.reviewState.dueDate}
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
              );
            })}
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
                Trang {data.page} / {data.totalPages} (Tổng {data.total} lỗi)
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
            <h3 className={styles.modalTitle}>Xác nhận xóa mềm lỗi sai</h3>
            <p className={styles.modalBody}>
              Bạn có chắc chắn muốn xóa lỗi sai này khỏi sổ tay?
              <br />
              <br />
              <strong>Câu sai:</strong> &ldquo;{deletingItem.wrong}&rdquo;
              <br />
              <br />
              Lỗi sai sẽ được ẩn khỏi danh sách và hàng đợi ôn tập flashcard.
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
