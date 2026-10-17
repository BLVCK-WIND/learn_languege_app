# ĐẶC TẢ CÔNG NGHỆ (TECH STACK SPECIFICATION)

## 1. Danh mục Công nghệ & Phiên bản Ghim Cứng (Pinned Versions)
*(Các phiên bản dưới đây đã được kiểm tra thực tế từ npm registry và môi trường máy trạm ngày 17/10/2026)*

| Công nghệ / Thư viện | Phiên bản ghim | Vai trò | Lý do lựa chọn kỹ thuật |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v22.19.0` (LTS) | Runtime môi trường máy | Phiên bản Active LTS hiện hành trên máy local, tối ưu hiệu năng V8, hỗ trợ đầy đủ ESM và Web standard APIs. |
| **TypeScript** | `^5.6.0` | Ngôn ngữ phát triển | Đảm bảo tính Type-safe nghiêm ngặt (`strict: true`), chia sẻ type 100% giữa tầng Service, Model và Giao diện. |
| **Next.js** | `16.4.2` (App Router) | Full-stack Web Framework | Phiên bản ổn định mới nhất; tích hợp sẵn Route Handlers, Server Components, tối ưu streaming và routing local-first. |
| **Prisma ORM** | `7.10.1` | Truy cập dữ liệu (ORM) | Bản phát hành ổn định (Stable) cao nhất trước v8-rc; hỗ trợ hoàn hảo SQLite, migration có thể kiểm soát và Prisma Client type-safe. |
| **Zod** | `4.6.7` | Schema Validation | Bản stable mới nhất; kiểm thực cấu trúc JSON import, dữ liệu DTO và đảm bảo an toàn kiểu dữ liệu runtime. |
| **Vitest** | `5.0.5` | Framework kiểm thử tự động | Tốc độ chạy cực nhanh trên Vite engine, hỗ trợ ESM/TypeScript native, tương thích 1:1 với cú pháp Jest, hỗ trợ Table-driven tests mạnh mẽ. |
| **Styling** | CSS Modules + CSS Variables | Giao diện người dùng | Xem chi tiết tại Mục 6 bên dưới. |

---

## 2. Kiến trúc Phân tầng & Quy ước Thư mục

### 2.1. Cấu trúc thư mục chuẩn
```text
learn_languege_app/
├── docs/                   # Toàn bộ tài liệu đặc tả kiến trúc (Spec)
├── prisma/
│   ├── schema.prisma       # Lược đồ cơ sở dữ liệu SQLite
│   └── migrations/         # Lịch sử các bản migration
├── scripts/                # Script bảo trì, sao lưu, migration viết bằng Node.js
│   ├── backup.ts           # Sao lưu an toàn bằng VACUUM INTO
│   └── migrate.ts          # Bộ bao bọc an toàn trước khi chạy prisma migrate
├── src/
│   ├── app/                # Next.js App Router (Giao diện & Route Handlers)
│   │   ├── api/            # API Route Handlers (chỉ nhận request, gọi service)
│   │   ├── import/         # Trang Import JSON
│   │   ├── vocab/          # Trang Thư viện từ vựng
│   │   ├── mistakes/       # Trang Nhật ký lỗi sai
│   │   ├── review/         # Trang Ôn tập SRS Flashcard
│   │   └── dashboard/      # Trang Thống kê IELTS
│   ├── components/         # UI Components tái sử dụng (kèm file .module.css)
│   ├── lib/                # Tiện ích cốt lõi & hàm thuần (Pure Functions)
│   │   ├── prisma.ts       # Singleton Prisma Client
│   │   ├── study-day.ts    # Module duy nhất tính ngày học (UTC+7, mốc 04:00)
│   │   ├── crypto/         # Hàm băm chuẩn hóa (Sentence & Mistake hashes)
│   │   └── srs/            # Thuật toán Modified SM-2 (Pure functions)
│   ├── services/           # Nghiệp vụ lõi (Business Logic & Transactions)
│   │   ├── import.service.ts
│   │   ├── review.service.ts
│   │   ├── vocab.service.ts
│   │   └── backup.service.ts
│   └── types/              # Định nghĩa Types & Zod Schemas
├── data/                   # Nằm ngoài public (bị .gitignore bỏ qua)
│   ├── app.db              # File SQLite chính
│   ├── backups/            # Bản sao lưu SQLite (.db) và JSON export
│   └── audio/              # File mp3 tải về từ DictionaryAPI / edge-tts
└── tests/                  # Bộ kiểm thử tự động (Unit & Integration tests)
```

### 2.2. Quy ước phân tầng nghiêm ngặt (Layer Conventions)
1. **Route Handlers (`src/app/api/...`):**
   - Chỉ đảm nhận: Parse HTTP request, kiểm thực dữ liệu đầu vào qua Zod schema, gọi hàm tương ứng tại tầng Service, trả về HTTP response với status code chuẩn.
   - **Tuyệt đối không chứa logic nghiệp vụ** và không gọi trực tiếp các câu lệnh Prisma phức tạp tại đây.
2. **Service Layer (`src/services/...`):**
   - Nơi tập trung toàn bộ quy tắc nghiệp vụ, điều phối transaction đa bảng (ví dụ: tạo đồng thời `Word` + `ReviewState` + `SessionItem`).
   - Đảm bảo tính toàn vẹn dữ liệu cho mô hình đa hình.
3. **Pure Logic Modules (`src/lib/...`):**
   - **SRS Scheduler:** Thiết kế như một pure function `calculateNextReview(currentState, rating, now: Date)`. Không truy cập DB, không đọc biến môi trường, không tự gọi `Date.now()`.
   - **Hashing Module:** Hàm thuần `hashSentence(text: string)` và `hashMistake(wrong: string, correct: string)`.

---

## 3. Công cụ Kiểm thử & Phương pháp Table-driven Testing

### 3.1. Framework kiểm thử: Vitest 5.0.5
- **Lý do chọn:** Tích hợp liền mạch với TypeScript mà không cần cấu hình phức tạp qua `ts-jest` hay Babel; hỗ trợ ESM native; thời gian khởi động và chạy test dưới 1 giây.
- **Thực thi:** Cấu hình trong `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`.

### 3.2. Tiêu chuẩn viết Table-driven Tests
Mọi kiểm thử thuật toán (đặc biệt là SRS và Logic ngày học) bắt buộc viết theo mẫu ma trận kịch bản rõ ràng:

```typescript
// Ví dụ cấu trúc test dạng bảng chuẩn trong Vitest
describe('SRS Scheduler - Modified SM-2 Matrix', () => {
  const scenarios = [
    {
      name: 'Thẻ mới đánh giá Nhớ rõ -> interval = 1, EF tăng nhẹ',
      input: { repetitions: 0, interval: 0, easeFactor: 2.5, rating: 'REMEMBERED' },
      expected: { interval: 1, repetitions: 1, easeFactor: 2.6 }
    },
    {
      name: 'Thẻ đánh giá Khó nhớ -> interval tăng tối thiểu 1 ngày (làm tròn lên)',
      input: { repetitions: 2, interval: 1, easeFactor: 2.5, rating: 'HARD' },
      expected: { interval: 2, easeFactor: 2.35 } // ceil(1 * 1.2) = 2
    },
    {
      name: 'Thẻ bị Quên -> reset interval về 1, giảm EF, không dưới sàn 1.3',
      input: { repetitions: 5, interval: 14, easeFactor: 1.35, rating: 'FORGOTTEN' },
      expected: { interval: 1, repetitions: 0, easeFactor: 1.30 }
    }
  ];

  test.each(scenarios)('$name', ({ input, expected }) => {
    const result = scheduleCard(input, new Date('2026-10-17T10:00:00Z'));
    expect(result.interval).toBe(expected.interval);
    expect(result.easeFactor).toBeCloseTo(expected.easeFactor, 2);
  });
});
```

---

## 4. Module Độc lập Tính "Ngày Học" (Study Day Calculator)

### 4.1. Quy tắc thời gian
- **Múi giờ áp dụng:** Giờ Việt Nam (`Asia/Ho_Chi_Minh` = UTC+7 cố định quanh năm, Việt Nam không có quy ước giờ mùa hè - Daylight Saving Time).
- **Mốc đổi ngày học (Cutoff threshold):** **04:00:00 AM**.
  - Ví dụ: Một phiên học lúc `02:30 AM ngày 18/10/2026 (UTC+7)` vẫn được ghi nhận thuộc ngày học `17/10/2026`.
  - Phiên học từ `04:00 AM ngày 18/10/2026 (UTC+7)` trở đi mới chuyển sang ngày học `18/10/2026`.

### 4.2. Thiết kế module cô lập (`src/lib/study-day.ts`)
```typescript
const VIETNAM_OFFSET_HOURS = 7;
const DAY_CUTOFF_HOUR = 4; // 04:00 sáng

