# ĐẶC TẢ CÔNG NGHỆ (TECH STACK SPECIFICATION)

## 1. Danh mục Công nghệ & Phiên bản Ghim Cứng (Pinned Versions)

Các phiên bản dưới đây được kiểm tra trực tiếp từ npm registry và lịch phát hành chính thức của Node.js vào ngày 17/10/2026. Tất cả các gói đều ghim phiên bản chính xác (không dùng ký tự `^` hay `~`), cam kết commit file `package-lock.json` và cài đặt môi trường bằng lệnh `npm ci` để đảm bảo tính tái lập (reproducibility).

### 1.1. Lựa chọn phiên bản Node.js Runtime
- **Kiểm tra lịch phát hành (nodejs/Release):**
  - Node 22 (Jod): Chuyển sang Maintenance LTS từ ngày 21/10/2025 (kết thúc hỗ trợ 30/04/2027).
  - Node 24 (Krypton): Bản Active LTS chính thức từ 28/10/2025 đến 20/10/2026, tiếp tục Maintenance đến 30/04/2028.
  - Node 26: Lên lịch LTS vào 28/10/2026.
- **Quyết định:** Chọn **Node 24 (Active LTS)** vì đây là phiên bản có sự tương thích rộng và ổn định cao giữa các công nghệ:
  - Next.js 16.4.2 yêu cầu `engines: { node: '>=20.9.0' }`.
  - Prisma 7.10.1 khai báo rõ ràng trong engines: `{ node: '^22.18.0 || ^24.11.0 || >=26.0.0' }`.
  - `better-sqlite3` 13.0.3 yêu cầu `engines: { node: '>=22' }`.
- **Khai báo môi trường:**
  - File `.nvmrc`: `24`
  - Khai báo trong `package.json`:
    ```json
    "engines": {
      "node": ">=24.11.0"
    }
    ```
  *(Ghi chú môi trường dev: Máy hiện tại đang cài `v22.19.0`, phiên bản này vẫn thỏa mãn `^22.18.0` của Prisma để chạy thử nghiệm, nhưng khuyến nghị nâng cấp lên Node 24 theo chuẩn dự án).*

---

### 1.2. Bảng phiên bản chính xác và bằng chứng kiểm tra (npm view)

| Gói / Thư viện | Phiên bản ghim | Bằng chứng kiểm tra (`npm view`) | Vai trò trong hệ thống |
| :--- | :--- | :--- | :--- |
| **next** | `16.4.2` | `npm view next version` → `16.4.2` | Full-stack framework (App Router, Server Actions, Route Handlers) |
| **prisma** | `7.10.1` | `npm view prisma version` → `7.10.1` | CLI quản lý migrations và sinh mã Prisma Client |
| **@prisma/client** | `7.10.1` | `npm view @prisma/client version` → `7.10.1` | Type-safe ORM Client |
| **@prisma/adapter-better-sqlite3** | `7.10.1` | `npm view @prisma/adapter-better-sqlite3 version` → `7.10.1` | Driver adapter kết nối Prisma 7 với better-sqlite3 |
| **better-sqlite3** | `13.0.3` | `npm view better-sqlite3 version` → `13.0.3` | Thư viện C++ binding SQLite đồng bộ, tốc độ cao cho Node.js |
| **zod** | `4.6.7` | `npm view zod version` → `4.6.7` | Kiểm thực schema JSON import và DTO đầu vào |
| **vitest** | `5.0.5` | `npm view vitest version` → `5.0.5` | Framework kiểm thử tự động dạng bảng |
| **typescript** | `7.0.2` | `npm view typescript version` → `7.0.2` | Trình biên dịch ngôn ngữ tĩnh (`strict: true`) *(Cần kiểm tra tương thích ở đầu Lát 1)* |
| **tsx** | `4.23.15` | `npm view tsx version` → `4.23.15` | Trình thực thi TypeScript cho script bảo trì / migration |
| **dotenv** | `18.0.8` | `npm view dotenv version` → `18.0.8` | Nạp biến môi trường cho các script độc lập |
| **@types/node** | `24.19.2` | `npm view @types/node@24 version` → `24.19.2` | Type definitions cho Node runtime (khớp major với Node 24) |
| **@types/better-sqlite3** | `9.6.0` | `npm view @types/better-sqlite3 version` → `9.6.0` | Type definitions cho better-sqlite3 |
| **@types/react** | `19.3.0` | `npm view @types/react version` → `19.3.0` | Type definitions cho React |
| **@types/react-dom** | `19.3.0` | `npm view @types/react-dom version` → `19.3.0` | Type definitions cho React DOM |

