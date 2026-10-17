/**
 * Module tính ngày học (Study Day Calculator)
 * Sử dụng số học UTC thuần túy để loại bỏ 100% rủi ro phụ thuộc vào múi giờ máy trạm.
 * Múi giờ Việt Nam: UTC+7 (+7h)
 * Mốc đổi ngày học: 04:00 AM (-4h)
 * Độ lệch ròng: +7 - 4 = +3 giờ (10,800,000 ms)
 * Đặc tả: docs/TECH_STACK.md Section 5
 */

export const NET_OFFSET_MS = (7 - 4) * 3600 * 1000; // +3 giờ = 10,800,000 ms

/**
 * Trả về chuỗi ngày học YYYY-MM-DD theo giờ VN với mốc đổi ngày 04:00 AM.
 * Hoàn toàn không phụ thuộc vào múi giờ cài đặt trên máy người dùng.
 */
export function getStudyDate(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + NET_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Tịnh tiến chuỗi ngày học YYYY-MM-DD thêm số ngày tương ứng.
 * Sử dụng UTC arithmetic thuần túy để triệt tiêu ảnh hưởng của múi giờ địa phương.
 */
export function addDaysToStudyDate(studyDate: string, days: number): string {
  const [y, m, d] = studyDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const nextY = date.getUTCFullYear();
  const nextM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const nextD = String(date.getUTCDate()).padStart(2, '0');
  return `${nextY}-${nextM}-${nextD}`;
}
