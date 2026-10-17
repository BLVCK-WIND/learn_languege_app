# TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)

## 1. Mục tiêu và Người dùng
- **Người dùng duy nhất:** Phong, sinh viên ngành Công nghệ phần mềm.
- **Mục tiêu học tập:** Đạt chứng chỉ IELTS 6.5 trong vòng 12 tháng (trình độ xuất phát: A2–B1).
- **Thói quen học tập:** Khoảng 1 giờ mỗi ngày trên laptop cá nhân, học thông qua tương tác chat với AI tutor.
- **Đặc thù bài toán:** Không dùng sách vở giấy bút; cần một công cụ ghi nhớ, lưu vết và chủ động ôn tập kiến thức sau mỗi buổi học để chống quên.
- **Mô hình triển khai:** Ứng dụng web cá nhân, chạy cục bộ (local-first), phục vụ duy nhất 1 người dùng trên máy tính cá nhân.

---

## 2. Triết lý Kho dữ liệu Trung tâm & Các "Cách nhìn" (Views)
- **Kho dữ liệu duy nhất (Single Source of Truth):** Toàn bộ dữ liệu được chuẩn hóa và quản lý tập trung trong một cơ sở dữ liệu quan hệ gồm các thực thể cốt lõi: `Session`, `SessionItem`, `Word`, `Sentence`, `Mistake`, `ReviewState`, và sau này là `GrammarPoint`.
- **Góc nhìn tự sinh (Projection Views):** Các tính năng người dùng thao tác không phải là các module lưu trữ rời rạc mà là các "lăng kính" chiếu từ kho dữ liệu trung tâm:
  - Thẻ Flashcard ôn tập (SRS) là một góc nhìn trực quan từ `ReviewState` liên kết với `Word` hoặc `Mistake`.
  - Các dạng bài tập (đục lỗ, trắc nghiệm, sắp xếp câu, sửa lỗi ở Phase B) được thuật toán tự sinh trực tiếp từ các câu trong bảng `Sentence` và các cặp câu sai/đúng trong `Mistake`.

---

## 3. Phạm vi Dự án (Phase A) và Giới hạn ngoài phạm vi

### 3.1. Trong phạm vi Phase A (MVP)
1. **Trang Import:** Tiếp nhận dữ liệu JSON xuất từ AI tutor sau mỗi buổi học, chạy kiểm tra đối soát (Dry-run) và ghi dữ liệu nguyên tử (Atomic transaction).
2. **Kho Từ vựng:** Lưu trữ chi tiết từ, từ loại (POS), phiên âm IPA, nghĩa tiếng Việt, câu ví dụ thực tế.
3. **Âm thanh (Audio):** 
   - Tạm thời dùng Web Speech API (ở Lát 2a).
   - Nâng cấp phát âm phân tầng chuẩn: DictionaryAPI cho từ vựng $\rightarrow$ `edge-tts` cho câu ví dụ $\rightarrow$ Web Speech API làm dự phòng (ở Lát 4).
4. **Hệ thống Lặp lại Ngắt quãng (SRS):**
   - Thuật toán Modified SM-2 với thang 3 nút đánh giá (*Quên / Khó nhớ / Nhớ rõ*).
   - Chu trình xử lý thẻ quên trong phiên (tối đa 3 lần re-queue, phạt lapse 1 lần duy nhất).
   - Lưu trạng thái phiên ôn dở dang trực tiếp trong CSDL; hỗ trợ nút "Kết thúc hôm nay".
   - Tính ngày học theo múi giờ Việt Nam (UTC+7), mốc sang ngày mới lúc 04:00 sáng.
5. **Nhật ký Lỗi sai & Thống kê:** 
   - Lưu trữ câu sai, câu đúng, giải thích tiếng Việt, phân loại theo 13 mã danh mục chuẩn hóa.
   - Thống kê Top 5 lỗi hay gặp, xu hướng lỗi theo tuần và danh sách câu sai gần đây.
