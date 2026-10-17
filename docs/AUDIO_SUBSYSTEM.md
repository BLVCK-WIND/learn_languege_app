# ĐẶC TẢ HỆ THỐNG PHÁT ÂM & ÂM THANH (AUDIO SUBSYSTEM SPECIFICATION)

## 1. Kiến trúc Phát âm Phân tầng (Tiered Audio Architecture)

Để tối ưu hóa chất lượng giọng đọc, tốc độ phản hồi và khả năng hoạt động offline, hệ thống áp dụng cơ chế phát âm phân tầng độc lập cho từ vựng và câu ví dụ:

```mermaid
graph TD
    subgraph Từ vựng (Single Word)
        W_Start[Bấm loa ở Từ vựng] --> W_Cache{Kiểm tra file local<br/>/data/audio/hash.mp3}
        W_Cache -->|Đã có| W_Play[Phát audio stream tức thì]
        W_Cache -->|Chưa có| W_Dict[Tầng 1: DictionaryAPI<br/><i>api.dictionaryapi.dev</i>]
        W_Dict -->|Thành công| W_Save[Tải về, lưu cache & phát]
        W_Dict -->|404 / Không có audio / Lỗi| W_TTS[Tầng 2: TtsProvider<br/><i>edge-tts Node.js</i>]
        W_TTS -->|Thành công| W_Save
        W_TTS -->|Lỗi mạng / Microsoft chặn| W_Speech[Tầng 3: Web Speech API<br/><i>Trình duyệt client</i>]
    end

    subgraph Câu ví dụ (Sentence)
        S_Start[Bấm loa ở Câu ví dụ] --> S_Cache{Kiểm tra file local<br/>/data/audio/hash.mp3}
        S_Cache -->|Đã có| S_Play[Phát audio stream tức thì]
        S_Cache -->|Chưa có| S_TTS[Tầng 1: TtsProvider<br/><i>edge-tts Node.js</i>]
        S_TTS -->|Thành công| S_Save[Lưu cache & phát]
        S_TTS -->|Lỗi mạng / Timeout| S_Speech[Tầng 2: Web Speech API<br/><i>Trình duyệt client</i>]
    end
```

### 1.1. Điều kiện Chuyển tầng (Fallback Conditions)
- **Từ Tầng 1 sang Tầng 2:**
  - HTTP status code khác `200` (ví dụ `404 Not Found` từ DictionaryAPI đối với các từ hiếm hoặc cụm từ).
  - Phản hồi JSON có trường `phonetics` nhưng không có phần tử nào chứa `audio` hợp lệ.
  - Quá thời gian chờ (Timeout $> 5000\text{ms}$).
- **Từ Tầng 2 sang Tầng 3 (Web Speech API):**
  - Mất kết nối internet (thiết bị đang offline).
  - Microsoft Edge TTS endpoint trả về lỗi kết nối WSS, mã lỗi 403 hoặc 429.
  - File audio bị lỗi định dạng hoặc không thể ghi vào đĩa cục bộ.

---

## 2. Kết quả Khảo sát Thực tế & Cảnh báo Dịch vụ Ngoài

### 2.1. Khảo sát DictionaryAPI (`api.dictionaryapi.dev`)
- **Tình trạng khả dụng:** Đã kiểm tra thực tế ngày 17/10/2026 với từ *"achieve"*, API trả về danh sách `phonetics` chứa liên kết audio trực tiếp từ Wikimedia:
  `https://api.dictionaryapi.dev/media/pronunciations/en/achieve-us.mp3`.
- **Cơ chế lọc giọng en-US:** Một số mục trong `phonetics` có `audio = ""` (rỗng) hoặc là giọng Anh-Anh (`-uk.mp3`). Backend duyệt mảng và ưu tiên lấy URL chứa `-us.mp3` hoặc `en-us`.
- **Giới hạn tần suất (Rate Limit):** Dịch vụ công cộng miễn phí không cần API key. Để tránh bị chặn IP (mã lỗi 429), hàng đợi tải ngầm giới hạn tốc độ 1 request / 1.5 giây.

