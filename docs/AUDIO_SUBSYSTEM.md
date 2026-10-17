# ĐẶC TẢ HỆ THỐNG PHÁT ÂM & ÂM THANH (AUDIO SUBSYSTEM SPECIFICATION)

## 1. Phân định Lộ trình Triển khai (Phase Markers)

Để người học có thể bắt đầu sử dụng ứng dụng ngay từ sớm với dữ liệu thật, hệ thống phát âm được chia tách dứt khoát theo hai lát cắt:

- **Lát cắt 2a (MVP Khởi điểm - Sử dụng ngay):**
  - Sử dụng **Web Speech API thuần túy của trình duyệt**.
  - Hoàn toàn chưa tích hợp `DictionaryAPI`, chưa tích hợp `edge-tts`, và chưa có hàng đợi tải ngầm.
  - Mục tiêu: Có âm thanh phát âm ngay lập tức cho từ và câu mà không đòi hỏi hạ tầng backend phức tạp.
- **Lát cắt 4 (Nâng cấp Hoàn thiện - Audio Chất lượng cao):**
  - Tích hợp phát âm từ điển chuẩn người thật qua `DictionaryAPI`.
  - Tích hợp giọng đọc AI tự nhiên qua `TtsProvider` (`node-edge-tts`).
  - Xây dựng hàng đợi tải ngầm Singleton, cơ chế tự phục hồi, lưu cache cục bộ và route handler stream audio.

---

## 2. Kiến trúc Phát âm Phân tầng (Tiered Audio Architecture - Lát 4)

Sau khi hoàn thành Lát 4, hệ thống vận hành theo cơ chế phân tầng 3 lớp độc lập:

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

### 2.1. Điều kiện Chuyển tầng (Fallback Conditions)
- **Từ Tầng 1 (DictionaryAPI) sang Tầng 2 (TtsProvider):**
  - Mã HTTP khác `200` (ví dụ `404 Not Found` từ DictionaryAPI đối với từ hiếm hoặc cụm từ).
  - Phản hồi JSON có trường `phonetics` nhưng không có phần tử nào chứa chuỗi `audio` hợp lệ.
  - Quá thời gian chờ (Timeout $> 5000\text{ms}$).
- **Từ Tầng 2 (TtsProvider) sang Tầng 3 (Web Speech API):**
  - Mất kết nối internet (thiết bị đang offline).
  - Microsoft Edge TTS endpoint trả về lỗi kết nối WSS, mã lỗi 403 hoặc 429.
  - File audio bị lỗi định dạng hoặc không thể ghi vào đĩa cục bộ.

---

## 3. Khảo sát Thực tế, Bằng chứng Gói & Cảnh báo Kỹ thuật

### 3.1. Khảo sát DictionaryAPI (`api.dictionaryapi.dev`)
- **Tình trạng khả dụng:** Đã kiểm tra thực tế ngày 17/10/2026 với từ *"achieve"*, API trả về danh sách `phonetics` chứa liên kết audio trực tiếp từ Wikimedia:
  `https://api.dictionaryapi.dev/media/pronunciations/en/achieve-us.mp3`.
- **Cơ chế lọc giọng en-US:** Backend duyệt mảng `phonetics` và ưu tiên lấy URL chứa `-us.mp3` hoặc `en-us`.
- **Giới hạn tần suất:** Dịch vụ công cộng miễn phí không cần API key. Hàng đợi tải ngầm giới hạn 1 request / 1.5 giây để tránh lỗi 429.

### 3.2. Bằng chứng Thực tế Gói `node-edge-tts`
- **Kết quả kiểm tra thực tế qua npm registry:**
  ```text
  version = '1.2.11'
  time.modified = '2026-10-12T16:27:28.021Z'
  ```
  - Lịch sử phát hành: Gói có tổng cộng 20 bản phát hành từ năm 2023 đến nay. Tần suất phát hành đạt khoảng **2–4 bản vá mỗi năm**, chủ yếu phát hành khi Microsoft thay đổi header hoặc endpoint WebSocket.
  - Kho mã nguồn GitHub (`SchneeHertz/node-edge-tts`): 157 stars, 2 issue mở tại thời điểm kiểm tra.
- **CẢNH BÁO KỸ THUẬT QUAN TRỌNG:**
  > [!WARNING]
  > `edge-tts` hoạt động dựa trên cơ chế phân tích ngược (Reverse Engineering) endpoint WebSocket nội bộ của trình duyệt Microsoft Edge. Dịch vụ này **không có SLA chính thức từ Microsoft** và có thể bị thay đổi giao thức, chặn IP hoặc ngừng hoạt động bất cứ lúc nào mà không báo trước.
  > Ứng dụng **chỉ sử dụng cho mục đích cá nhân, học tập, chạy cục bộ**. Cơ chế dự phòng Web Speech API ở Tầng 3 là mắt xích an toàn bắt buộc để ứng dụng không bao giờ bị gián đoạn học tập.