*(Ghi chú kỹ thuật về TypeScript 7.0.2: Do đây là phiên bản rất mới, cần xác minh thực tế tính tương thích với Next.js 16.4, Prisma 7 và Vitest 5. Nhiệm vụ đầu Lát 1 bắt buộc chạy lệnh kiểm tra `npm run build && npx tsc --noEmit && npx vitest run` để đảm bảo hệ thống biên dịch trơn tru trước khi code tính năng).*

---

## 2. Quy tắc Dữ liệu Cá nhân (Public Repository Safety)

Vì repository được lưu trữ công khai trên GitHub (`BLVCK-WIND/learn_languege_app`), nguyên tắc bất khả xâm phạm về an toàn dữ liệu cá nhân được quy định như sau:

1. **Phân vùng dữ liệu thật:** Toàn bộ dữ liệu phát sinh trong quá trình học tập thực tế (file cơ sở dữ liệu SQLite `*.db`, file âm thanh `*.mp3`, các bản sao lưu `backups/`, và file JSON xuất) **chỉ được phép lưu trữ trong thư mục `data/`** tại thư mục gốc của dự án.
2. **Quy tắc `.gitignore` nghiêm ngặt:** Thư mục `data/`, các định dạng `*.db`, `*.sqlite`, `*.sqlite-journal`, cùng các file môi trường `.env*` bị cấm đưa lên git.
3. **Mẫu và Kiểm thử:** 
   - Dữ liệu phục vụ kiểm thử tự động (tests) chỉ sử dụng dữ liệu giả lập được đặt trong `tests/fixtures/`.
   - Cấu hình môi trường chỉ commit file mẫu `env.example`. Tuyệt đối không commit các file cấu hình chứa đường dẫn thực tế hay thông tin cá nhân.

---

## 3. Cấu trúc Thư mục & Quy ước Phân tầng

### 3.1. Cây thư mục dự án
```text
learn_languege_app/
├── docs/                   # Tài liệu đặc tả kiến trúc (Spec)
├── prisma/
│   ├── schema.prisma       # Lược đồ cơ sở dữ liệu
│   └── migrations/         # Lịch sử migrations (chạy qua script)
├── prisma.config.ts        # Cấu hình Prisma 7 (khai báo adapter)
├── scripts/                # Script Node.js đa nền tảng (chạy bằng tsx)
│   ├── backup.ts           # Sao lưu SQLite bằng VACUUM INTO
│   └── migrate.ts          # Bộ bao bọc tự động sao lưu trước khi migrate
├── src/
│   ├── app/                # Next.js App Router (Giao diện & Route Handlers)
│   │   ├── api/            # API Route Handlers (mỏng, chỉ gọi Service)
│   │   ├── import/         # Màn hình Import JSON
│   │   ├── vocab/          # Màn hình Thư viện từ vựng
│   │   ├── mistakes/       # Màn hình Nhật ký lỗi sai
│   │   ├── review/         # Màn hình Ôn tập SRS Flashcard
│   │   └── dashboard/      # Màn hình Thống kê IELTS
│   ├── components/         # UI Components tái sử dụng (kèm .module.css)
│   ├── styles/
│   │   └── tokens.css      # Design tokens tập trung (CSS Variables)
│   ├── lib/                # Hàm thuần (Pure Functions) & Tiện ích
│   │   ├── prisma.ts       # Singleton PrismaClient tích hợp adapter better-sqlite3
│   │   ├── study-day.ts    # Module cô lập tính ngày học (UTC+7, mốc 04:00)
│   │   ├── crypto/         # Thuật toán băm chuẩn hóa (Sentence & Mistake)
│   │   └── srs/            # Thuật toán Modified SM-2 (Pure functions)
│   ├── services/           # Nghiệp vụ lõi (Transactions, điều phối đa hình)
│   │   ├── import.service.ts
│   │   ├── review.service.ts
│   │   ├── vocab.service.ts
│   │   └── backup.service.ts
│   └── types/              # Định nghĩa Types & Zod Schemas
├── tests/
│   ├── fixtures/           # Dữ liệu giả lập phục vụ kiểm thử
│   ├── srs.test.ts         # Table-driven test cho Scheduler
│   └── import.test.ts      # Test tính idempotent của Import
├── data/                   # [BẢO VỆ .gitignore] Lưu dữ liệu thực tế
│   ├── app.db              # File SQLite thật
│   ├── backups/            # Bản sao lưu SQLite (.db) và JSON export
│   └── audio/              # File mp3 tải về
├── .env.example            # Mẫu biến môi trường (an toàn commit)
├── .gitignore              # Chặn rò rỉ dữ liệu cá nhân
└── .nvmrc                  # Khai báo phiên bản Node 24
```