### 2.2. Khảo sát Thư viện Node `edge-tts` & Cảnh báo Quan trọng
- **Tình trạng gói npm (`node-edge-tts`):** Phiên bản `1.2.11` (phát hành ngày 12/10/2026, kho GitHub `SchneeHertz/node-edge-tts` có 157 stars, chỉ 2 issue mở, được cập nhật thường xuyên).
- **CẢNH BÁO KỸ THUẬT QUAN TRỌNG:**
  > [!WARNING]
  > `edge-tts` hoạt động dựa trên cơ chế phân tích ngược (Reverse Engineering) endpoint WebSocket của trình duyệt Microsoft Edge. Dịch vụ này **không có SLA chính thức từ Microsoft** và có thể bị thay đổi giao thức, chặn IP hoặc ngừng hoạt động bất cứ lúc nào.
  > Ứng dụng **chỉ sử dụng cho mục đích cá nhân, học tập, chạy cục bộ**. Cơ chế dự phòng Web Speech API ở Tầng 3 là mắt xích an toàn bắt buộc để app không bao giờ bị tê liệt khi Microsoft thay đổi chính sách.

---

## 3. Giao diện `TtsProvider` & Hàng đợi Ngầm Singleton

### 3.1. Abstraction Interface (`src/lib/audio/tts-provider.ts`)
```typescript
export interface TtsSynthesizeOptions {
  voice?: string;  // Mặc định: 'en-US-AriaNeural'
  rate?: string;   // Mặc định: '0%' (tốc độ chuẩn)
  pitch?: string;  // Mặc định: '0Hz'
}

export interface TtsProvider {
  synthesizeSpeech(text: string, options?: TtsSynthesizeOptions): Promise<Buffer>;
}
```

### 3.2. Hàng đợi Tải ngầm Singleton (`globalThis.__audioQueue`)
Để chống hiện tượng Next.js tạo mới nhiều hàng đợi khi reload mã nguồn trong lúc phát triển (Hot Module Replacement), hàng đợi được gắn vào biến toàn cục của tiến trình Node:

```typescript
// src/lib/audio/queue.ts
declare global {
  var __audioQueue: AudioQueueService | undefined;
}

export class AudioQueueService {
  private concurrencyLimit = 1; // 1-2 tác vụ đồng thời
  private isProcessing = false;
  // Hàng đợi FIFO bộ nhớ
}

export const audioQueue = globalThis.__audioQueue ?? (globalThis.__audioQueue = new AudioQueueService());
```

### 3.3. Quản lý Trạng thái & Cơ chế Tự phục hồi khi Khởi động
- **Trạng thái lưu tại CSDL:** `audioStatus` trên bảng `Word` và `Sentence` gồm 4 giá trị:
  - `PENDING`: Đang chờ trong hàng đợi tải.
  - `PROCESSING`: Đang trong tiến trình tải từ DictionaryAPI / edge-tts.
  - `READY`: Đã lưu file audio cục bộ thành công.
  - `FAILED`: Tải thất bại cả 3 lần retry, đánh dấu để UI tự động rơi về Web Speech API.
- **Cơ chế phục hồi khi khởi động app (`scripts/recovery.ts`):**
  1. Toàn bộ bản ghi ở trạng thái `PENDING` được nạp lại vào hàng đợi `audioQueue`.
  2. Các bản ghi bị kẹt ở trạng thái `PROCESSING` quá 5 phút (do người dùng tắt app đột ngột khi đang tải) được reset trở lại thành `PENDING` để tái nạp.

---

## 4. Quản lý File Cục bộ & Tuyến Route Handler Audio

### 4.1. Quy tắc Đặt tên File Cache
- File được lưu tại thư mục: `/data/audio/[sha256].mp3` (nằm ngoài thư mục `public/` để bảo vệ dữ liệu).
- **Chuỗi băm định danh:**
  $$\text{fileName} = \text{sha256}(\text{normalize}(text) + \text{"::"} + voice + \text{"::"} + rate) + \text{".mp3"}$$
- **Tái sử dụng file:** Nếu cùng một câu ví dụ được dùng cho 2 từ khác nhau, file audio chỉ được sinh và lưu duy nhất một lần.

