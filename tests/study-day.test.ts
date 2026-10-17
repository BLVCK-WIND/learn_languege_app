import { describe, it, expect, test } from 'vitest';
import { getStudyDate, addDaysToStudyDate } from '../src/lib/study-day';

describe('Study Day Calculator - UTC Arithmetic (docs/TECH_STACK.md Section 5)', () => {
  const boundaryScenarios = [
    {
      name: 'Ngay trước mốc 04:00 sáng (VN 03:59:59) -> thuộc ngày học cũ',
      utcInput: '2026-10-17T20:59:59.000Z',
      expectedDate: '2026-10-17',
    },
    {
      name: 'Đúng mốc 04:00 sáng (VN 04:00:00) -> chuyển sang ngày học mới',
      utcInput: '2026-10-17T21:00:00.000Z',
      expectedDate: '2026-10-18',
    },
    {
      name: 'Đêm giao thừa trước 04:00 sáng -> vẫn thuộc ngày và năm cũ',
      utcInput: '2026-12-31T20:59:59.000Z',
      expectedDate: '2026-12-31',
    },
    {
      name: 'Đúng 04:00 sáng ngày đầu năm mới -> chuyển sang năm mới',
      utcInput: '2026-12-31T21:00:00.000Z',
      expectedDate: '2027-01-01',
    },
    {
      name: 'Giữa trưa giờ VN (12:00:00 VN = 05:00:00 UTC) -> đúng ngày học hiện tại',
      utcInput: '2026-10-18T05:00:00.000Z',
      expectedDate: '2026-10-18',
    },
  ];

  test.each(boundaryScenarios)('$name', ({ utcInput, expectedDate }) => {
    const inputDate = new Date(utcInput);
    const result = getStudyDate(inputDate);
    expect(result).toBe(expectedDate);
  });

  const addDaysScenarios = [
    {
      name: 'Tịnh tiến 1 ngày bình thường',
      start: '2026-10-17',
      days: 1,
      expected: '2026-10-18',
    },
    {
      name: 'Tịnh tiến qua cuối tháng (31 ngày)',
      start: '2026-10-31',
      days: 1,
      expected: '2026-11-01',
    },
    {
      name: 'Tịnh tiến qua đêm giao thừa sang năm mới',
      start: '2026-12-31',
      days: 1,
      expected: '2027-01-01',
    },
    {
      name: 'Tịnh tiến năm nhuận (2028 là năm nhuận: 28 -> 29/02)',
      start: '2028-02-28',
      days: 1,
      expected: '2028-02-29',
    },
    {
      name: 'Tịnh tiến qua ngày nhuận (29/02 -> 01/03)',
      start: '2028-02-29',
      days: 1,
      expected: '2028-03-01',
    },
    {
      name: 'Tịnh tiến nhiều ngày (SRS interval 30 ngày)',
      start: '2026-05-15',
      days: 30,
      expected: '2026-06-14',
    },
  ];

  test.each(addDaysScenarios)('$name: $start + $days ngày = $expected', ({ start, days, expected }) => {
    expect(addDaysToStudyDate(start, days)).toBe(expected);
  });

  it('uses current time if no argument passed to getStudyDate', () => {
    const defaultResult = getStudyDate();
    expect(defaultResult).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