6. **Bảo toàn Dữ liệu:** Tự động sao lưu SQLite bằng `VACUUM INTO` trước mỗi lần migration; tính năng xuất và khôi phục toàn vẹn dữ liệu từ JSON.

### 3.2. Ngoài phạm vi (Out of Scope)
- **Kỹ năng Listening:** Người dùng đã có phần mềm chuyên biệt riêng.
- **Tự động bắt lỗi ngữ pháp thời gian thực (như LanguageTool):** Chỉ ghi nhận lỗi thực tế từ buổi học với AI tutor.
- **Ứng dụng di động (Mobile App) & Multi-tenancy:** Không xây dựng app di động hay cơ chế đăng nhập nhiều người dùng trong giai đoạn này.

---

## 4. Lộ trình Tổng thể (A $\rightarrow$ D) & Các Lát cắt Phase A

### 4.1. Lộ trình tổng thể
- **Giai đoạn A (MVP):** Nền tảng dữ liệu, Import JSON, Kho từ vựng, SRS Flashcard, Nhật ký & Thống kê lỗi sai, Hệ thống Audio hoàn chỉnh.
- **Giai đoạn B (Practice Engine):** Bộ sinh bài tập tự động từ kho dữ liệu (đục lỗ, trắc nghiệm, sắp xếp từ, sửa câu sai, dịch gõ).
- **Giai đoạn C (Expansion):** Thư viện ngữ pháp, Trình đọc văn bản bấm lưu từ vựng, Nhật ký viết luận song song (tô màu theo loại lỗi).
- **Giai đoạn D (Advanced):** Tự động phân tích bài viết, luyện nói nhận diện giọng (STT), dashboard tổng thể đa kỹ năng.

### 4.2. Kế hoạch triển khai Phase A theo Lát cắt dọc (Vertical Slices)
*(Ước lượng: 1 buổi cuối tuần $\approx$ 2 – 3 giờ làm việc tập trung)*

1. **Lát 1: Nền tảng Dữ liệu & Cỗ máy Import Dry-run (~1–2 buổi)**
   - Cài đặt Next.js App Router, Prisma ORM, SQLite, Zod.
   - Xây dựng schema CSDL với khóa tự nhiên và cơ chế băm chống trùng.
   - Pipeline import 2 bước: Dry-run kiểm tra diff (thêm/gộp/bỏ qua/lỗi) $\rightarrow$ Commit trong 1 transaction duy nhất.
2. **Lát 2a: Thư viện, Ôn tập Cơ bản, Web Speech & Sao lưu (~2 buổi) $\rightarrow$ 🚀 *MỐC BẮT ĐẦU DÙNG ĐƯỢC VỚI DỮ LIỆU THẬT***
   - Giao diện danh sách Từ vựng và Lỗi sai.
   - Flashcard 3 nút đánh giá với thuật toán Modified SM-2 (scheduler nhận `now: Date`).
   - Phát âm tích hợp qua Web Speech API (chờ nạp giọng, chọn `en-US`).
   - An toàn dữ liệu: Tự động sao lưu SQLite bằng `VACUUM INTO` trước migration; API Xuất và Nhập khôi phục JSON (có test round-trip).
3. **Lát 2b: Trải nghiệm SRS Nâng cao & Bền vững (~2 buổi)**
   - Thẻ Mistake: Bắt buộc gõ lại câu đúng ở mặt trước rồi mới lật xem đáp án.
   - Thẻ Word: 3 chế độ hiển thị (Từ $\rightarrow$ Nghĩa, Nghĩa $\rightarrow$ Từ, Đục lỗ câu).
   - Vòng lặp re-queue tối đa 3 lần cho thẻ quên, phạt lapse 1 lần duy nhất trong phiên.
   - Lưu trạng thái phiên ôn dở dang vào bảng `ReviewSession` trong DB; nút "Kết thúc hôm nay"; hạn ngạch (quota) tách biệt cho từ và lỗi.