### 4.2. Route Handler Phục vụ Audio (`src/app/api/audio/[filename]/route.ts`)
- **Phòng chống tấn công Path Traversal:**
  Route handler bắt buộc kiểm tra tên file bằng biểu thức chính quy (Regex) nghiêm ngặt:
  ```typescript
  const VALID_AUDIO_FILENAME_REGEX = /^[a-f0-9]{64}\.mp3$/;
  if (!VALID_AUDIO_FILENAME_REGEX.test(filename)) {
    return new Response('Tên file âm thanh không hợp lệ', { status: 400 });
  }
  ```
  Tuyệt đối không xử lý các request chứa ký tự `..`, `/` hoặc `\`.
- **Hỗ trợ HTTP Range Requests:**
  Khi trình duyệt gửi header `Range: bytes=start-end`, Route Handler đọc đúng đoạn byte từ ổ đĩa và trả về mã `206 Partial Content` kèm `Content-Type: audio/mpeg`. Điều này giúp người học có thể tua âm thanh mượt mà và audio bắt đầu phát ngay tức thì mà không cần tải hết toàn bộ file vào bộ nhớ.
- **Giới hạn độ dài văn bản:** Tối đa **300 ký tự** cho mỗi câu gửi sang TTS.

---

## 5. Cơ chế Dự phòng Web Speech API ở Trình duyệt

Khi backend chưa tải xong audio (`audioStatus = "PENDING"`), tải lỗi (`FAILED`), hoặc khi thiết bị mất mạng:

```typescript
// src/components/AudioPlayer.tsx
export function playWebSpeechFallback(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const synth = window.speechSynthesis;
  synth.cancel(); // Hủy các âm thanh đang phát dở

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.95; // Tốc độ hơi chậm một chút để nghe rõ phát âm IELTS

  const voices = synth.getVoices();
  // Ưu tiên chọn giọng Anh-Mỹ tự nhiên
  const usVoice = voices.find(v => v.lang === 'en-US' || v.lang === 'en_US');
  if (usVoice) {
    utterance.voice = usVoice;
  }

  synth.speak(utterance);
}
```

### 5.1. Xử lý Sự kiện `voiceschanged` & Thiết bị Thiếu Giọng
- Trên trình duyệt Chrome/Edge, danh sách `getVoices()` thường tải bất đồng bộ. Ứng dụng lắng nghe sự kiện `speechSynthesis.onvoiceschanged` để nạp danh sách giọng ngay khi trang web khởi chạy.
- **Xử lý khi máy tính không có bất kỳ giọng tiếng Anh nào:** Nếu `voices.filter(v => v.lang.startsWith('en')).length === 0`, giao diện hiển thị thông báo nhẹ:  
  *"Thiết bị chưa có gói giọng đọc tiếng Anh hệ thống. Vui lòng bật mạng để nghe audio chất lượng cao hoặc cài English Voice trong Windows Settings."*

---

## 6. Chính sách Lưu trữ & Ước tính Dung lượng Ổ cứng

- **Chính sách Không Tự Động Xóa:** Các file audio trong `/data/audio/` **không bao giờ bị xóa tự động**, vì file được dùng chung theo hash nội dung và người học sẽ ôn lại các từ/câu này nhiều lần trong suốt chu kỳ 12 tháng.
- **Ước tính Dung lượng Thực tế:**
  - File phát âm từ vựng (DictionaryAPI, bitrate 64-128kbps): $\approx 20\text{ KB}$ / từ.
  - File phát âm câu ví dụ (edge-tts, bitrate 48kbps mono): $\approx 40\text{ KB}$ / câu.
  - Mỗi buổi học trung bình: 10 từ + 10 câu ví dụ $\rightarrow \approx 600\text{ KB}$ / buổi.
  - Sau 365 buổi học (12 tháng): $365 \times 600\text{ KB} \approx 220\text{ MB}$.
  - **Kết luận:** Tổng dung lượng sau 1 năm chỉ khoảng **$\sim 200 - 300\text{ MB}$**, hoàn toàn an toàn và không gây áp lực lên ổ cứng laptop.

---

## 7. Kế hoạch Kiểm thử & Ngưỡng Hiệu năng DoD

### 7.1. Bộ Kiểm thử Tự động (Unit & Integration Tests)
1. **Mock `TtsProvider`:** Bộ test giả lập trả về buffer mp3 giả lập để kiểm thử hàng đợi mà không cần gửi request thật ra ngoài internet.
2. **Kiểm thử Tính Idempotent:** Gọi hàm tải audio 2 lần cho cùng một câu $\rightarrow$ xác nhận `synthesizeSpeech` chỉ được gọi 1 lần, lần thứ hai trả về file đã có trong cache.
3. **Kiểm thử Retry với Exponential Backoff:** Giả lập lỗi kết nối 2 lần đầu và thành công ở lần 3 $\rightarrow$ xác nhận thời gian delay đúng $1\text{s} \rightarrow 2\text{s} \rightarrow \text{Thành công}$.

### 7.2. Ngưỡng Hiệu năng Đo lường trên Production (`next build && next start`)
- **Tốc độ phản hồi file mp3 cục bộ:** Audio stream bắt đầu phát trong vòng **$< 100\text{ms}$** từ lúc người học bấm loa.
- **Tốc độ chuyển đổi sang Web Speech API:** Khi rớt mạng hoặc file âm thanh lỗi, Web Speech API phát âm thanh thay thế trong vòng **$< 500\text{ms}$**, không gây giật lag hay treo UI.

---

## 8. Câu hỏi còn mở (Open Questions)

### Câu hỏi 1: Lựa chọn giọng đọc mặc định của `edge-tts`
- **Phương án A (Khuyến nghị):** Cố định giọng đọc `en-US-AriaNeural` (giọng nữ Bắc Mỹ tự nhiên, ngữ điệu rõ ràng, rất gần với các bài thi IELTS Speaking/Listening).
  - *Ưu điểm:* Nhất quán, không cần thêm giao diện cấu hình phức tạp.
- **Phương án B:** Cho phép người học chuyển đổi trong trang Cài đặt giữa `en-US-AriaNeural` (nữ) và `en-US-GuyNeural` (nam).
  - *Ưu điểm:* Đa dạng trải nghiệm nghe cho người học.

### Câu hỏi 2: Thời điểm kích hoạt tải audio khi Import
- **Phương án A (Khuyến nghị):** Tải ngầm ngay sau khi commit import thành công (Background Queue), giao diện hiển thị thanh tiến độ tải thông qua polling 2s/lần.
  - *Ưu điểm:* Khi bước vào ôn tập thẻ ở Lát 2, toàn bộ file audio đã sẵn sàng nghe ngay tức thì.
- **Phương án B:** Chỉ tải khi người học mở màn hình ôn tập hoặc bấm loa lần đầu (Lazy On-demand).
  - *Ưu điểm:* Không tải lãng phí những câu người học không bấm nghe.
  - *Nhược điểm:* Lần nghe đầu tiên sẽ có độ trễ 0.5s - 1.5s để chờ tải.

---

## 9. Nhật ký Quyết định (Decision Log / ADR)

| Ngày | Quyết định | Lý do kỹ thuật | Phương án đã loại |
| :--- | :--- | :--- | :--- |
| **2026-10-17** | **DictionaryAPI ưu tiên cho từ đơn, `edge-tts` cho câu ví dụ.** | DictionaryAPI có audio phát âm người thật trong từ điển; `edge-tts` có AI neural synthesis cực kỳ tự nhiên cho câu dài. | Chỉ dùng 1 nguồn duy nhất (hoặc thiếu audio người thật, hoặc tốn request TTS cho từ đơn). |
| **2026-10-17** | **Web Speech API làm lưới an toàn cấp 3.** | Bảo vệ ứng dụng luôn phát âm được khi offline hoặc khi Microsoft Edge WSS gặp sự cố. | Không có fallback (khiến người học bị gián đoạn ôn tập khi rớt mạng). |
| **2026-10-17** | **Lưu file cache tại `/data/audio/[sha256].mp3` ngoài `public/`.** | Bảo vệ dữ liệu cá nhân trong repo public; stream qua route handler hỗ trợ kiểm tra bảo mật regex và HTTP Range requests. | Lưu trực tiếp vào thư mục `public/audio/` (dễ bị truy cập tùy tiện và đưa nhầm vào git). |
| **2026-10-17** | **Singleton Queue trên `globalThis.__audioQueue`.** | Ngăn ngừa việc tạo trùng lặp hàng đợi và tải đè file khi Next.js hot reload trong môi trường phát triển. | Khởi tạo queue thông thường ở mức module (bị tạo mới liên tục khi HMR). |
| **2026-10-17** | **Route handler chỉ nhận tên file hex 64 ký tự.** | Ngăn chặn tuyệt đối lỗ hổng tấn công Path Traversal (`../../etc/passwd`). | Nhận tên file tự do từ query param. |