### 3.2. Quy ước phân tầng
1. **Route Handlers (`src/app/api/...`):** Chỉ đảm nhận tiếp nhận HTTP request, parse body bằng Zod, chuyển lời gọi sang tầng Service tương ứng và trả về HTTP response. Không nhúng logic nghiệp vụ và không thực hiện truy vấn cơ sở dữ liệu trực tiếp tại đây.
2. **Service Layer (`src/services/...`):** Nơi xử lý toàn bộ logic nghiệp vụ, thực thi giao dịch nguyên tử (`$transaction`), duy trì tính toàn vẹn cho mô hình `ReviewState` đa hình.
3. **Pure Logic Modules (`src/lib/...`):**
   - Hàm thuần: Các hàm tính toán như `calculateNextReview` hay hàm băm chuỗi không phụ thuộc DB, không gọi `Date.now()`, nhận đủ tham số đầu vào và trả về kết quả xác định.

---

## 4. Công cụ Kiểm thử & Table-driven Testing (Vitest 5.0.5)

### 4.1. Lý do lựa chọn Vitest
- Tương thích tự nhiên với TypeScript và ESM mà không cần qua các lớp biên dịch phức tạp như `ts-jest`.
- Cú pháp tương thích với hệ sinh thái Jest (`describe`, `it`, `expect`), hỗ trợ phương thức `test.each` trực quan cho kiểm thử dạng bảng.

### 4.2. Mẫu kiểm thử dạng bảng (Minh họa cấu trúc)
*(Lưu ý: Các giá trị số dưới đây chỉ mang tính chất minh họa cấu trúc test; các hằng số chính thức về mức tăng/giảm Ease Factor và số ngày Interval sẽ được quy định cụ thể tại `docs/SRS_ALGORITHM.md`)*

```typescript
import { describe, test, expect } from 'vitest';
import { calculateNextReview } from '@/lib/srs/scheduler';

describe('SRS Scheduler - Modified SM-2 Table-driven Tests', () => {
  const scenarios = [
    {
      name: 'Thẻ mới đánh giá Nhớ rõ -> interval khởi tạo, EF tăng nhẹ',
      input: { repetitions: 0, interval: 0, easeFactor: 2.5, rating: 'REMEMBERED' as const },
      expected: { interval: 1, repetitions: 1, easeFactor: 2.6 }
    },
    {
      name: 'Thẻ đánh giá Khó nhớ -> interval tăng tối thiểu 1 ngày (làm tròn lên)',
      input: { repetitions: 2, interval: 1, easeFactor: 2.5, rating: 'HARD' as const },
      expected: { interval: 2, easeFactor: 2.35 }
    },
    {
      name: 'Thẻ bị Quên -> reset interval về 1, giảm EF, không tụt dưới sàn 1.3',
      input: { repetitions: 5, interval: 14, easeFactor: 1.35, rating: 'FORGOTTEN' as const },
      expected: { interval: 1, repetitions: 0, easeFactor: 1.30 }
    }
  ];

  test.each(scenarios)('$name', ({ input, expected }) => {
    const fixedNow = new Date('2026-10-17T10:00:00Z');
    const result = calculateNextReview(input, fixedNow);
    expect(result.interval).toBe(expected.interval);
    expect(result.easeFactor).toBeCloseTo(expected.easeFactor, 2);
  });
});
```

