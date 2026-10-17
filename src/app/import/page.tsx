'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './import.module.css';
import type { DryRunReport, ImportResult } from '@/types/import';

const SAMPLE_FIXTURE = `{
  "schemaVersion": 1,
  "session": {
    "week": 1,
    "day": 2,
    "seq": 1,
    "studiedAt": "2026-10-17T14:30:00.000Z",
    "checkpoint": "Xong: Hiện tại đơn, 2 từ B2 và nhận diện lỗi chia động từ"
  },
  "words": [
    {
      "word": "achieve",
      "pos": "verb",
      "ipa": "/əˈtʃiːv/",
      "meanings": [
        "đạt được, giành được mục tiêu sau nhiều nỗ lực"
      ],
      "sentences": [
        {
          "text": "I want to achieve band 6.5 within a year.",
          "translationVi": "Tôi muốn đạt được band 6.5 trong vòng một năm.",
          "targetForm": "achieve"
        },
        {
          "text": "She achieved remarkable success in her software engineering career.",
          "translationVi": "Cô ấy đã đạt được thành công đáng nể trong sự nghiệp công nghệ phần mềm.",
          "targetForm": "achieved"
        }
      ]
    },
    {
      "word": "consistent",
      "pos": "adj",
      "ipa": "/kənˈsɪs.tənt/",
      "meanings": [
        "nhất quán, kiên trì, không thay đổi"
      ],
      "sentences": [
        {
          "text": "Consistent practice for one hour every day is the key to IELTS success.",
          "translationVi": "Luyện tập nhất quán một giờ mỗi ngày là chìa khóa để đạt kết quả IELTS.",
          "targetForm": "Consistent"
        }
      ]
    }
  ],
  "mistakes": [
    {
      "wrong": "I sometime play game with my friend.",
      "correct": "I sometimes play games with my friends.",
      "category": "plural-s",
      "explanationVi": "'sometimes' luôn có 's' khi là trạng từ chỉ tần suất; 'game' và 'friend' là danh từ đếm được nên cần dùng số nhiều trong ngữ cảnh này."
    },
    {
      "wrong": "She do not understands the present simple tense.",
      "correct": "She does not understand the present simple tense.",
      "category": "subject-verb-agreement",
      "explanationVi": "Chủ ngữ ngôi thứ ba số ít 'She' đi với trợ động từ 'does'; sau trợ động từ phủ định 'does not', động từ chính giữ nguyên mẫu 'understand'."
    }
  ]
}`;

