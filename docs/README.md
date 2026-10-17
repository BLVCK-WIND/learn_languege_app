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

---

## 3. Lộ trình Triển khai Phase A (Lát cắt dọc)

| Lát cắt | Tên Lát cắt & Trọng tâm Kỹ thuật | Trạng thái | Mốc ý nghĩa |
| :---: | :--- | :---: | :--- |
| **Tài liệu** | **Hoàn thiện trọn bộ 6 file Spec & Quy tắc làm việc** | **HOÀN THÀNH** | Nền móng kiến trúc đồng bộ 100% |
| **Lát 1** | **Nền tảng Dữ liệu, Schema Prisma & Cỗ máy Import Dry-run** | Sắp làm | Import dữ liệu buổi học vào DB an toàn |
| **Lát 2a** | **Thư viện Vocab/Mistakes, Ôn tập Cơ bản (SM-2 Tầng a), Web Speech & Sao lưu VACUUM** | Chưa làm | 🚀 **MỐC BẮT ĐẦU DÙNG ĐƯỢC VỚI DỮ LIỆU THẬT** |
| **Lát 2b** | **Trải nghiệm SRS Nâng cao (Tầng b), Gõ câu sai, Đục lỗ Cloze, Quota & ReviewSession** | Chưa làm | Học sâu, chống quên, lưu phiên dở dang |
| **Lát 3** | **Nhật ký Lỗi sai chi tiết & Dashboard Thống kê IELTS (Top lỗi, xu hướng tuần)** | Chưa làm | Nhìn thấy điểm yếu ngữ pháp để khắc phục |
| **Lát 4** | **Hệ thống Audio Chất lượng cao (DictionaryAPI, edge-tts, Singleton Queue, Cache)** | Chưa làm | Trải nghiệm phát âm tự nhiên hoàn hảo |

---

## 4. Hướng dẫn Câu lệnh / Prompt Mẫu khi Khởi động Phiên Làm việc Mới

Khi bắt đầu một phiên làm việc mới với bất kỳ AI nào (Claude, Gemini, ChatGPT, Cursor, Copilot, v.v.), người học chỉ cần sao chép đoạn prompt mẫu dưới đây và điền lát cắt/nhiệm vụ cần làm. Đoạn prompt này được thiết kế để "khóa chặt" ngữ cảnh, ép AI đọc tài liệu gốc và không bao giờ làm lệch hướng dự án:

```markdown
Chào bạn, chúng ta tiếp tục phát triển dự án Learn Language App (IELTS 6.5, local-first web app chạy trên Next.js App Router, SQLite, Prisma ORM).

TRƯỚC KHI LÀM BẤT KỲ ĐIỀU GÌ, BẠN BẮT BUỘC PHẢI THỰC HIỆN CÁC BƯỚC SAU:
1. Đọc file `docs/README.md` để nắm toàn bộ 6 quy tắc bất khả xâm phạm và mục lục dự án.
2. Đọc kỹ file đặc tả liên quan đến nhiệm vụ hôm nay trong thư mục `docs/`.
3. Tuân thủ tuyệt đối các quyết định kỹ thuật trong bảng Nhật ký Quyết định (ADR) của các file spec. Không tự ý thay đổi kiến trúc hoặc thư viện (Node 24, Next.js 16.4.2, Prisma 7.10.1, better-sqlite3 13.0.3, CSS Modules, Zod, Vitest).
4. KHÔNG tự ý tạo file hoặc viết mã nguồn ngoài phạm vi nhiệm vụ được giao.
5. Sau mỗi lần sửa đổi hoặc tạo file, hãy chạy git add, git commit và git push origin main.

Nhiệm vụ cụ thể của phiên hôm nay:
[ĐIỀN NHIỆM VỤ CỤ THỂ VÀO ĐÂY, VÍ DỤ: "Triển khai Lát 1: Cài đặt dependencies, cấu hình Prisma 7 với adapter better-sqlite3, viết schema.prisma và script migrate có backup"]
```