---

## 5. Module Tính "Ngày Học" (Study Day Calculator)

### 5.1. Thuật toán số học UTC thuần túy
Để loại bỏ sự phụ thuộc vào múi giờ của máy trạm (local machine timezone), hàm tính ngày học sử dụng phép tịnh tiến số học trực tiếp trên timestamp UTC:
- Múi giờ Việt Nam: UTC+7 (`+7` giờ).
- Mốc chuyển ngày học: 04:00 sáng (`-4` giờ).
- Độ lệch thời gian ròng: `+7 - 4 = +3` giờ (`+3 * 3600 * 1000` ms).

```typescript
// src/lib/study-day.ts
const NET_OFFSET_MS = (7 - 4) * 3600 * 1000; // +3 giờ = 10,800,000 ms

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
```

### 5.2. Bảng kiểm thử đối soát mốc thời gian (Test Matrix)

| Thời điểm đầu vào (UTC) | Tương đương giờ VN (UTC+7) | Ngày học kỳ vọng (`YYYY-MM-DD`) | Ghi chú kiểm thử |
| :--- | :--- | :--- | :--- |
| `2026-10-17T20:59:59Z` | `2026-10-18 03:59:59` | `2026-10-17` | Ngay trước mốc 04:00 sáng (vẫn thuộc ngày học cũ) |
| `2026-10-17T21:00:00Z` | `2026-10-18 04:00:00` | `2026-10-18` | Đúng mốc 04:00 sáng (chuyển sang ngày học mới) |
| `2026-12-31T20:59:59Z` | `2027-01-01 03:59:59` | `2026-12-31` | Đêm giao thừa trước 04:00 sáng (vẫn thuộc năm cũ) |
| `2026-12-31T21:00:00Z` | `2027-01-01 04:00:00` | `2027-01-01` | Đúng 04:00 sáng ngày đầu năm mới (chuyển năm mới) |

---

## 6. Cơ chế Kết nối Prisma 7 với SQLite & Kiểm tra Khóa Ngoại

### 6.1. Khởi tạo PrismaClient với Adapter `better-sqlite3`
Trong Prisma 7, kết nối tới SQLite thông qua driver adapter yêu cầu truyền một instance `Database` đã được cấu hình:

```typescript
// src/lib/prisma.ts
import Database from 'better-sqlite3';
import { PrismaBetterSqlite } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'data', 'app.db');
const db = new Database(dbPath);

// BẮT BUỘC: Kích hoạt thủ công ràng buộc khóa ngoại trên kết nối better-sqlite3
db.pragma('foreign_keys = ON;');

const adapter = new PrismaBetterSqlite(db);
export const prisma = new PrismaClient({ adapter });
```

### 6.2. Kiểm tra thực tế hành vi Khóa ngoại (Foreign Keys)
- **Đặc tính cơ bản của SQLite:** Lệnh `PRAGMA` trong SQLite có phạm vi **theo từng kết nối riêng biệt (per-connection)**. Nghĩa là lệnh `db.pragma('foreign_keys = ON;')` chỉ có hiệu lực trên chính instance connection đó.
- **Thực tế kiểm tra với Prisma 7:** Driver adapter `@prisma/adapter-better-sqlite3` bản `7.10.1` chỉ bọc instance `Database` mà người dùng truyền vào, **không tự động gửi lệnh kích hoạt khóa ngoại**.
- **Cách áp dụng chuẩn:** Trong cả `src/lib/prisma.ts` và `scripts/migrate.ts`, bắt buộc phải gọi `db.pragma('foreign_keys = ON;')` ngay sau khi `new Database(...)`.
- **Kiểm tra xác thực qua đúng PrismaClient của ứng dụng:** Để đảm bảo PrismaClient thực sự thừa hưởng kết nối đã bật khóa ngoại, kiểm tra trực tiếp qua hàm truy vấn raw của client:
  ```typescript
  // Kiểm tra qua chính PrismaClient của app (kết quả trả về phải là 1)
  const result = await prisma.$queryRaw<Array<{ foreign_keys: number }>>`PRAGMA foreign_keys;`;
  if (!result || result[0]?.foreign_keys !== 1) {
    throw new Error('LỖI NGHIÊM TRỌNG: PRAGMA foreign_keys qua PrismaClient không trả về 1!');
  }
  ```