export default function ImportPage() {
  const [rawPayload, setRawPayload] = useState('');
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [commitResult, setCommitResult] = useState<ImportResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Re-mapping choices for unknown categories
  const [categoryMappings, setCategoryMappings] = useState<Record<string, string>>({});

  // Conflict handling choice: 'SUGGESTED_SEQ' | 'APPEND'
  const [conflictResolution, setConflictResolution] = useState<'SUGGESTED_SEQ' | 'APPEND'>('SUGGESTED_SEQ');

  const handleLoadSample = () => {
    setRawPayload(SAMPLE_FIXTURE);
    setReport(null);
    setCommitResult(null);
    setCommitError(null);
  };

  const handleClear = () => {
    setRawPayload('');
    setReport(null);
    setCommitResult(null);
    setCommitError(null);
  };

  const handleDryRun = async () => {
    if (!rawPayload.trim()) return;

    setIsDryRunning(true);
    setReport(null);
    setCommitResult(null);
    setCommitError(null);

    try {
      const res = await fetch('/api/import/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawPayload }),
      });

      const data: DryRunReport = await res.json();
      setReport(data);

      // Pre-initialize mappings if needed
      if (data.pendingMappings?.length > 0) {
        const initialMap: Record<string, string> = {};
        data.pendingMappings.forEach((m) => {
          if (!initialMap[m.unknownCategory]) {
            initialMap[m.unknownCategory] = m.suggestedOptions[0]?.code ?? 'other';
          }
        });
        setCategoryMappings(initialMap);
      }
    } catch (err) {
      setCommitError(`Lỗi kết nối kiểm tra: ${(err as Error).message}`);
    } finally {
      setIsDryRunning(false);
    }
  };

  const handleCommit = async () => {
    if (!rawPayload.trim() || !report?.isValid) return;

    setIsCommitting(true);
    setCommitError(null);

    try {
      const options: {
        categoryMappings?: Record<string, string>;
        overrideSeq?: number;
        mergeMode?: 'APPEND' | 'NEW_SESSION';
      } = {
        categoryMappings,
      };

      if (report.sessionConflict) {
        if (conflictResolution === 'SUGGESTED_SEQ') {
          options.overrideSeq = report.sessionConflict.suggestedSeq;
        } else {
          options.mergeMode = 'APPEND';
        }
      }

      const res = await fetch('/api/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawPayload, options }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Commit thất bại');
      }

      setCommitResult(data);
    } catch (err) {
      setCommitError(`Lỗi lưu vào CSDL: ${(err as Error).message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const isMappingComplete =
    !report?.pendingMappings ||
    report.pendingMappings.every((m) => !!categoryMappings[m.unknownCategory]);

  return (
    <main className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Nhập liệu Buổi học (Daily Session Import)</h1>
        <p className={styles.subtitle}>
          Dán chuỗi JSON xuất từ AI Tutor để kiểm tra đối soát (Dry-run) và lưu nguyên tử vào kho dữ liệu trung tâm.
        </p>
      </div>

      {/* Input Form */}
      <section className={styles.card}>
        <div className={styles.cardTitle}>
          <span>Dữ liệu JSON Buổi học</span>
          <div className={styles.buttonGroup}>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={handleLoadSample}
              disabled={isDryRunning || isCommitting}
            >
              Tải dữ liệu mẫu IELTS
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={handleClear}
              disabled={isDryRunning || isCommitting}
            >
              Xóa
            </button>
          </div>
        </div>

        <textarea
          className={styles.textarea}
          value={rawPayload}
          onChange={(e) => setRawPayload(e.target.value)}
          placeholder="Dán nội dung JSON buổi học tại đây..."
          disabled={isDryRunning || isCommitting}
        />

        <div className={styles.actionsBar}>
          <div />
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={handleDryRun}
            disabled={!rawPayload.trim() || isDryRunning || isCommitting}
          >
            {isDryRunning ? 'Đang kiểm tra...' : 'Kiểm tra trước (Dry-run)'}
          </button>
        </div>
      </section>

      {/* Commit Error Alert */}
      {commitError && (
        <div className={`${styles.alert} ${styles.alertDanger}`}>
          <strong>Lỗi:</strong> {commitError}
        </div>
      )}

      {/* Dry Run Errors */}
      {report && !report.isValid && (
        <section className={styles.card}>
          <div className={`${styles.alert} ${styles.alertDanger}`}>
            <strong>Phát hiện lỗi định dạng JSON hoặc Schema:</strong>
            <ul className={styles.list}>
              {report.errors?.map((err, idx) => (
                <li key={idx}>
                  <code>{err.path}</code>: {err.message}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Dry Run Results */}
      {report && report.isValid && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Kết quả Đối soát (Diff Report)</h2>

          {/* Skipped Notice */}
          {report.isSkipped && (
            <div className={`${styles.alert} ${styles.alertSuccess}`}>
              Buổi học này đã được import đầy đủ trước đó (trùng khớp contentHash). Không cần lưu lại.
            </div>
          )}

          {/* Summary Stats Grid */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>+{report.summary.addedWordsCount}</div>
              <div className={styles.statLabel}>Từ mới</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{report.summary.mergedWordsCount}</div>
              <div className={styles.statLabel}>Từ gộp</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>+{report.summary.newSentencesCount}</div>
              <div className={styles.statLabel}>Câu ví dụ mới</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>+{report.summary.addedMistakesCount}</div>
              <div className={styles.statLabel}>Lỗi sai mới</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{report.summary.reappearedMistakesCount}</div>
              <div className={styles.statLabel}>Lỗi lặp lại</div>
            </div>
            {report.summary.skippedMistakesCount > 0 && (
              <div className={styles.statCard}>
                <div className={styles.statValue}>{report.summary.skippedMistakesCount}</div>
                <div className={styles.statLabel}>Lỗi trùng trong file</div>
              </div>
            )}
            <div className={styles.statCard}>
              <div className={styles.statValue}>{report.summary.warningCount}</div>
              <div className={styles.statLabel}>Cảnh báo</div>
            </div>
          </div>

          {/* Warnings List */}
          {report.warnings.length > 0 && (
            <div className={`${styles.alert} ${styles.alertWarning}`}>
              <strong>Cảnh báo đối soát:</strong>
              <ul className={styles.list}>
                {report.warnings.map((w, idx) => (
                  <li key={idx}>
                    <code>{w.path}</code>: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Unknown Mistake Categories Re-mapping */}
          {report.pendingMappings.length > 0 && (
            <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <h3>Ánh xạ Mã Lỗi Lạ ({report.pendingMappings.length})</h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                Gia sư AI xuất ra một số mã lỗi không nằm trong 13 mã chuẩn. Vui lòng chọn ánh xạ về mã chuẩn phù hợp:
              </p>
              {report.pendingMappings.map((item, idx) => (
                <div key={idx} className={styles.mappingItem}>
                  <div className={styles.mappingSentence}>
                    Câu sai: &ldquo;{item.wrongText}&rdquo;
                  </div>
                  <div className={styles.mappingRow}>
                    <span>
                      Mã lạ: <strong>{item.unknownCategory}</strong> &rarr;
                    </span>
                    <select
                      className={styles.select}
                      value={categoryMappings[item.unknownCategory] || item.suggestedOptions[0]?.code}
                      onChange={(e) =>
                        setCategoryMappings({
                          ...categoryMappings,
                          [item.unknownCategory]: e.target.value,
                        })
                      }
                    >
                      {item.suggestedOptions.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.label} ({opt.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Session Conflict Resolver */}
          {report.sessionConflict && (
            <div className={`${styles.alert} ${styles.alertWarning}`}>
              <strong>Xung đột khóa Session:</strong>
              <p style={{ margin: 'var(--space-2) 0' }}>
                Đã tồn tại một buổi học cùng Week, Day và Seq trong CSDL. Bạn muốn xử lý như thế nào?
              </p>
              <div className={styles.radioGroup}>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="conflictResolution"
                    value="SUGGESTED_SEQ"
                    checked={conflictResolution === 'SUGGESTED_SEQ'}
                    onChange={() => setConflictResolution('SUGGESTED_SEQ')}
                  />
                  Tăng số thứ tự thành Seq {report.sessionConflict.suggestedSeq} (Tạo phiên học bổ sung riêng biệt)
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="conflictResolution"
                    value="APPEND"
                    checked={conflictResolution === 'APPEND'}
                    onChange={() => setConflictResolution('APPEND')}
                  />
                  Gộp bổ sung (Merge & Append vào phiên học hiện tại)
                </label>
              </div>
            </div>
          )}

          {/* Commit Button */}
          {!report.isSkipped && !commitResult && (
            <div style={{ marginTop: 'var(--space-6)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonSuccess}`}
                onClick={handleCommit}
                disabled={!isMappingComplete || isCommitting}
              >
                {isCommitting ? 'Đang lưu vào kho...' : 'Xác nhận Lưu vào Kho CSDL'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Success Commit Banner */}
      {commitResult && (
        <section className={styles.card}>
          <div className={`${styles.alert} ${styles.alertSuccess}`}>
            <h3 style={{ margin: '0 0 var(--space-2) 0' }}>Lưu Buổi học Thành công! 🎉</h3>
            <p style={{ margin: 0 }}>
              Dữ liệu đã được ghi nguyên tử vào CSDL (Batch ID: <code>{commitResult.importBatchId}</code>).
            </p>
            <ul className={styles.list}>
              <li>Số từ vựng mới: {commitResult.stats.wordsCreated}</li>
              <li>Số từ vựng gộp: {commitResult.stats.wordsMerged}</li>
              <li>Số câu ví dụ mới: {commitResult.stats.sentencesCreated}</li>
              <li>Số lỗi sai mới: {commitResult.stats.mistakesCreated}</li>
              <li>Số thẻ ôn tập SRS đã khởi tạo: {commitResult.stats.reviewStatesCreated}</li>
            </ul>
          </div>
          <div className={styles.buttonGroup} style={{ marginTop: 'var(--space-4)' }}>
            <Link href="/vocab" className={`${styles.button} ${styles.buttonPrimary}`}>
              Xem Kho Từ vựng
            </Link>
            <Link href="/mistakes" className={`${styles.button} ${styles.buttonSecondary}`}>
              Xem Sổ tay Lỗi sai
            </Link>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={handleClear}
            >
              Nhập buổi học khác
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
