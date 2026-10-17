# HỆ THỐNG TÀI LIỆU ĐẶC TẢ & QUY TẮC LÀM VIỆC DỰ ÁN (PROJECT SPECIFICATIONS & WORKING PROTOCOLS)

> **Dự án:** Ứng dụng Web Học & Ôn tập Ngoại ngữ Cá nhân (Learn Language App - IELTS 6.5)  
> **Người dùng duy nhất:** Phong (Sinh viên Công nghệ Phần mềm)  
> **Repository:** `https://github.com/BLVCK-WIND/learn_languege_app.git` (Branch: `main`)  
> **Mô hình kiến trúc:** Next.js App Router Fullstack (Local-first, Single-user, SQLite + Prisma ORM)

---

## 1. Mục lục 6 Tài liệu Đặc tả Kỹ thuật Cốt lõi (Core Specifications Index)

Toàn bộ kiến trúc và thiết kế hệ thống được ghi nhận đầy đủ, chi tiết và đồng bộ trong 6 tài liệu đặc tả tại thư mục `docs/`. Mọi phiên làm việc AI mới **BẮT BUỘC ĐỌC VÀ TUÂN THỦ** các tài liệu này:

1. [PROJECT_OVERVIEW.md](file:///d:/Antigravity/learn_languege_app/docs/PROJECT_OVERVIEW.md) — **Tổng quan Dự án & Lộ trình Triển khai**
   - Chân dung người học, mục tiêu 12 tháng IELTS 6.5 (~1 giờ/ngày, local-first).
   - Triết lý Kho dữ liệu trung tâm (Single Source of Truth) và các góc nhìn tự sinh (Projection Views).
   - Phạm vi Phase A (MVP) và ngoài phạm vi (không làm Listening).
   - Kế hoạch 5 lát cắt dọc (Lát 1, 2a, 2b, 3, 4) kèm mốc "Bắt đầu dùng được với dữ liệu thật" ở **Lát 2a**.
   - Nhật ký quyết định kiến trúc (ADR).

2. [TECH_STACK.md](file:///d:/Antigravity/learn_languege_app/docs/TECH_STACK.md) — **Đặc tả Công nghệ & Phiên bản Ghim Cứng**
   - Danh mục công nghệ ghim cứng phiên bản chính xác: Node 24 Active LTS, Next.js `16.4.2`, Prisma `7.10.1`, `better-sqlite3` `13.0.3`, Zod `4.6.7`, Vitest `5.0.5`.
   - Cấu trúc thư mục phân tầng (Route Handler $\rightarrow$ Service $\rightarrow$ Pure Logic Lib).
   - Quy tắc an toàn kho công khai (`.gitignore`, cô lập dữ liệu thật vào `/data/`).
   - Module tính ngày học `src/lib/study-day.ts` (`getStudyDate`, `addDaysToStudyDate` tính bằng số học UTC +3 giờ, mốc đổi ngày 04:00 AM).
   - Quy trình sao lưu SQLite an toàn bằng lệnh `VACUUM INTO` ngoài transaction.
   - Giao diện CSS Modules + Design Tokens thay vì TailwindCSS.

3. [DATABASE_SCHEMA.md](file:///d:/Antigravity/learn_languege_app/docs/DATABASE_SCHEMA.md) — **Đặc tả Lược đồ Cơ sở Dữ liệu (Schema & ERD)**
   - Sơ đồ thực thể Mermaid gồm 11 bảng: `ImportBatch`, `Session`, `SessionItem`, `Word`, `WordMeaning`, `Sentence`, `Mistake`, `ReviewState`, `ReviewLog`, `ReviewSession`, `StudyQuotaConfig`.
   - Khóa chính CUID2 (`@default(cuid(2))`) bảo toàn liên kết khi xuất / nhập khôi phục JSON toàn vẹn.
   - Mô hình SRS đa hình `(itemType, itemId)` kèm bộ truy vấn kiểm tra dữ liệu mồ côi (Orphan Audit) 2 chiều.
   - Cơ chế băm SHA-256 chống trùng lặp dữ liệu (Sentence & Mistake).
   - Định nghĩa số lần mắc lỗi tính qua `SessionItem` (không đếm dòng `Mistake`).
   - Chính sách xóa mềm toàn diện (`deletedAt: DateTime?`).

4. [SRS_ALGORITHM.md](file:///d:/Antigravity/learn_languege_app/docs/SRS_ALGORITHM.md) — **Đặc tả Thuật toán Lặp lại Ngắt quãng (Modified SM-2)**
   - Bảng hằng số thuật toán chuẩn (EF khởi điểm 2.50, sàn 1.30, 3 mức: Quên, Khó nhớ, Nhớ rõ).
   - Kiến trúc 2 tầng độc lập:
     - **Tầng (a) [Lát 2a]:** Bộ tính lịch ôn toán học thuần túy (`calculateNextReview`), trả về `dueDate: YYYY-MM-DD`.
     - **Tầng (b) [Lát 2b]:** Máy trạng thái phiên học (`processSessionCard`), re-queue tối đa 3 lần, phạt lapse 1 lần duy nhất trong phiên, lưu phiên dở dang vào CSDL (`ReviewSession`).
   - Hạn ngạch ngày (`StudyQuotaConfig`): từ mới (10), lỗi mới (5), trần ôn từ (50), trần ôn lỗi (30).
   - Trộn hàng đợi 2 Từ : 1 Lỗi; Thẻ Mistake gõ câu đúng ở mặt trước; Thẻ Word đục lỗ qua `Sentence.targetForm`.
   - 3 Ma trận kiểm thử tự động dạng bảng (Table-driven Test Matrices).

5. [IMPORT_SPEC.md](file:///d:/Antigravity/learn_languege_app/docs/IMPORT_SPEC.md) — **Đặc tả Định dạng & Cỗ máy Nhập liệu**
   - Phân định rạch ròi 2 loại JSON: JSON buổi học hằng ngày (không có ID) vs JSON khôi phục sao lưu (đầy đủ CUID2).
   - Kiểm thực Zod 2 lượt (First-pass chuỗi tự do để phát hiện mã lạ $\rightarrow$ Second-pass validate Enum trước khi commit).
   - Danh mục 13 mã lỗi chuẩn kebab-case (Single Source of Truth).
   - Cơ chế phát hiện trường lạ, đối soát mã lỗi lạ và giải quyết xung đột khóa Session `(week, day, seq)`.
   - Sơ đồ luồng Dry-run và chữ ký nghiệp vụ `ImportService` (`dryRunImport` và `commitImport`).
   - Fixture hợp lệ mẫu: [`tests/fixtures/session_valid_sample.json`](file:///d:/Antigravity/learn_languege_app/tests/fixtures/session_valid_sample.json).

6. [AUDIO_SUBSYSTEM.md](file:///d:/Antigravity/learn_languege_app/docs/AUDIO_SUBSYSTEM.md) — **Đặc tả Hệ thống Âm thanh & Phát âm**
   - Phân định lộ trình: **Lát 2a** (Web Speech API trình duyệt) $\rightarrow$ **Lát 4** (DictionaryAPI + `edge-tts`).
   - Bằng chứng gói `node-edge-tts` v`1.2.11` kèm cảnh báo không có SLA; bắt buộc cấu hình `voice: 'en-US-AriaNeural'` và `lang: 'en-US'`.
   - Cơ chế ghi file nguyên tử (`.tmp` $\rightarrow$ rename) sau interface `TtsProvider.synthesizeToFile`.
   - Hai tuyến vận hành: Tải ngầm mặc định khi Import + Tải theo yêu cầu ưu tiên khi người học bấm loa.
   - Singleton Queue trên `globalThis.__audioQueue`, tự phục hồi khi khởi động app qua `src/instrumentation.ts`.
   - Quy tắc băm tên file gồm cả `source` (`dictionaryapi` / `edge-tts`), phục vụ qua Route Handler stream có regex bảo mật và cache dài hạn.
   - Quyền riêng tư: Không gửi dữ liệu cá nhân ra ngoài; công tắc Offline Mode Only.

---

## 2. Quy tắc Bất Khả Xâm Phạm Cho Các Phiên Làm Việc AI (Ironclad Working Rules)

Mọi trợ lý AI / AI Agent khi tham gia phát triển dự án này bắt buộc phải tuân thủ nghiêm ngặt 6 quy tắc sau:

### Quy tắc 1: Cấm Tự ý Viết Code hoặc Tạo File Khi Chưa Có Lệnh
- **KHÔNG ĐƯỢC PHÉP** tự ý tạo file mã nguồn, file cấu hình, hay viết mã triển khai khi người dùng chưa đưa ra lệnh cụ thể (ví dụ: *"tạo file X"*, *"triển khai Lát 1"*).
- Giai đoạn chuẩn bị chỉ tập trung vào việc đối soát, làm rõ yêu cầu và hoàn thiện tài liệu đặc tả.

### Quy tắc 2: Đọc Tài liệu Trước Khi Hành Động (Read-First Protocol)
- Trước khi thực hiện bất kỳ tác vụ nào, AI bắt buộc phải đọc file `docs/README.md` và các file đặc tả liên quan đến tác vụ đó bằng công cụ đọc file.
- Tuyệt đối không làm việc dựa trên suy đoán hoặc kiến thức mặc định tổng quát mà không kiểm tra lại các ràng buộc đã định nghĩa trong tài liệu của dự án.

### Quy tắc 3: Bảo toàn Quyết định & Cập nhật Nhật ký Quyết định (ADR)
- Toàn bộ các quyết định kỹ thuật đã được ghi nhận trong bảng **Nhật ký Quyết định (Decision Log / ADR)** của từng tài liệu spec là kết quả thảo luận kỹ lưỡng. AI **không được phép tự ý thay đổi hoặc đề xuất giải pháp mâu thuẫn** với các quyết định này.
- Khi người dùng đưa ra quyết định mới hoặc điều chỉnh hướng đi, AI bắt buộc phải cập nhật bổ sung vào bảng ADR của tài liệu tương ứng, ghi rõ: Ngày, Quyết định mới, Lý do kỹ thuật, và Phương án đã loại bỏ.

### Quy tắc 4: Commit và Push Ngay Sau Mỗi Thay đổi File
- Mỗi khi tạo mới hoặc sửa đổi bất kỳ file nào (kể cả file tài liệu markdown hay mã nguồn), AI bắt buộc phải kiểm tra `git status`, chạy `git add`, `git commit` với thông điệp rõ ràng theo chuẩn Conventional Commits (ví dụ: `docs: ...`, `feat: ...`, `test: ...`), và `git push origin main` lên repository GitHub.

### Quy tắc 5: Bảo vệ Tuyệt đối An toàn Dữ liệu Cá nhân & Repo Public
- Kho mã nguồn GitHub là **kho công khai (public)**.
- Toàn bộ dữ liệu phát sinh từ việc học thật của người dùng (file cơ sở dữ liệu `*.db`, file âm thanh `*.mp3`, file backup, JSON xuất) **chỉ được phép lưu trữ trong thư mục `data/`** (đã được cấu hình chặn trong `.gitignore`).
- Tuyệt đối không lưu dữ liệu thật vào `public/`, không commit bất kỳ file dữ liệu thật nào lên git. Mọi test case chỉ được dùng dữ liệu giả lập trong `tests/fixtures/`.

### Quy tắc 6: Không Giả định - Phải Xác thực Bằng Bằng chứng Thật
- Không dùng số liệu phiên bản hoặc hành vi thư viện theo "trí nhớ".
- Khi cần khẳng định một phiên bản gói, một cú pháp Prisma, hay một hành vi driver, AI phải chạy lệnh kiểm tra thực tế trong terminal (`npm view`, `node -e`, `npx prisma ...`) và ghi nhận kết quả xác thực trước khi kết luận.

### Quy tắc 7: Tự Động Cập Nhật Bảng Checklist Tiến Độ
- Khi hoàn thành bất kỳ Task nào trong Bảng Checklist tiến độ (Mục 3), AI bắt buộc phải cập nhật trạng thái từ `- [ ]` sang `- [x]` trong file `docs/README.md`.
- File `docs/README.md` phải được commit và push kèm theo các file code hoàn thiện của Task đó để phiên làm việc tiếp theo luôn nắm được chính xác trạng thái dự án.

---

## 3. Bảng Checklist Tiến Độ Triển Khai Chi Tiết (Phase A Task Checklist)

Bảng dưới đây là kim chỉ nam tiến độ cho toàn bộ dự án. Khi hoàn thành mỗi Task, AI tự động đánh dấu `[x]` vào ô tương ứng:

### 📋 Lát 1: Nền tảng Dữ liệu, Schema Prisma & Cỗ máy Import Dry-run (~1–2 buổi)
- [x] **Task 1.1:** Khởi tạo `package.json` với engines Node `>=24.11.0`, ghim cứng toàn bộ phiên bản dependencies chính xác theo [TECH_STACK.md](file:///d:/Antigravity/learn_languege_app/docs/TECH_STACK.md), cài đặt và kiểm tra biên dịch C++ native của `better-sqlite3` trên Windows.
- [x] **Task 1.2:** Cấu hình `prisma.config.ts`, tạo `prisma/schema.prisma` đầy đủ 11 thực thể theo [DATABASE_SCHEMA.md](file:///d:/Antigravity/learn_languege_app/docs/DATABASE_SCHEMA.md) với cú pháp CUID2 `cuid(2)`.
- [x] **Task 1.3:** Viết script `scripts/backup.ts` (sao lưu SQLite bằng `VACUUM INTO` ngoài transaction) và `scripts/migrate.ts` (tự động sao lưu trước khi migrate, bật tường minh `PRAGMA foreign_keys = ON;`).
- [x] **Task 1.4:** Viết module thuần `src/lib/study-day.ts` (`getStudyDate`, `addDaysToStudyDate` tính bằng số học UTC +3 giờ mốc 04:00 AM) và module băm chuỗi chuẩn hóa SHA-256 (`src/lib/crypto/hash.ts`).
- [x] **Task 1.5:** Xây dựng dịch vụ nhập liệu `src/services/import.service.ts` (kiểm thực Zod 2 lượt, phát hiện trường lạ, đối soát 13 mã lỗi chuẩn, xử lý xung đột Session, commit nguyên tử trong 1 transaction).
- [x] **Task 1.6:** Xây dựng giao diện trang Import `/import` (ô dán JSON, bảng Diff Report thêm/gộp/bỏ qua, hộp thoại ánh xạ mã lỗi, nút xác nhận lưu).

### 📋 Lát 2a: Thư viện Vocab/Mistakes, Ôn tập Cơ bản, Web Speech & Sao lưu (~2 buổi) 🚀 [MỐC DÙNG ĐƯỢC VỚI DỮ LIỆU THẬT]
- [x] **Task 2a.1:** Giao diện Thư viện Từ vựng (`/vocab`) và Nhật ký Lỗi sai (`/mistakes`) kèm điều kiện lọc xóa mềm `where: { deletedAt: null }`.
- [ ] **Task 2a.2:** Flashcard Ôn tập 3 nút (*Quên / Khó nhớ / Nhớ rõ*) với bộ tính toán toán học thuần túy Modified SM-2 (`calculateNextReview`).
- [ ] **Task 2a.3:** Tích hợp phát âm trình duyệt Web Speech API (chờ nạp danh sách giọng `en-US`, ưu tiên giọng `localService` khi offline).
- [ ] **Task 2a.4:** Xây dựng `src/services/backup.service.ts` hỗ trợ API Xuất / Nhập khôi phục toàn vẹn JSON và viết bộ kiểm thử khứ hồi Round-trip (`tests/backup.test.ts`).

### 📋 Lát 2b: Trải nghiệm SRS Nâng cao, Thẻ Gõ Lỗi, Đục lỗ Cloze & Quota (~2 buổi)
- [ ] **Task 2b.1:** Thẻ Mistake nâng cao (mặt trước bắt buộc gõ lại câu đúng, so khớp diff highlight trực quan phân biệt hoa/thường và dấu câu).
- [ ] **Task 2b.2:** Thẻ Word 3 chế độ (Từ $\rightarrow$ Nghĩa, Nghĩa $\rightarrow$ Từ, Đục lỗ câu `Cloze Deletion` thông qua trường `Sentence.targetForm` kèm fallback).
- [ ] **Task 2b.3:** Máy trạng thái trong phiên `processSessionCard` (re-queue thẻ quên tối đa 3 lần, phạt lapse 1 lần duy nhất trong phiên).
- [ ] **Task 2b.4:** Quản lý phiên dở dang tại CSDL (`ReviewSession`), nút "Kết thúc hôm nay", tự động chuyển `ABANDONED` sau 04:00 AM.
- [ ] **Task 2b.5:** Hạn ngạch học tập hằng ngày `StudyQuotaConfig` (từ mới, lỗi mới, trần ôn tập) và thuật toán trộn xen kẽ 2 Từ : 1 Lỗi (Interleaving).

### 📋 Lát 3: Nhật ký Lỗi sai Chi tiết & Dashboard Thống kê IELTS (~1–2 buổi)
- [ ] **Task 3.1:** Bộ lọc danh sách lỗi theo 13 mã danh mục chuẩn kebab-case và hiển thị ngữ cảnh câu sai/đúng.
- [ ] **Task 3.2:** Dashboard phân tích: Thống kê Top 5 lỗi hay gặp, biểu đồ xu hướng lỗi theo tuần gom nhóm theo `SessionItem` (đếm đúng tần suất thực tế, không đếm dòng `Mistake`).

### 📋 Lát 4: Hệ thống Audio Chất lượng cao & Hàng đợi Tải ngầm (~2 buổi)
- [ ] **Task 4.1:** Bọc thư viện `node-edge-tts` (v1.2.11, cấu hình bắt buộc `voice: 'en-US-AriaNeural'`, `lang: 'en-US'`, ghi nguyên tử `.tmp`) sau interface `TtsProvider`.
- [ ] **Task 4.2:** Tích hợp tải phát âm từ điển chuẩn qua `DictionaryAPI` (ưu tiên lấy audio `-us.mp3`).
- [ ] **Task 4.3:** Hàng đợi tải ngầm Singleton trên `globalThis.__audioQueue`, polling tiến độ mỗi 2s, hook tự phục hồi khi khởi động `src/instrumentation.ts`.
- [ ] **Task 4.4:** Tuyến Route Handler phục vụ audio stream `/api/audio/[filename]`, quy tắc băm tên file kèm `source`, regex an toàn chống Path Traversal, header `Cache-Control` dài hạn.

---

## 4. Hướng dẫn Câu lệnh / Prompt Mẫu Chuẩn Cho Mọi Phiên Làm Việc Mới

Khi bắt đầu một phiên làm việc mới với bất kỳ AI nào (Claude, Gemini, ChatGPT, Cursor, Copilot, v.v.), người học **chỉ cần copy & paste đoạn prompt mẫu dưới đây**. AI sẽ tự động đọc checklist, tìm Task chưa làm tiếp theo và báo cáo cho bạn:

```markdown
Chào bạn, chúng ta tiếp tục phát triển dự án Learn Language App (IELTS 6.5, local-first single-user web app chạy trên Next.js App Router, SQLite + Prisma 7 adapter better-sqlite3). Toàn bộ kiến trúc và quy ước kỹ thuật đã được đóng băng trong thư mục `docs/`.

TRƯỚC KHI LÀM BẤT KỲ ĐIỀU GÌ, BẠN BẮT BUỘC PHẢI THỰC HIỆN CÁC BƯỚC SAU:
1. Đọc file `docs/README.md` để nắm rõ 7 quy tắc bất khả xâm phạm và Bảng Checklist tiến độ tại Mục 3.
2. Chạy `git status` và `git log -n 2` để kiểm tra trạng thái thực tế của codebase.
3. Tìm Task đầu tiên chưa được đánh dấu hoàn thành (`- [ ]`) trong Bảng Checklist tiến độ của Lát cắt hiện tại.
4. Đọc kỹ file spec liên quan đến Task đó trong thư mục `docs/` (tuân thủ tuyệt đối các quyết định kỹ thuật trong bảng ADR).
5. Chia nhỏ Task thành các bước vi mô (micro-steps), nêu rõ các điểm nghi vấn/thắc mắc kỹ thuật (nếu có) và DỪNG LẠI CHỜ MÌNH PHÊ DUYỆT. Tuyệt đối CHƯA tự ý viết code khi mình chưa xác nhận kế hoạch!
6. Sau khi được duyệt và hoàn thành code của Task:
   - Chạy test xác nhận mọi thứ hoạt động trơn tru.
   - Cập nhật file `docs/README.md` đổi trạng thái Task đó từ `- [ ]` sang `- [x]`.
   - Kiểm tra `git status`, commit với message chuẩn mực và push lên `origin main`.

Bây giờ, hãy đọc `docs/README.md`, kiểm tra git log và cho mình biết Task tiếp theo cần làm là gì kèm kế hoạch thực hiện!
```