4. **Lát 3: Nhật ký Lỗi chi tiết & Dashboard Thống kê IELTS (~1–2 buổi)**
   - Bộ lọc danh sách lỗi theo 13 mã danh mục chuẩn kebab-case.
   - Dashboard phân tích: Top 5 lỗi hay mắc, số lỗi theo tuần theo nhóm, danh sách câu sai gần đây.
5. **Lát 4: Audio Chất lượng cao & Hàng đợi Tải ngầm (~2 buổi)**
   - Bọc thư viện Node `edge-tts` sau `TtsProvider` interface; tải audio từ DictionaryAPI về lưu cục bộ.
   - Hàng đợi ngầm Singleton (`globalThis`) chống dev reload, polling tiến độ mỗi 2s, retry backoff.
   - Lưu cache audio tại `data/audio/[sha256].mp3` (nằm ngoài `public/`), phát qua route handler stream.

---

## 5. Câu hỏi còn mở (Open Questions)
1. **Lựa chọn gói thư viện Node `edge-tts` cụ thể:** Ở Lát 4, sẽ cần kiểm tra thực tế trên npm giữa các package (như `edge-tts-node` hoặc giao thức WebSocket thuần) để đánh giá ngày phát hành gần nhất và số issue mở trước khi ghim phiên bản.
2. **Lựa chọn phong cách CSS ở Lát 1:** Xác định rõ việc dùng CSS Modules kết hợp CSS Variables hay Vanilla CSS thuần để tối ưu tốc độ viết giao diện mà không phá vỡ tính tùy biến.

---

## 6. Nhật ký Quyết định (Decision Log / ADR)

