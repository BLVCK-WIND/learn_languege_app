# ĐẶC TẢ THUẬT TOÁN LẶP LẠI NGẮT QUÃNG (SRS ALGORITHM SPECIFICATION)

## 1. Bảng Định nghĩa Hằng số Thuật toán (Modified SM-2)

Thuật toán SRS trong dự án được điều chỉnh từ SM-2 kinh điển để phù hợp với thang 3 nút đánh giá (*Quên / Khó nhớ / Nhớ rõ*), tối ưu cho người học IELTS với quỹ thời gian 1 giờ mỗi ngày.

| Tên Hằng số | Giá trị | Vai trò / Công thức áp dụng | Lý do chọn lựa kỹ thuật |
| :--- | :--- | :--- | :--- |
| `INITIAL_EASE_FACTOR` | `2.50` | Hệ số dễ nhớ khởi điểm của thẻ mới | Chuẩn mực của thuật toán SM-2; độ co giãn giãn cách 250% là điểm cân bằng tốt cho người mới bắt đầu. |
| `MIN_EASE_FACTOR` | `1.30` | Sàn Ease Factor tối thiểu (không thể tụt dưới mức này) | Ngăn ngừa hiện tượng "Ease Hell" (thẻ bị kẹt ở hệ số quá thấp khiến ngày nào cũng phải ôn lặp lại vô ích). |
| `FIRST_INTERVAL` | `1` ngày | Khoảng cách sau lần đầu tiên trả lời đúng | Đảm bảo củng cố trí nhớ ngắn hạn sau 24 giờ kể từ khi nạp từ mới. |
| `SECOND_INTERVAL` | `4` ngày | Khoảng cách sau lần thứ hai trả lời "Nhớ rõ" | *(Giá trị khởi điểm)* Bước đệm 4 ngày giúp kiến thức chuyển từ trí nhớ ngắn hạn sang trung hạn trước khi áp dụng hệ số nhân EF. |
| `HARD_MULTIPLIER` | `1.20` | Hệ số nhân khoảng cách khi đánh giá "Khó nhớ" | Giúp thẻ giãn cách chậm hơn bình thường (chỉ tăng 20%) để củng cố lại. |
| `MIN_HARD_INTERVAL_INCREASE` | `1` ngày | Bước tăng tối thiểu khi đánh giá "Khó nhớ" | Triệt tiêu lỗi kẹt khoảng cách: nếu `interval = 1`, `ceil(1 * 1.2) = 2` (tăng ít nhất 1 ngày), không bao giờ bị dậm chân tại chỗ. |
| `FORGOTTEN_EF_DELTA` | `-0.20` | Mức giảm Ease Factor khi bấm "Quên" | Phạt độ khó khi người học quên từ; **chỉ áp dụng duy nhất 1 lần trong phiên** dù thẻ bị re-queue nhiều lần. |
| `HARD_EF_DELTA` | `-0.15` | Mức giảm Ease Factor khi bấm "Khó nhớ" | Giảm nhẹ độ dễ nhớ để từ này xuất hiện thường xuyên hơn ở các vòng sau. |
| `REMEMBERED_EF_DELTA` | `+0.10` | Mức tăng Ease Factor khi bấm "Nhớ rõ" | Tưởng thưởng khi nhớ tốt, giúp thẻ giãn cách xa hơn ở các chu kỳ tiếp theo. |
| `MAX_INTRA_SESSION_REQUEUES` | `3` lần | Số lần tối đa một thẻ "Quên" được xuất hiện lại trong phiên | Tránh vòng lặp vô tận gây ức chế khi người học gặp từ quá khó trong buổi học 1 giờ. |

---

## 2. Công thức Toán học & Chuyển trạng thái Thẻ

Hàm tính toán được thiết kế là một **hàm thuần (Pure Function)** nhận trạng thái hiện tại và trả về trạng thái mới.

```typescript
export type Rating = 'FORGOTTEN' | 'HARD' | 'REMEMBERED';

export interface ReviewStateInput {
  interval: number;       // Khoảng cách hiện tại (ngày)
  easeFactor: number;     // Hệ số Ease Factor hiện tại
  repetitions: number;    // Số lần đạt chuẩn liên tiếp
  lapseCount: number;     // Tổng số lần bị quên trong lịch sử
}

export interface ReviewStateOutput {
  interval: number;
  easeFactor: number;
  repetitions: number;
  lapseCount: number;
}
```