---

## 4. Cách Dùng Thư viện `node-edge-tts` & Interface `TtsProvider`

### 4.1. Lưu ý Cốt lõi về Cấu hình Mặc định của Thư viện
- **Cảnh báo ngôn ngữ:** Thư viện `node-edge-tts` có cấu hình mặc định là `voice: "zh-CN-XiaoyiNeural"` và `lang: "zh-CN"` (tiếng Trung). Do đó, trong mã nguồn gọi thư viện, **BẮT BUỘC PHẢI TRUYỀN RÕ RÀNG**:
  ```typescript
  voice: 'en-US-AriaNeural',
  lang: 'en-US'
  ```
- **Cơ chế ghi file:** Thư viện nhận tham số đầu vào là đường dẫn file (`filepath`) và trực tiếp ghi stream ra file đó. Để tránh tình trạng file bị lỗi dở dang khi mất mạng giữa chừng, `TtsProvider` bắt buộc thực hiện **ghi nguyên tử (Atomic File Write)**: ghi ra file tạm (`.tmp`), sau đó gọi `fs.renameSync` sang tên file cuối cùng.

### 4.2. Khai báo Interface `TtsProvider` (`src/lib/audio/tts-provider.ts`)
```typescript
export interface TtsSynthesizeOptions {
  voice?: string;  // Bắt buộc: 'en-US-AriaNeural'
  lang?: string;   // Bắt buộc: 'en-US'
  rate?: string;   // 'default' hoặc '+0%'
  pitch?: string;  // 'default' hoặc '+0Hz'
}

export interface TtsProvider {
  /**
   * Tổng hợp giọng đọc và lưu trực tiếp ra file đích an toàn
   * @param text Đoạn văn bản cần đọc (tối đa 300 ký tự)
   * @param destinationFilePath Đường dẫn tuyệt đối tới file .mp3 cuối cùng
   * @param options Cấu hình giọng đọc
   * @returns Đường dẫn tới file audio đã tạo thành công
   */
  synthesizeToFile(
    text: string,
    destinationFilePath: string,
    options?: TtsSynthesizeOptions
  ): Promise<string>;
}
```

---

## 5. Hai Đường Tải Audio & Hàng Đợi Ngầm Singleton

### 5.1. Hai Tuyến Vận Hành (Dual Delivery Pipelines)
Hệ thống kết hợp cả hai cơ chế để mang lại trải nghiệm tối ưu:
1. **Tuyến 1: Tải ngầm Mặc định (Default Background Queue):** Ngay sau khi Import dữ liệu thành công, toàn bộ từ vựng và câu ví dụ mới được đưa vào hàng đợi `audioQueue` để tải ngầm lần lượt ở backend. Giao diện hiển thị thanh tiến độ nhẹ qua polling mỗi 2 giây.
2. **Tuyến 2: Tải theo Yêu cầu Dự phòng (On-demand Priority Bump):**
   - Khi người học bấm nút nghe mà mục đó đang ở trạng thái `audioStatus === 'PENDING'` hoặc `FAILED`:
   - Giao diện **phát ngay lập tức qua Web Speech API** để người học nghe tức thì trong vòng 50ms mà không phải chờ đợi.
   - Đồng thời, backend **đẩy mục này lên đầu hàng đợi (Priority Queue)** để ưu tiên tải file mp3 chất lượng cao ngay tiếp theo.

### 5.2. Khởi tạo Singleton Queue trên `globalThis`
Để tránh việc Next.js tạo mới nhiều hàng đợi khi reload mã nguồn trong môi trường dev (Hot Module Replacement):

```typescript
// src/lib/audio/queue.ts
declare global {
  var __audioQueue: AudioQueueService | undefined;
}

export class AudioQueueService {
  private concurrencyLimit = 1; // 1-2 tác vụ đồng thời
  private isProcessing = false;
  // Hàng đợi ưu tiên (Priority FIFO Queue)
}

export const audioQueue = globalThis.__audioQueue ?? (globalThis.__audioQueue = new AudioQueueService());
```

