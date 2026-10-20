'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import styles from './dashboard.module.css';
import type { DashboardSummaryDTO } from '@/types/analytics';
import { AudioButton } from '@/components/AudioButton';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || 'Lỗi khi tải dữ liệu thống kê');
      }
    } catch {
      setError('Không thể kết nối đến máy chủ local');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>Đang tải dữ liệu phân tích IELTS...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <h3>Lỗi tải dữ liệu</h3>
          <p>{error || 'Không tìm thấy dữ liệu'}</p>
          <button type="button" className={styles.primaryLink} onClick={fetchAnalytics}>
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  const hasData =
    data.totalWords > 0 ||
    data.totalMistakesCount > 0 ||
    data.totalMistakeOccurrences > 0;

  if (!hasData) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h1>Dashboard Thống kê & Phân tích IELTS</h1>
            <p className={styles.subtitle}>
              Theo dõi tần suất lỗi thực tế, xu hướng tiến bộ và top lỗi thường gặp
            </p>
          </div>
        </div>
        <div className={styles.emptyState}>
          <h3>Chưa có dữ liệu học tập</h3>
          <p>
            Bạn chưa có buổi học nào trong hệ thống. Hãy nhập bài học từ AI tutor để bắt
            đầu theo dõi các chỉ số phân tích chuyên sâu!
          </p>
          <Link href="/import" className={styles.primaryLink}>
            Đến trang Nhập liệu (Import)
          </Link>
        </div>
      </div>
    );
  }

  // Calculate maximum mistakes in a single week for chart height scaling
  const maxWeeklyMistakes = Math.max(
    1,
    ...data.weeklyTrends.map((t) => t.totalMistakes)
  );

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Dashboard Thống kê & Phân tích IELTS</h1>
          <p className={styles.subtitle}>
            Phân tích số liệu thực tế qua các buổi học, xu hướng lỗi và điểm cần cải thiện
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={fetchAnalytics}
            title="Làm mới dữ liệu"
          >
            🔄 Làm mới
          </button>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={`${styles.metricIcon} ${styles.iconBlue}`}>📚</div>
          <div className={styles.metricContent}>
            <span className={styles.metricValue}>{data.totalWords}</span>
            <span className={styles.metricLabel}>Từ vựng đang học</span>
            <span className={styles.metricSubtext}>Thẻ từ vựng active</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIcon} ${styles.iconAmber}`}>📝</div>
          <div className={styles.metricContent}>
            <span className={styles.metricValue}>{data.totalMistakesCount}</span>
            <span className={styles.metricLabel}>Mẫu câu lỗi độc nhất</span>
            <span className={styles.metricSubtext}>Bảng Mistake (Unique)</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIcon} ${styles.iconRed}`}>⚠️</div>
          <div className={styles.metricContent}>
            <span className={styles.metricValue}>{data.totalMistakeOccurrences}</span>
            <span className={styles.metricLabel}>Lượt mắc lỗi thực tế</span>
            <span className={styles.metricSubtext}>Tính theo SessionItem (ADR)</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIcon} ${styles.iconGreen}`}>🎯</div>
          <div className={styles.metricContent}>
            <span className={styles.metricValue}>{data.totalSessions}</span>
            <span className={styles.metricLabel}>Buổi học hoàn thành</span>
            <span className={styles.metricSubtext}>Lộ trình học AI tutor</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Top 5 Categories & Weekly Trend Chart */}
      <div className={styles.mainGrid}>
        {/* Top 5 Categories */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h2>
              <span>📊</span> Top 5 Nhóm Lỗi Hay Mắc Nhất
            </h2>
            <span className={styles.sectionSubtitle}>
              Xếp hạng theo lượt mắc thực tế
            </span>
          </div>

          {data.topCategories.length === 0 ? (
            <p className={styles.subtitle}>Chưa ghi nhận lỗi nào qua các buổi học.</p>
          ) : (
            <div className={styles.categoryList}>
              {data.topCategories.map((cat, idx) => (
                <div key={cat.category} className={styles.categoryItem}>
                  <div className={styles.categoryMeta}>
                    <div className={styles.categoryLabelGroup}>
                      <span className={styles.categoryRank}>#{idx + 1}</span>
                      <span className={styles.categoryName}>{cat.categoryLabel}</span>
                      <span className={styles.categoryCode}>({cat.category})</span>
                    </div>
                    <div className={styles.categoryCountsGroup}>
                      <span className={styles.categoryCount}>{cat.count} lần</span>
                      <span className={styles.categoryPercentage}>
                        ({cat.percentage}%)
                      </span>
                    </div>
                  </div>
                  <div className={styles.progressBarContainer}>
                    <div
                      className={styles.progressBarFill}
                      style={{ width: `${Math.min(100, Math.max(5, cat.percentage))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weekly Trend Bar Chart */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h2>
              <span>📈</span> Xu Hướng Lỗi Theo Tuần
            </h2>
            <span className={styles.sectionSubtitle}>
              Số lỗi phát sinh qua từng tuần (SessionItem)
            </span>
          </div>

          {data.weeklyTrends.length === 0 ? (
            <p className={styles.subtitle}>Chưa có dữ liệu theo tuần.</p>
          ) : (
            <div className={styles.chartContainer}>
              <div className={styles.chartBarsArea}>
                {data.weeklyTrends.map((trend) => {
                  const barHeightPercent = Math.max(
                    8,
                    Math.round((trend.totalMistakes / maxWeeklyMistakes) * 100)
                  );
                  return (
                    <div key={trend.week} className={styles.chartCol}>
                      <span className={styles.chartBarValue}>{trend.totalMistakes}</span>
                      <div
                        className={styles.chartBar}
                        style={{ height: `${barHeightPercent}%` }}
                        title={`Tuần ${trend.week}: ${trend.totalMistakes} lỗi`}
                      />
                      <span className={styles.chartBarLabel}>T.{trend.week}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full-width Grid: Top Repeated Mistakes & Recent Mistakes */}
      <div className={styles.fullWidthGrid}>
        {/* Top 5 Repeated Mistakes */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h2>
              <span>🔁</span> Top 5 Câu Lỗi Lặp Lại Nhiều Nhất
            </h2>
            <span className={styles.sectionSubtitle}>Cần chú ý ôn tập kỹ</span>
          </div>

          {data.topMistakes.length === 0 ? (
            <p className={styles.subtitle}>Chưa có câu lỗi nào lặp lại.</p>
          ) : (
            <div className={styles.topMistakesList}>
              {data.topMistakes.map((mistake) => (
                <div key={mistake.mistakeId} className={styles.topMistakeCard}>
                  <div className={styles.topMistakeHeader}>
                    <span className={styles.topMistakeCategory}>
                      {mistake.categoryLabel}
                    </span>
                    <span className={styles.freqBadge}>
                      Đã lặp lại: {mistake.frequency} lần
                    </span>
                  </div>
                  <div className={`${styles.sentenceSnippet} ${styles.wrongSnippet}`}>
                    ❌ {mistake.wrong}
                  </div>
                  <div className={`${styles.sentenceSnippet} ${styles.correctSnippet}`}>
                    <span>✅ {mistake.correct}</span>
                    <AudioButton text={mistake.correct} size="sm" title="Nghe phát âm" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Mistakes */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h2>
              <span>🕒</span> Lỗi Ghi Nhận Gần Đây
            </h2>
            <span className={styles.sectionSubtitle}>Từ các buổi học mới nhất</span>
          </div>

          {data.recentMistakes.length === 0 ? (
            <p className={styles.subtitle}>Chưa có lỗi nào được ghi nhận gần đây.</p>
          ) : (
            <div className={styles.recentList}>
              {data.recentMistakes.map((recent) => (
                <div key={`${recent.id}-${recent.week}-${recent.day}`} className={styles.recentCard}>
                  <div className={styles.recentMeta}>
                    <span className={styles.recentSessionBadge}>
                      Tuần {recent.week}, Ngày {recent.day} (Buổi {recent.seq})
                    </span>
                    <span>{new Date(recent.studiedAt).toLocaleDateString('vi-VN')}</span>
                  </div>
                  <div className={`${styles.sentenceSnippet} ${styles.wrongSnippet}`}>
                    ❌ {recent.wrong}
                  </div>
                  <div className={`${styles.sentenceSnippet} ${styles.correctSnippet}`}>
                    <span>✅ {recent.correct}</span>
                    <AudioButton text={recent.correct} size="sm" title="Nghe phát âm" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