### 2.1. Quy tắc xử lý chi tiết theo từng nút bấm

#### 1. Mức "Quên" (`FORGOTTEN`)
- **Mục đích:** Xử lý khi người học không nhớ từ hoặc gõ sai câu sửa lỗi.
- **Công thức:**
  $$\text{interval} = 1$$
  $$\text{repetitions} = 0$$
  $$\text{lapseCount} = \text{currentLapseCount} + 1$$
  $$\text{easeFactor} = \max(\text{MIN\_EASE\_FACTOR}, \text{currentEF} - 0.20)$$

#### 2. Mức "Khó nhớ" (`HARD`)
- **Mục đích:** Người học nhớ được nhưng tốn nhiều thời gian suy nghĩ hoặc cảm thấy không chắc chắn.
- **Công thức:**
  $$\text{interval} = \max(\text{currentInterval} + 1, \lceil \text{currentInterval} \times 1.20 \rceil)$$
  $$\text{repetitions} = \text{currentRepetitions} \quad (\text{giữ nguyên số lần để tiếp tục thử thách})$$
  $$\text{easeFactor} = \max(\text{MIN\_EASE\_FACTOR}, \text{currentEF} - 0.15)$$

#### 3. Mức "Nhớ rõ" (`REMEMBERED`)
- **Mục đích:** Người học nhớ nhanh, chuẩn xác, phát âm đúng.
- **Công thức:**
  - Nếu $\text{currentRepetitions} = 0$: $\text{interval} = 1$
  - Nếu $\text{currentRepetitions} = 1$: $\text{interval} = \text{SECOND\_INTERVAL} \ (4 \text{ ngày})$
  - Nếu $\text{currentRepetitions} \ge 2$: $\text{interval} = \text{round}(\text{currentInterval} \times \text{currentEF})$
  - Cập nhật chỉ số:
    $$\text{repetitions} = \text{currentRepetitions} + 1$$
    $$\text{easeFactor} = \text{currentEF} + 0.10$$

---

## 3. Công thức Tính Ngày đến hạn (`dueDate`)

`dueDate` luôn được biểu diễn dưới dạng chuỗi `YYYY-MM-DD` (ngày học logic). Việc tính ngày đến hạn tiếp theo được thực hiện bằng số học ngày thuần túy dựa trên mốc UTC để tránh sai lệch múi giờ:

```typescript
/**
 * Cộng thêm N ngày vào chuỗi ngày học YYYY-MM-DD
 * Sử dụng Date.UTC để đảm bảo độc lập với múi giờ máy trạm
 */
export function addDaysToStudyDate(studyDate: string, days: number): string {
  const [year, month, day] = studyDate.split('-').map(Number);
  // Tạo mốc thời gian UTC chuẩn xác
  const targetDate = new Date(Date.UTC(year, month - 1, day + days));
  
  const y = targetDate.getUTCFullYear();
  const m = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```
*Ví dụ:* Đang ở ngày học `"2026-10-17"`, thẻ có `interval = 4` $\rightarrow$ `dueDate` mới sẽ là `"2026-10-21"`.

---

## 4. Xử lý Thẻ Trễ Hạn & Kiểm soát Hàng Đợi (Overdue Management)

### 4.1. Ngăn chặn Bùng nổ Hàng đợi (Backlog Prevention)
Khi người học bận việc hoặc nghỉ học vài ngày, số lượng thẻ quá hạn có thể dồn lại rất lớn. Để đảm bảo buổi học không bị quá tải vượt quá 1 giờ:
1. **Áp dụng Hạn ngạch từ `StudyQuotaConfig`:**
   - Mỗi ngày chỉ nạp tối đa: `maxNewWordsPerDay` (ví dụ 10) và `maxNewMistakesPerDay` (ví dụ 5).
   - Mỗi ngày chỉ ôn tối đa: `maxReviewWordsPerDay` (ví dụ 50) và `maxReviewMistakesPerDay` (ví dụ 30).
   - Thẻ quá hạn vượt quá hạn ngạch sẽ được tự động xếp sang các ngày tiếp theo, không dồn toàn bộ vào một phiên.