### 5.3. Quản lý Trạng thái & Cơ chế Tự Phục hồi khi Khởi động
- **4 Trạng thái đồng bộ CSDL (`Word.audioStatus`, `Sentence.audioStatus`):**
  - `PENDING`: Đang chờ trong hàng đợi.
  - `PROCESSING`: Đang trong tiến trình tải từ DictionaryAPI / edge-tts.
  - `READY`: Đã tải và lưu file audio cục bộ thành công.
  - `FAILED`: Thất bại khi `audioAttempts >= MAX_AUDIO_ATTEMPTS` (`MAX_AUDIO_ATTEMPTS = 3` lần retry với exponential backoff 1s, 2s, 4s). Giao diện hiển thị nút **"Thử lại"** (người học bấm vào sẽ reset về `PENDING`, tăng `audioAttempts` và đưa lại vào hàng đợi).
- **Cơ chế Kích hoạt khi Khởi động Ứng dụng:**
  Được kích hoạt thông qua hook khởi động chuẩn của Next.js App Router tại file `src/instrumentation.ts` (chỉ chạy trong môi trường Node.js runtime):
  ```typescript
  // src/instrumentation.ts
  export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      const { runAudioRecovery } = await import('@/services/audio-recovery.service');
      await runAudioRecovery();
    }
  }
  ```
  - Tự động nạp lại toàn bộ các bản ghi `PENDING` vào hàng đợi.
  - Quét các bản ghi bị kẹt ở trạng thái `PROCESSING` quá 5 phút (do ứng dụng bị tắt đột ngột khi đang tải) và đặt lại thành `PENDING` để xử lý lại.

---

## 6. Lưu trữ File Cục bộ & Tuyến Route Handler Audio

### 6.1. Quy tắc Băm Tên File Bao gồm Nguồn (Source-tagged Hashing)
- File được lưu tại thư mục: `/data/audio/[sha256].mp3` (nằm ngoài thư mục `public/` để bảo vệ mã nguồn).
- **Chuỗi băm định danh:** Để tránh va chạm giữa file từ điển người thật và file tổng hợp AI, nguồn dữ liệu được đưa vào chuỗi băm:
  $$\text{fileName} = \text{sha256}(\text{source} + \text{"::"} + \text{normalize}(text) + \text{"::"} + voice + \text{"::"} + rate) + \text{".mp3"}$$
  *(Trong đó `source` là `'dictionaryapi'` hoặc `'edge-tts'`)*.

### 6.2. Route Handler Phục vụ Audio (`src/app/api/audio/[filename]/route.ts`)
- **Phòng chống Path Traversal:** Bắt buộc kiểm tra tên file bằng regex nghiêm ngặt:
  ```typescript
  const VALID_AUDIO_FILENAME_REGEX = /^[a-f0-9]{64}\.mp3$/;
  if (!VALID_AUDIO_FILENAME_REGEX.test(filename)) {
    return new Response('Tên file âm thanh không hợp lệ', { status: 400 });
  }
  ```
- **Hỗ trợ HTTP Range Requests:** Xử lý header `Range: bytes=start-end` để trả về mã `206 Partial Content` kèm `Content-Type: audio/mpeg`. Giúp người học có thể tua âm thanh mượt mà và audio bắt đầu phát ngay tức thì.
- **Cache-Control Dài hạn:** Do tên file là chuỗi băm của nội dung bất biến, Route Handler đính kèm header cache vĩnh viễn:
  ```http
  Cache-Control: public, max-age=31536000, immutable
  ```

---

## 7. Chi tiết Cơ chế Dự phòng Web Speech API ở Trình duyệt

```typescript
// src/components/AudioPlayer.tsx
export async function playWebSpeech(text: string): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const synth = window.speechSynthesis;
  synth.cancel();

  // Đảm bảo danh sách giọng đã nạp (có timeout tối đa 1000ms)
  let voices = synth.getVoices();
  if (voices.length === 0) {
    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => resolve(), 1000);
      synth.onvoiceschanged = () => {
        clearTimeout(timeoutId);
        resolve();
      };
    });
    voices = synth.getVoices();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.95;

  // Khi thiết bị offline: Ưu tiên chọn giọng localService (chạy offline trên máy)
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const usVoice = voices.find(v => 
    (v.lang === 'en-US' || v.lang === 'en_US') && (!isOffline || v.localService)
  ) || voices.find(v => v.lang === 'en-US' || v.lang === 'en_US');

  if (usVoice) utterance.voice = usVoice;
  synth.speak(utterance);
}
```

---

## 8. Quyền Riêng Tư (Privacy) & An Toàn Dữ Liệu