/**
 * Trả về chuỗi ngày học chuẩn YYYY-MM-DD theo giờ VN với mốc đổi ngày 04:00
 * @param date Thời điểm cần tính (mặc định là thời điểm hiện tại)
 */
export function getStudyDate(date: Date = new Date()): string {
  // Dịch chuyển thời gian: trừ đi 4 giờ để mốc 04:00 tương đương mốc 00:00 của ngày
  // và cộng độ lệch UTC+7
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const vnTime = new Date(utc + (VIETNAM_OFFSET_HOURS * 3600000));
  
  // Trừ 4 tiếng để tính ngày logic
  vnTime.setHours(vnTime.getHours() - DAY_CUTOFF_HOUR);
  
  const year = vnTime.getFullYear();
  const month = String(vnTime.getMonth() + 1).padStart(2, '0');
  const day = String(vnTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```
*Ghi chú: Toàn bộ hệ thống (truy vấn danh sách thẻ đến hạn `dueDate`, lưu vết phiên `SessionItem`) đều bắt buộc gọi hàm này, không phân tán logic xử lý ngày giờ ở các nơi khác.*

---

## 5. Kịch bản Sao lưu & Migration An toàn bằng Node.js

### 5.1. Script thực thi đa nền tảng (`scripts/migrate.ts`)
- Nghiêm cấm chạy trực tiếp lệnh `npx prisma migrate dev` trên terminal nhằm phòng ngừa tai nạn mất dữ liệu.
- Thay vào đó, toàn bộ quy trình được đóng gói vào script Node.js (chạy được cả trên Windows PowerShell và Linux):
  ```bash
  npm run db:migrate
  ```

### 5.2. Nguyên lý kỹ thuật của `VACUUM INTO` ngoài Transaction
- **Hạn chế của SQLite:** Lệnh `VACUUM INTO 'filepath'` sẽ **báo lỗi ngay lập tức** nếu được gọi bên trong một transaction đang hoạt động (`cannot VACUUM from within a transaction`).
- **Cách xử lý chuẩn:**
  1. Script chạy bằng Node.js khởi tạo một instance Prisma Client riêng biệt.
  2. Đảm bảo ứng dụng đang ở trạng thái rảnh (không có tác vụ import hay review đang ghi dở).
  3. Chạy `VACUUM INTO` trực tiếp ở mức root của client:
     ```typescript
     // Chạy NGOÀI $transaction
     const backupPath = path.join(process.cwd(), 'data/backups', `pre_migration_${timestamp}.db`);
     await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
     ```
  4. Sau khi file backup được tạo thành công trên đĩa, script mới dùng `child_process.execSync` gọi lệnh `prisma migrate deploy`.

### 5.3. Xác minh hành vi Khóa ngoại (Foreign Keys) của SQLite với Prisma
- **Khẳng định qua kiểm tra thực tế:** Prisma Query Engine khi kết nối tới SQLite mặc định **tự động gửi lệnh `PRAGMA foreign_keys = ON;`** cho mỗi connection trong connection pool.
- **Biện pháp phòng thủ:** Trong script khởi động và các bài kiểm thử cơ sở dữ liệu, ứng dụng luôn chạy truy vấn xác minh:
  ```typescript
  const result = await prisma.$queryRaw<Array<{ foreign_keys: number }>>`PRAGMA foreign_keys;`;
  if (!result || result[0]?.foreign_keys !== 1) {
    throw new Error('CẢNH BÁO: SQLite Foreign Keys chưa được kích hoạt!');
  }
  ```

---

## 6. Quyết định Phong cách Giao diện: CSS Modules + Vanilla CSS Variables

- **Lựa chọn:** **CSS Modules kết hợp hệ thống CSS Variables (Design Tokens)**.
- **Lý do lựa chọn kỹ thuật:**
  1. *Không phụ thuộc build-tool cồng kềnh:* Không cần cài đặt TailwindCSS hay preprocessor (Sass/Less), loại bỏ hoàn toàn nguy cơ xung đột phiên bản Tailwind v3/v4.
  2. *Scoped Styling chống tràn class:* Mỗi component (ví dụ `Flashcard.tsx`) có một file `Flashcard.module.css` đi kèm. CSS class được hash tự động ở build-time, loại bỏ 100% rủi ro đè style toàn cục.
  3. *Hệ thống Design Tokens chuẩn chỉnh:* Toàn bộ màu sắc, typography (Google Font Inter/Outfit), bo góc, đổ bóng và khoảng cách được định nghĩa tập trung tại `src/styles/tokens.css` bằng CSS Variables (`--color-primary`, `--font-sans`, `--radius-md`). Hỗ trợ Dark Mode cực kỳ nhẹ nhàng thông qua việc đổi attribute trên thẻ `<html>`.

---

## 7. Ghi chú về Âm thanh `edge-tts` (Kiểm thử tại Lát 4)
- **Định hướng:** Sử dụng thư viện Node.js thuần (giao tiếp trực tiếp qua WebSocket tới Azure Speech endpoint), bọc sau interface trừu tượng:
  ```typescript
  export interface TtsProvider {
    synthesizeSpeech(text: string, voice: string, rate: string): Promise<Buffer>;
  }
  ```
- **Chưa ghim phiên bản ngay:** Việc rà soát độ ổn định, số lượng issue mở và ngày phát hành gần nhất của các gói npm (`edge-tts-node` hoặc tương đương) sẽ được thực hiện tại **Lát 4**. Ở Lát 1 và Lát 2, toàn bộ âm thanh sẽ chạy qua **Web Speech API** của trình duyệt.

---

## 8. Câu hỏi còn mở (Open Questions)
1. **Kiểm tra khả năng tương thích của Next.js 16 với các tiện ích chạy script:** Xác minh xem việc chạy script bảo trì `scripts/migrate.ts` bằng `tsx` (TypeScript Execute) có gặp xung đột với cấu hình module của Next.js 16 trên Node 22 hay không.
2. **Quy định số lượng bản sao lưu SQLite lưu trữ tối đa:** Cần cơ chế dọn dẹp các file `.db` sao lưu cũ hơn 30 ngày trong thư mục `data/backups/` để tránh đầy dung lượng ổ cứng sau 12 tháng sử dụng.

---

## 9. Nhật ký Quyết định (Decision Log / ADR)

| Ngày | Quyết định | Lý do kỹ thuật | Phương án đã loại |
| :--- | :--- | :--- | :--- |
| **2026-10-17** | **Ghim Prisma 7.10.1 & Node 22.19.0 LTS.** | Đảm bảo tính ổn định tối đa cho môi trường production; tránh các bản Release Candidate chưa ổn định (Prisma v8-rc). | Dùng phiên bản mới nhất không ghim (`latest` tự do) gây rủi ro vỡ code khi cài đặt lại. |
| **2026-10-17** | **Vitest 5.0.5 cho Table-driven tests.** | Chạy nhanh, native TypeScript và ESM; cú pháp test dạng bảng trực quan, minh bạch cho thuật toán SM-2. | Jest (cồng kềnh khi cấu hình ESM + TypeScript với Next.js); kiểm thử thủ công không đo lường được. |
| **2026-10-17** | **Phân lập logic "Ngày học" vào `src/lib/study-day.ts`.** | Giờ VN không có DST nhưng cần một điểm duy nhất để kiểm soát mốc đổi ngày 04:00 sáng; dễ dàng viết unit test giả lập thời gian. | Viết phân tán `new Date()` rải rác trong các route handlers và service. |
| **2026-10-17** | **Script sao lưu Node.js + `VACUUM INTO` ngoài transaction.** | Tương thích cả Windows và Linux; `VACUUM INTO` cho file backup nhất quán 100% nhưng bắt buộc chạy ngoài `$transaction`. | Viết bash script (không chạy được mặc định trên Windows Command Prompt/PowerShell); sao chép file `.db` trực tiếp (dễ hỏng file nếu SQLite đang ghi). |
| **2026-10-17** | **CSS Modules + CSS Custom Properties (Variables).** | Giữ mã nguồn thuần chuẩn Web standard; scoped styling không lo đụng độ class; dễ tùy biến theme mà không cần build step bên ngoài. | TailwindCSS (dễ gặp xung đột cấu hình PostCSS và khác biệt cú pháp v3/v4); CSS-in-JS (runtime overhead cao). |
| **2026-10-17** | **Hoãn ghim package `edge-tts` đến Lát 4; bọc sau `TtsProvider`.** | Tập trung đưa app vào sử dụng sớm với Web Speech API ở Lát 2; interface trừu tượng giúp việc tích hợp sau này không chạm vào code nghiệp vụ. | Cài đặt và tích hợp `edge-tts` ngay từ đầu (làm chậm tiến độ đưa app vào học thực tế). |