### 4.2. Quy tắc Sắp xếp & Trộn Hàng Đợi (Queue Ordering & Interleaving)
1. **Ưu tiên thẻ trễ hạn lâu nhất:** Thẻ có `dueDate` cũ nhất được xếp lên đầu hàng đợi để củng cố các liên kết trí nhớ đang bên bờ vực bị xóa sổ.
2. **Trộn xen kẽ Từ vựng và Lỗi sai (Interleaving):** Thay vì học hết từ vựng rồi mới sửa lỗi, hàng đợi được trộn xen kẽ theo tỷ lệ **2 Từ vựng : 1 Lỗi sai**. Hiệu ứng xen kẽ này đã được chứng minh trong khoa học nhận thức giúp não bộ liên tục kích hoạt cơ chế nhận diện ngữ cảnh khác nhau.

---

## 5. Quy trình Phiên Ôn tập & Lưu trạng thái CSDL (Review Session Lifecycle)

### 5.1. Vòng lặp Xử lý Thẻ Quên trong Phiên (Intra-session Re-queueing)
- Khi người học bấm nút **"Quên"**:
  1. Thẻ bị ghi nhận phạt lapse: `interval = 1`, `easeFactor` giảm `0.20`, tăng `lapseCount`.
  2. Thẻ được gắn cờ `hasLapsedInSession = true` và đẩy xuống cuối danh sách thẻ của ngày hôm đó.
  3. Tăng biến đếm `requeueCount += 1`.
- Khi người học gặp lại thẻ này ở cuối phiên:
  - Nếu bấm "Khó nhớ" hoặc "Nhớ rõ": Thẻ được rời khỏi phiên ôn với kết quả **`interval = 1` ngày và KHÔNG tăng Ease Factor** (vì đã bị quên ở đầu phiên).
  - Nếu lại bấm "Quên":
    - **Không phạt Ease Factor lần 2** (chỉ phạt đúng 1 lần duy nhất trong phiên).
    - Nếu `requeueCount < 3`: Tiếp tục đẩy về cuối phiên.
    - Nếu `requeueCount >= 3`: Buộc thẻ kết thúc phiên với `interval = 1` để tránh người học bị kẹt trong vòng lặp vô tận.

### 5.2. Cấu trúc `queueJson` trong bảng `ReviewSession`
Trạng thái phiên ôn đang làm dở được lưu trực tiếp vào CSDL để chống mất tiến trình khi tắt máy:

```json
{
  "version": 1,
  "sessionDate": "2026-10-18",
  "currentIndex": 3,
  "completedCount": 3,
  "items": [
    {
      "reviewStateId": "clx...",
      "itemType": "WORD",
      "itemId": "clx_word_1",
      "requeueCount": 0,
      "hasLapsedInSession": false,
      "status": "COMPLETED"
    },
    {
      "reviewStateId": "clx...",
      "itemType": "MISTAKE",
      "itemId": "clx_mistake_1",
      "requeueCount": 1,
      "hasLapsedInSession": true,
      "status": "PENDING"
    }
  ]
}
```

### 5.3. Nút "Kết thúc Hôm nay" (Early Exit)
- Người học có thể bấm nút **"Kết thúc hôm nay"** bất cứ lúc nào khi hết thời gian 1 giờ.
- Các thẻ đã hoàn thành sẽ được lưu kết quả mới.
- Các thẻ còn lại (`status: "PENDING"`) giữ nguyên `dueDate` là ngày hôm nay. Khi sang ngày học tiếp theo (sau 04:00 sáng), chúng sẽ tự động được ưu tiên đưa vào hàng đợi của ngày mới.

---

## 6. Đặc tả Giao diện & Trải nghiệm Từng Dạng Thẻ (Card Formats)

### 6.1. Dạng Thẻ Lỗi Sai (`Mistake Card`)
- **Mặt trước (Prompt):**
  - Hiển thị câu sai nguyên bản: ví dụ *"I sometime play game"*.
  - Nhãn phân loại lỗi: `plural-s` (Lỗi thiếu/thừa 's' số nhiều).
  - Ô nhập văn bản (Input/Textarea): Bắt buộc người học **phải gõ lại câu sửa hoàn chỉnh** rồi mới bấm nút "Lật thẻ".
- **Mặt sau (Answer & Self-Evaluation):**
  - Hiển thị câu sửa chuẩn: *"I sometimes play games"*.
  - Hiển thị câu người học vừa gõ đặt ngay bên dưới để người học tự đối soát.
  - Lời giải thích ngữ pháp tiếng Việt: *"sometimes có s; game đếm được nên cần số nhiều"*.
  - Nút phát âm audio câu đúng.
  - **Tự chấm điểm bằng 3 nút:** *Quên / Khó nhớ / Nhớ rõ*. Hệ thống **không tự động so khớp chuỗi đúng/sai** để tôn trọng các cách hành văn thay thế hợp lệ của người học.