1. **Dữ liệu Gửi Ra Ngoài Internet:**
   - Khi tải phát âm, ứng dụng chỉ gửi chuỗi văn bản tiếng Anh thuần túy (`word` gửi sang DictionaryAPI, `sentence` gửi sang Microsoft Edge Speech WebSocket).
   - Tuyệt đối không gửi kèm bất kỳ thông tin cá nhân, định danh người dùng, hay lịch sử học tập ra ngoài máy tính.
2. **Công tắc "Chỉ Dùng Giọng Trình Duyệt" (Offline Mode Only):**
   - Trong màn hình Cài đặt, người học có thể bật tùy chọn *"Chỉ dùng giọng đọc trình duyệt (Offline Mode)"*.
   - Khi bật, hệ thống sẽ ngắt hoàn toàn mọi request ra bên ngoài, 100% âm thanh chạy cục bộ qua Web Speech API.

---

## 9. Chính sách Lưu trữ & Ước tính Dung lượng Ổ cứng

- **Chính sách Không Tự Động Xóa:** Các file audio trong `/data/audio/` không bao giờ bị xóa tự động vì file được tái sử dụng theo hash nội dung.
- **Ước tính Dung lượng:**
  - File phát âm từ vựng (DictionaryAPI): $\approx 20\text{ KB}$ / từ.
  - File phát âm câu ví dụ (edge-tts): $\approx 40\text{ KB}$ / câu.
  - Mỗi buổi học trung bình: 10 từ + 10 câu ví dụ $\rightarrow \approx 600\text{ KB}$ / buổi.
  - Sau 365 buổi học (12 tháng): $\approx 220\text{ MB}$. Hoàn toàn không gây áp lực lên dung lượng laptop.

---

## 10. Kế hoạch Kiểm thử & Ngưỡng Hiệu năng DoD

1. **Bộ Kiểm thử Tự động:**
   - Mock `TtsProvider` để kiểm thử logic hàng đợi, timeout và retry exponential backoff (1s, 2s, 4s).
   - Kiểm thử tính idempotent: Gọi sinh audio 2 lần cho cùng một câu $\rightarrow$ xác nhận `synthesizeToFile` chỉ được gọi 1 lần.
2. **Ngưỡng Hiệu năng Đo lường trên Production (`next build && next start`):**
   - Tốc độ phát file mp3 cục bộ: Bắt đầu phát âm trong vòng **$< 100\text{ms}$**.
   - Tốc độ chuyển đổi sang Web Speech API: Phát âm thanh thay thế trong vòng **$< 500\text{ms}$** khi offline hoặc file lỗi.

---

## 11. Nhật ký Quyết định (Decision Log / ADR)

| Ngày | Quyết định | Lý do kỹ thuật | Phương án đã loại |
| :--- | :--- | :--- | :--- |
| **2026-10-17** | **Cố định giọng `en-US-AriaNeural` cho `edge-tts`.** | Giọng nữ Bắc Mỹ tự nhiên, ngữ điệu rõ ràng, phát âm chuẩn cho người luyện thi IELTS; giữ cấu hình tinh gọn. | Cung cấp giao diện chọn giọng nam/nữ (phức tạp hóa cài đặt giai đoạn đầu). |
| **2026-10-17** | **Kết hợp Hàng đợi Tải ngầm và Tải theo Yêu cầu.** | Import không bị nghẽn; khi người học bấm loa mà file chưa có thì nghe ngay qua Web Speech và tự động đẩy mục đó lên đầu hàng đợi. | Chỉ tải ngầm (gây chờ đợi nếu người học vào ôn ngay) hoặc chỉ tải on-demand (gây trễ mỗi lần bấm). |
| **2026-10-17** | **Thêm `source` vào chuỗi băm tên file.** | Phân định rõ ràng giữa file phát âm từ điển người thật (`dictionaryapi`) và file tổng hợp AI (`edge-tts`). | Chỉ băm theo text + voice (dễ xung đột khi đổi nguồn phát âm cho từ). |
| **2026-10-17** | **Ghi nguyên tử qua file `.tmp` trước khi đổi tên.** | Tránh tình trạng file audio bị lỗi dở dang nếu ứng dụng bị tắt hoặc rớt mạng khi đang ghi stream. | Ghi trực tiếp vào file đích. |
| **2026-10-17** | **Tách biệt rạch ròi Lát 2a (Web Speech) và Lát 4 (Audio chất lượng cao).** | Giúp người học đưa ứng dụng vào học thật sớm nhất có thể ở Lát 2a mà không bị nghẽn bởi hạ tầng âm thanh. | Cố gắng hoàn thiện toàn bộ edge-tts ngay từ đầu. |