- **Nhiệm vụ đầu Lát 1:** 
  1. Cài đặt thử nghiệm gói `better-sqlite3` trên môi trường Windows của người dùng để xác nhận binary C++ biên dịch/nạp thành công.
  2. Chạy đoạn mã kiểm tra trên để xác thực `PRAGMA foreign_keys = 1` thông qua PrismaClient.

---

## 7. Quy trình Sao lưu Bằng `VACUUM INTO` & Chính sách Lưu trữ

### 7.1. Chạy `VACUUM INTO` ngoài Transaction
SQLite nghiêm cấm thực thi lệnh `VACUUM INTO` khi đang có transaction mở. Script sao lưu (`scripts/backup.ts`) thực hiện sao lưu trực tiếp trên instance cơ sở dữ liệu ở trạng thái rảnh:

```typescript
// scripts/backup.ts
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export function createDatabaseBackup(prefix: string = 'backup'): string {
  const dbPath = path.join(process.cwd(), 'data', 'app.db');
  const backupDir = path.join(process.cwd(), 'data', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `${prefix}_${timestamp}.db`);

  const db = new Database(dbPath);
  // Thực thi lệnh VACUUM INTO trực tiếp khi không có transaction
  db.prepare(`VACUUM INTO ?`).run(backupFile);
  db.close();

  return backupFile;
}
```

### 7.2. Chính sách Lưu trữ Bản sao lưu (Retention Policy)
- **Bản sao lưu hằng ngày:** Giữ lại các bản sao lưu trong 14 ngày gần nhất. Các bản cũ hơn 14 ngày sẽ được script tự động dọn dẹp để tiết kiệm dung lượng ổ cứng.
- **Bản sao lưu hằng tháng:** Giữ lại 1 bản snapshot vào ngày đầu tiên của mỗi tháng trong suốt chu kỳ học 12 tháng.
- **Bản sao lưu trước Migration (`pre_migration_*.db`):** Lưu trữ vĩnh viễn toàn bộ các bản sao lưu tạo ra trước mỗi lần chạy migration CSDL.
- **Phương án sao lưu ngoài máy tính (Off-machine backup):** Cung cấp tài liệu hướng dẫn trỏ đường dẫn lưu trữ phụ tới thư mục đồng bộ đám mây cá nhân (Google Drive / OneDrive / Dropbox) hoặc thiết lập private git bundle riêng biệt ngoài repo chính.

---

## 8. Giao diện Người dùng & Chiến lược Font Chống Mất Mạng

### 8.1. Lý do lựa chọn CSS Modules + CSS Variables thay vì TailwindCSS
1. **Tránh biến động phiên bản và phụ thuộc công cụ:** TailwindCSS có sự chuyển dịch lớn về cú pháp cấu hình giữa v3 (`tailwind.config.js`, `@tailwind`, PostCSS) và v4 (biên dịch bằng Vite/Rust, `@import "tailwindcss"`), tiềm ẩn rủi ro phát sinh lỗi cấu hình trong quá trình bảo trì 12 tháng.
2. **Nâng cao năng lực kỹ thuật nền tảng:** Sử dụng CSS thuần với CSS Modules giúp củng cố kiến thức chuẩn về mô hình hộp (Box Model), thứ bậc ưu tiên (Specificity) và CSS Custom Properties.
3. **Mã nguồn giao diện gọn gàng:** Tránh các chuỗi class tiện ích inline quá dài trong các component có logic hiển thị phức tạp như Flashcard 2 mặt hay bảng đối soát câu đúng/sai.