### 6.2. Dạng Thẻ Từ Vựng (`Word Card` với 3 Chế độ)
1. **Chế độ 1: Nhận diện (Recognition - Dành cho thẻ mới, `repetitions < 2`):**
   - Mặt trước: Từ tiếng Anh + Nút phát âm audio.
   - Mặt sau: Phiên âm IPA, từ loại, các nghĩa tiếng Việt, câu ví dụ tiếng Anh + dịch câu.
2. **Chế độ 2: Hồi tưởng chủ động (Recall - Khi `repetitions` đạt 2 hoặc 3):**
   - Mặt trước: Nghĩa tiếng Việt + Từ loại (gợi ý ngữ cảnh).
   - Mặt sau: Từ vựng tiếng Anh, IPA, Audio phát âm, câu ví dụ.
3. **Chế độ 3: Đục lỗ trong câu (Cloze Deletion - Khi `repetitions >= 4`):**
   - Mặt trước: Câu ví dụ bị đục lỗ từ vựng chính: *"I want to [...] band 6.5 within a year."* kèm nghĩa tiếng Việt của từ cần điền.
   - Mặt sau: Câu hoàn chỉnh, từ vựng cần điền, phát âm cả câu.

---

## 7. Bộ Kiểm thử Dạng Bảng Bắt buộc (Table-driven Test Matrix)

Scheduler bắt buộc phải vượt qua ma trận kịch bản kiểm thử sau (nhận `now: Date` làm tham số):

| STT | Tên Kịch bản Test | Đầu vào (`interval`, `EF`, `rep`, `lapse`) | Nút chấm | Kết quả Kỳ vọng (`interval`, `EF`, `rep`, `lapse`) |
| :--- | :--- | :--- | :--- | :--- |
| **TC1** | Thẻ mới tinh lần đầu bấm Nhớ rõ | `int: 0, EF: 2.50, rep: 0, lapse: 0` | `REMEMBERED` | `int: 1, EF: 2.60, rep: 1, lapse: 0` |
| **TC2** | Thẻ rep=1 bấm Nhớ rõ lần 2 | `int: 1, EF: 2.60, rep: 1, lapse: 0` | `REMEMBERED` | `int: 4, EF: 2.70, rep: 2, lapse: 0` |
| **TC3** | Thẻ rep=2 bấm Nhớ rõ lần 3 | `int: 4, EF: 2.50, rep: 2, lapse: 0` | `REMEMBERED` | `int: 10, EF: 2.60, rep: 3, lapse: 0` *(4 * 2.5 = 10)* |
| **TC4** | Thẻ đang ôn bấm Khó nhớ (bước tăng tối thiểu) | `int: 1, EF: 2.50, rep: 1, lapse: 0` | `HARD` | `int: 2, EF: 2.35, rep: 1, lapse: 0` *(max(2, ceil(1.2)) = 2)* |
| **TC5** | Thẻ interval dài bấm Khó nhớ | `int: 10, EF: 2.50, rep: 3, lapse: 0` | `HARD` | `int: 12, EF: 2.35, rep: 3, lapse: 0` *(ceil(10 * 1.2) = 12)* |
| **TC6** | Thẻ bị Quên lần đầu | `int: 14, EF: 2.50, rep: 4, lapse: 0` | `FORGOTTEN` | `int: 1, EF: 2.30, rep: 0, lapse: 1` |
| **TC7** | Thẻ bị Quên chạm sàn Ease Factor | `int: 3, EF: 1.35, rep: 1, lapse: 2` | `FORGOTTEN` | `int: 1, EF: 1.30, rep: 0, lapse: 3` *(sàn 1.30)* |
| **TC8** | Thẻ đã ở sàn 1.30 tiếp tục bị Quên | `int: 1, EF: 1.30, rep: 0, lapse: 3` | `FORGOTTEN` | `int: 1, EF: 1.30, rep: 0, lapse: 4` *(không tụt dưới 1.30)* |
| **TC9** | Tính `dueDate` qua mốc 04:00 AM UTC+7 | Giờ kiểm thử: `2026-10-17T20:59:59Z` vs `21:00:00Z` | - | Trả về ngày học `2026-10-17` vs `2026-10-18` |
| **TC10**| Tính `dueDate` qua thềm năm mới | `studyDate: "2026-12-31"`, `interval: 2` | - | `dueDate` kỳ vọng: `"2027-01-02"` |