| Ngày | Quyết định | Lý do kỹ thuật | Phương án đã loại |
| :--- | :--- | :--- | :--- |
| **2026-10-17** | **Next.js App Router Fullstack** thay vì tách riêng Express backend. | Giảm chi phí vận hành cho app 1 người chạy local; dùng chung 100% TypeScript type; Prisma chạy trực tiếp trong Route Handlers / Server Actions; logic nghiệp vụ vẫn đóng gói tại tầng Service riêng để dễ bóc tách sau này. | Tách riêng Express API + Next.js Frontend (phức tạp hóa tiến trình chạy local, cấu hình CORS, khó chia sẻ DTO type). |
| **2026-10-17** | **Modified SM-2 với 3 mức** (*Quên, Khó nhớ, Nhớ rõ*). | Đã được kiểm chứng khoa học; tự thích ứng theo độ khó của từng từ; sàn Ease Factor $\ge 1.3$; mức "Khó nhớ" tăng tối thiểu $+1$ ngày (`Math.ceil`) để triệt tiêu lỗi kẹt interval. | Hệ thống hộp cố định Leitner (kém linh hoạt với từ khó); SM-2 gốc 6 mức (quá rườm rà cho thao tác ôn tập hàng ngày). |
| **2026-10-17** | **Prisma ORM + SQLite**. | File-based DB gọn nhẹ, zero-configuration trên máy local, hiệu năng cao với 1 người dùng; Prisma cung cấp schema trực quan và type-safe client. | PostgreSQL / MySQL (phải cài service chạy nền, tốn tài nguyên); JSON file storage thuần (không có ACID transaction, khó query quan hệ). |
| **2026-10-17** | **Khóa định danh Word là `(normalized_word, pos)`.** | Một từ có thể có nhiều từ loại khác nhau với ngữ nghĩa và cách dùng độc lập; chuẩn hóa viết thường để chống trùng lặp do viết hoa đầu câu. | Chỉ dùng mỗi từ làm khóa (bị xung đột khi từ vừa là danh từ vừa là động từ, ví dụ: *record*). |
| **2026-10-17** | **ReviewState đa hình `(itemType, itemId)`.** | Giúp thuật toán SRS hoàn toàn độc lập với thực thể dữ liệu; hàng đợi ôn tập thống nhất; dễ dàng mở rộng sang các loại thẻ ôn tập mới ở Phase B, C mà không phải sửa schema hay migration. | Khóa ngoại Nullable (`wordId?`, `mistakeId?`) vì đòi hỏi CHECK constraint phức tạp không khai báo được trực tiếp qua Prisma DSL. |
| **2026-10-17** | **Import 2 bước (Dry-run & Idempotent Atomic Commit).** | Đảm bảo tính an toàn dữ liệu: người dùng thấy trước thay đổi (thêm mới, gộp, bỏ qua, lỗi) trước khi ghi; commit toàn bộ trong 1 transaction duy nhất; dán lại file cũ không sinh rác. | Import trực tiếp không qua xem trước (dễ gây hỏng dữ liệu khi AI tutor xuất sai format). |
| **2026-10-17** | **Phát âm phân tầng (Tiered Audio).** | Tối ưu hóa chất lượng và tính khả dụng: DictionaryAPI có audio người thật cho từ; `edge-tts` có giọng AI tự nhiên cho câu dài; Web Speech API làm lưới an toàn khi offline/lỗi. | Chỉ dùng Web Speech API (giọng robot, thiếu tự nhiên); chỉ dùng cloud TTS trả phí (tốn chi phí duy trì). |
| **2026-10-17** | **`edge-tts` chạy trên Node.js bọc sau `TtsProvider`.** | Toàn bộ dự án gói gọn trong hệ sinh thái Node/TypeScript; người dùng không cần cài đặt Python, pip hay cấu hình biến môi trường Windows PATH. | Gọi Python CLI qua sub-process (phụ thuộc môi trường Python ngoài, dễ lỗi trên Windows). |
| **2026-10-17** | **Chu kỳ ngày SRS tính theo UTC+7, đổi ngày lúc 04:00 sáng.** | Phù hợp nhịp sinh hoạt học tập thực tế (phiên học đêm muộn trước 04:00 sáng vẫn tính cho ngày học hôm trước); lưu trữ UTC chuẩn hóa, tính toán theo giờ địa phương. | Đổi ngày lúc 00:00 nửa đêm (gây chia cắt phiên học nếu người dùng học qua 12h đêm). |
| **2026-10-17** | **Đưa tính năng Sao lưu an toàn & Xuất/Nhập JSON lên Lát 2a.** | Đảm bảo dữ liệu thật của người dùng được bảo vệ ngay khi bắt đầu sử dụng hàng ngày; có đường lui an toàn trước mọi can thiệp kỹ thuật. | Để sao lưu ở lát cắt cuối cùng (tiềm ẩn rủi ro mất dữ liệu học tập trong quá trình dev). |
| **2026-10-17** | **Khóa Session là `(week, day, seq)`; `studiedAt` chỉ là trường thông tin.** | Đảm bảo tính chống trùng ổn định; một ngày có thể có nhiều phiên học khác nhau phân biệt bằng `seq`; `studiedAt` mang tính ghi nhận mốc thời gian, không làm sai lệch khóa định danh. | Đưa `studiedAt` vào khóa tự nhiên (timestamp dễ gây lệch mili-giây khiến import mất tính idempotent). |
| **2026-10-17** | **Chuẩn hóa băm Sentence & Mistake chỉ trim, gộp khoảng trắng, Unicode NFC.** | Giữ nguyên chữ hoa/thường và dấu câu nguyên bản để bảo toàn giá trị của các lỗi chính tả, viết hoa và dấu câu (`capitalization-punctuation`, `spelling`). | Chuyển toàn bộ về chữ thường hoặc xóa dấu câu khi băm (làm mất ngữ cảnh lỗi sai của câu). |
| **2026-10-17** | **Cấm chạy `prisma migrate` trực tiếp; bắt buộc qua script sao lưu `VACUUM INTO`.** | Đảm bảo luôn có bản sao lưu CSDL nguyên vẹn, nhất quán trước khi có bất kỳ thay đổi nào về cấu trúc schema; tránh lỗi file SQLite bị lock do copy trực tiếp. | Copy file `.db` thủ công khi ứng dụng đang mở (dễ sinh file corrupt nếu SQLite đang ghi dở). |