### 8.2. Hệ thống Font tự phục vụ (Self-hosted Fonts)
Để đảm bảo khả năng ôn tập hoàn toàn ổn định khi thiết bị không có kết nối internet:
- Sử dụng module `next/font/google` để tự động tải các font chữ (như Inter hoặc Outfit) về máy cục bộ ngay ở thời điểm build (`next build`). Trình duyệt của người dùng sẽ nạp font trực tiếp từ server local, không thực hiện bất kỳ truy vấn nào ra ngoài máy đến máy chủ Google Fonts khi đang chạy.
- Khai báo hệ thống font dự phòng (System Font Fallback) trong `src/styles/tokens.css`:
  ```css
  --font-sans: var(--font-inter), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  ```

---

## 9. Câu hỏi còn mở (Open Questions)

1. **Định dạng lưu trữ trường `dueDate` trong cơ sở dữ liệu:** Nên lưu dưới dạng chuỗi ngày học cục bộ `YYYY-MM-DD` (để query trực tiếp theo kết quả của `getStudyDate`) hay lưu dưới dạng timestamp UTC ISO-8601 (để đảm bảo chuẩn thời gian quốc tế). Sẽ quyết định cụ thể tại `docs/DATABASE_SCHEMA.md`.
2. **Khả năng tương thích của `tsx` với Next.js 16 trên Node 24:** Kiểm tra xem lệnh chạy script bảo trì `npx tsx scripts/migrate.ts` có gặp cảnh báo module nào khi Next.js 16 dùng cấu hình ESM mặc định.

---

## 10. Nhật ký Quyết định (Decision Log / ADR)

| Ngày | Quyết định | Lý do kỹ thuật | Phương án đã loại |
| :--- | :--- | :--- | :--- |
| **2026-10-17** | **Ghim Node 24 (Active LTS) trong engines và .nvmrc.** | Bản Active LTS ổn định, được Next.js 16, Prisma 7 và better-sqlite3 hỗ trợ chính thức. | Dùng Node 22 (đã vào Maintenance LTS) hoặc Node 26 (chưa chính thức LTS). |
| **2026-10-17** | **Ghim cứng phiên bản chính xác cho toàn bộ dependencies.** | Loại bỏ ký tự `^`, cam kết `package-lock.json` và dùng `npm ci` để đảm bảo môi trường không bị thay đổi bất ngờ. | Dùng dải phiên bản lỏng lẻo (`^` hoặc `~`). |
| **2026-10-17** | **Prisma 7 với Adapter `better-sqlite3` và lệnh `foreign_keys = ON;` tường minh.** | Tận dụng driver C++ tốc độ cao; kiểm soát minh bạch việc bật ràng buộc khóa ngoại ở tầng driver thay vì phó mặc giả định. | Sử dụng SQLite driver mặc định cũ của Prisma không qua adapter. |
| **2026-10-17** | **Hàm `getStudyDate` tính bằng số học UTC (+3 giờ).** | Loại bỏ 100% rủi ro phụ thuộc vào múi giờ cài đặt của máy trạm; kết quả tính toán độc lập và nhất quán trên mọi môi trường. | Dùng `Date.prototype.getHours()` phụ thuộc múi giờ máy local. |
| **2026-10-17** | **Quy tắc cô lập dữ liệu thật vào `data/` và `.gitignore`.** | Đảm bảo an toàn tuyệt đối khi public mã nguồn lên GitHub; chỉ commit dữ liệu giả lập trong `fixtures/`. | Lưu DB rải rác hoặc commit file DB chứa lịch sử học tập cá nhân lên repo public. |
| **2026-10-17** | **CSS Modules + Tokens thay vì TailwindCSS.** | Tránh phụ thuộc vào công cụ tiền xử lý, tránh rủi ro vỡ cấu hình giữa Tailwind v3 và v4, giữ code CSS chuẩn mực. | Dùng TailwindCSS hoặc các thư viện CSS-in-JS có chi phí runtime. |