---

## 8. Câu hỏi còn mở (Open Questions)

### Câu hỏi 1: Cơ chế tính khoảng cách cho thẻ bị trễ hạn nhiều ngày (Overdue Bonus)
Khi người học nghỉ 10 ngày mới quay lại ôn một thẻ và bấm "Nhớ rõ":
- **Phương án A (Khuyến nghị):** Tính ngày đến hạn mới bắt đầu từ **ngày học hôm nay** (`todayStudyDate + newInterval`).
  - *Ưu điểm:* Đơn giản, an toàn, không tạo bước nhảy quá xa đối với trí nhớ vừa mới được hồi phục.
- **Phương án B:** Áp dụng công thức Overdue Bonus của Anki: cộng thêm một phần số ngày trễ hạn vào khoảng cách tính toán mới:
  $$\text{newInterval} = (\text{currentInterval} + \lfloor \text{overdueDays} / 2 \rfloor) \times \text{EF}$$
  - *Ưu điểm:* Tưởng thưởng xứng đáng nếu người học vẫn nhớ từ sau một thời gian dài bỏ quên.
  - *Nhược điểm:* Có thể đẩy thẻ đi quá xa nếu lần nhớ đó chỉ là ngẫu nhiên.

### Câu hỏi 2: Hỗ trợ hiển thị trực quan khi gõ câu ở thẻ Mistake
- **Phương án A (Khuyến nghị):** Giữ nguyên nguyên tắc tự chấm điểm bằng 3 nút; bổ sung thành phần **Diff Highlight** (tô màu xanh/đỏ các từ khác nhau giữa câu người học vừa gõ và câu đúng) để mắt người học dễ dàng nhận ra chỗ sai sót của mình.
- **Phương án B:** Áp dụng thuật toán khoảng cách Levenshtein: nếu câu gõ đúng 100% từng ký tự, tự động highlight sẵn nút "Nhớ rõ" (người học vẫn có thể bấm nút khác).

---

## 9. Nhật ký Quyết định (Decision Log / ADR)

| Ngày | Quyết định | Lý do kỹ thuật | Phương án đã loại |
| :--- | :--- | :--- | :--- |
| **2026-10-17** | **Scheduler thiết kế là Pure Function nhận `now: Date`.** | Đảm bảo tính tất định (deterministic), không phụ thuộc môi trường chạy, cho phép viết các bài unit test kiểm thử chính xác các mốc thời gian chuyển ngày 04:00. | Gọi `new Date()` trực tiếp bên trong scheduler (gây khó khăn khi viết test giả lập thời gian). |
| **2026-10-17** | **Phạt lapse duy nhất 1 lần ở lần Quên đầu tiên trong phiên.** | Tránh việc một từ khó bị bấm quên 2-3 lần trong một buổi học làm Ease Factor bị trừ liên tiếp xuống đáy vực thẳm. | Trừ Ease Factor ở mọi lượt bấm Quên trong phiên. |
| **2026-10-17** | **Thẻ Mistake bắt buộc gõ lại câu đúng ở mặt trước.** | Buộc người học phải sản sinh ngôn ngữ chủ động (Active Recall & Motor Memory qua bàn phím) thay vì chỉ nhìn lướt qua câu sai rồi tự nhận là đã biết sửa. | Chỉ hiển thị câu sai và bấm nút lật xem câu đúng thụ động. |
| **2026-10-17** | **Tự chấm điểm 3 mức cho thẻ Mistake, không tự động chấm.** | Ngôn ngữ tiếng Anh có nhiều cách diễn đạt tương đương hoặc sai khác dấu câu nhỏ; việc ép chấm chuỗi tự động sẽ tạo ra nhiều kết quả chấm sai gây ức chế. | Chấm chuỗi tự động theo kiểu đúng/sai tuyệt đối. |
| **2026-10-17** | **Lưu trạng thái phiên ôn dở dang tại CSDL qua `ReviewSession`.** | Đảm bảo độ bền dữ liệu cao hơn localStorage; người học có thể đổi trình duyệt hoặc tiếp tục phiên học trên thiết bị khác mà không mất hàng đợi. | Lưu hàng đợi phiên tại localStorage của trình duyệt. |
