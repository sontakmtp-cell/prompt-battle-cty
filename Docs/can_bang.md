# PROMPT CHIẾN — THIẾT KẾ CÂN BẰNG CHIẾN ĐẤU

**Trạng thái:** Đề xuất cho M1, số liệu phải qua mô phỏng để chốt  
**Mục tiêu:** Chỉ số công–thủ–máu rõ ràng cho 4 loại tam giác, và **chặn đứng chiến thuật bot thuần một loại**.  
**Đã qua rà soát lỗ hổng đợt 2** — 6 lỗi chặn đường + 4 lỗ hổng cân bằng đã sửa, 8 bài test mới thêm vào mục 10. Nhật ký đầy đủ ở `ra_soat_can_bang.md`.

---

## 0. Vấn đề cần giải — nói thẳng

Nếu chỉ dùng luật Búa–Bao–Kéo đơn thuần, có **hai lỗ hổng** mà người chơi sẽ khai thác:

**Lỗ hổng 1 — Loại nào đó mạnh nhất thì cả thiên hạ chơi loại đó.**
Ví dụ nếu Búa có chỉ số thô tốt hơn hai loại kia, thì "60 Búa" là bot mạnh nhất, và game biến thành độc canh. Luật khắc chế vô nghĩa vì ai cũng chơi một loại.

**Lỗ hổng 2 — Bot thuần chủng làm mất luôn tầng khắc chế.**
Khi cả hai bên đều thuần một loại, vòng Búa–Bao–Kéo **không bao giờ kích hoạt** (vì chỉ có va chạm cùng loại). Trận đấu biến thành đấu hình học thuần túy — tầng chiến thuật quan trọng nhất của game bị xóa sổ.

**Mục tiêu thiết kế:**

> Bot thuần một loại phải **yếu hơn hẳn** bot có cấu trúc đa dạng — không phải vì bị cấm, mà vì **toán học không cho nó mạnh**.

---

## 1. Ba nguyên tắc vàng của cân bằng

**Nguyên tắc 1 — Cân sức bằng tích số.**
Một loại tam giác đánh mạnh thì phải **giòn**; một loại bền thì phải **đánh yếu**. Nói cách khác:

```text
MÁU × SÁT THƯƠNG NỀN ≈ HẰNG SỐ   (với cả ba loại chiến đấu)
```

Nếu mày cho một loại vừa đánh mạnh vừa nhiều máu → loại đó thành "vua" và game độc canh ngay. Đây là **sai lầm chết người số 1** của game RPS.

**Nguyên tắc 2 — Khắc chế phải đủ đau.**
Lợi thế khắc chế phải đủ lớn để **bên bị khắc chế gần như không thể thắng** trong một cuộc đấu tay đôi. Nếu lợi thế chỉ hơn kém 10%, người chơi sẽ phớt lờ nó và chơi theo chỉ số thô.

**Nguyên tắc 3 — Đa dạng phải là sức mạnh, không chỉ là lựa chọn.**
Phải có một cơ chế **thưởng cho việc trộn loại** và **phạt việc độc canh** — và cơ chế đó nên mang tính **hình học** để hòa vào linh hồn của game.

---

## 2. Chỉ số ba loại tam giác chiến đấu

| Loại | Máu | Sát thương nền | Vai trò | Câu mô tả |
|---|---|---|---|---|
| 🔨 **Búa** | **70** | **24** | Thủy tinh — đánh đau, cực giòn | "Một nhát là vỡ, nhưng nhát đó đau" |
| ✂️ **Kéo** | **105** | **16** | Cân bằng — không yếu điểm rõ rệt | "Không giỏi nhất thứ gì, không dở nhất thứ gì" |
| 📄 **Bao** | **168** | **10** | Trâu — bền bỉ, đánh yếu | "Bò qua mưa đạn, nhưng cắn không đau" |
| ⚙️ **Motor** | **80** | **0** | Không đánh — chỉ chạy | "Tim của sự cơ động, mục tiêu của địch" |

**Kiểm tra nguyên tắc 1:**

```text
Búa:  70 × 24 = 1680
Kéo: 105 × 16 = 1680
Bao: 168 × 10 = 1680   ← bằng nhau hoàn hảo
```

Ba loại **cân sức tuyệt đối về chỉ số thô**. Không loại nào mạnh hơn loại nào nếu chỉ nhìn máu và sát thương — sự khác biệt chỉ đến từ **cách dùng và vị trí**.

> Vì sao Motor máu chỉ 80? Vì Motor là **tử huyệt vận động**. Nếu Motor trâu quá thì không ai bẻ gãy được chân địch, và cơ chế tải trọng (mục 3.4.1 trong `gameplay.md`) mất hết ý nghĩa. Motor phải **dễ vỡ vừa phải** để "đánh vào chân" là một chiến thuật thật.

---

## 3. Ma trận sát thương đầy đủ

Đây là phần mày hỏi trực tiếp: **loại A đánh loại B thì ăn bao nhiêu máu.**

### 3.1. Công thức

```text
SÁT THƯƠNG = sát thương nền × hệ số khắc chế × hệ số va chạm × hệ số hướng
```

Bốn thừa số chia làm hai nhóm có vai trò rất khác nhau:

| Nhóm | Thừa số | Nói lên điều gì | Ai quyết định |
|---|---|---|---|
| **Loại** | sát thương nền · hệ số khắc chế | Mày chọn tam giác gì, đánh vào loại gì | **Thiết kế bot** — chọn trước trận |
| **Cách đánh** | hệ số va chạm · hệ số hướng | Mày lao vào mạnh cỡ nào, có xoay đúng mặt không | **Bộ não** — quyết định từng nhịp |

Nhóm thứ hai chính là chỗ `gameplay.md` mục 5.3 nói: *"đâm mạnh, đâm đúng mặt, đâm đúng góc thì đau hơn đâm nhẹ hời hợt"*. Nhóm thứ nhất thì mày chốt xong là hết; nhóm thứ hai **thay đổi mỗi nhịp** — nên nó là lý do để bộ não có giá trị thật.

> 📌 **Ba thừa số sau lưng `sát thương nền` đều là số nguyên đơn vị 1/1000** — cách lưu, công thức đầy đủ và quy tắc làm tròn nằm ở **mục 3.6**. Đọc mục đó trước khi code, đừng đọc riêng mục này.

### 3.2. Hệ số khắc chế

| Tình huống | Hệ số |
|---|---|
| Có lợi thế (Búa→Kéo, Kéo→Bao, Bao→Búa) | **×2.0** |
| Cùng loại | **×1.0** |
| Bất lợi (Kéo→Búa, Bao→Kéo, Búa→Bao) | **×0.5** |
| Đánh vào Motor (mọi loại chiến đấu) | **×1.0** (không khắc chế) |

### 3.3. Hệ số va chạm — lao mạnh thì đau hơn

```text
r = tốc độ va chạm ÷ tốc độ tham chiếu
    (tốc độ tương đối của hai tam giác, chiếu lên pháp tuyến va chạm)

HỆ SỐ VA CHẠM = 0.85 + 0.15 × min(r, 1.0)
```

`tốc độ tham chiếu` = tốc độ tối đa của một bot cân bằng đang lao hết tốc lực. Đây là **hằng số phải hiệu chuẩn ở M1**, không phải số đoán bừa.

| Tình huống | r | Hệ số va chạm |
|---|---|---|
| Hai bot cọ xát, gần như đứng yên | 0 | **0.85** |
| Một bot lao chậm vào địch | 0.25 | 0.89 |
| Lao nửa tốc lực | 0.5 | 0.93 |
| **Lao hết tốc lực** (ca chuẩn) | **1.0** | **1.00** |
| Hai bot lao ngược chiều nhau | 2.0 | 1.00 (đã chạm trần) |

Hệ số này **đối xứng** — nó thuộc về cú va chạm, không thuộc về ai. Cả hai bên dùng chung một giá trị.

**Hệ quả đáng chú ý:** hệ số này nối thẳng vào cơ chế tải trọng (`gameplay.md` 3.4.1). Bot quá tải bò chậm → r thấp → **vừa chậm, vừa đánh yếu**. Cơ chế quá tải giờ có ba hình phạt chồng lên nhau thay vì hai.

### 3.4. Hệ số hướng — xoay đúng mặt thì đau hơn

```text
θ = góc giữa HƯỚNG MẶT của tam giác tấn công và HƯỚNG ĐÂM

HỆ SỐ HƯỚNG = 0.85 + 0.15 × max(0, cos θ)
```

- **Hướng mặt** của một tam giác = vector vuông góc với cạnh đáy, chĩa về đỉnh. Trên lưới tam giác chỉ có hai hướng gốc (lên và xuống), xoay theo góc của bot.
- **Hướng đâm** = vector đơn vị đi từ tâm tam giác tấn công tới tâm tam giác bị đánh.
- θ = 0° nghĩa là đỉnh nhọn chĩa thẳng vào địch — cú đâm hoàn hảo.

| Góc đâm | Hệ số hướng | Cảm giác |
|---|---|---|
| 0° — đỉnh chĩa thẳng vào địch | **1.00** | Đâm vuông mặt |
| 22.5° | 0.99 | Gần như hoàn hảo |
| 45° | 0.96 | Đâm chéo, hơi hụt |
| 67.5° | 0.91 | Đâm sượt |
| ≥ 90° — đâm ngang hông | **0.85** | Đâm bằng cạnh bên, yếu nhất |

Vì chỉ có hai hướng mặt gốc, **một tam giác chỉ có thể đâm vuông mặt vào địch nằm ở đúng một phía**. Đó là lý do thật sự để **xen tam giác lên và tam giác xuống vào nhau** — chúng phủ hai hướng khác nhau. Đây là một tầng chiến thuật mới, song song với cộng hưởng đa dạng ở mục 6.

### 3.5. Bảng tra góc — để engine chạy tất định

Không tính `cos` bằng số thực trong lúc chạy. Dùng bảng tra 64 hướng, mỗi bước 5.625°, giá trị đã nhân 1000:

```text
HƯỚNG_LUT[0..16] = 1000, 999, 997, 994, 989, 982, 975, 966, 956,
                    945, 933, 921, 907, 894, 879, 865, 850
HƯỚNG_LUT[17..63] = 850     # mọi góc từ 90° trở lên đều là 850
```

Cách dùng: tính góc θ, quy về chỉ số `k = floor(θ ÷ 5.625°)`, tra `HƯỚNG_LUT[k]`.

### 3.6. Đơn vị, làm tròn và tất định

**Quy tắc đơn vị — bắt buộc, không có ngoại lệ:** mọi hệ số trong engine lưu dạng **số nguyên đơn vị 1/1000**. Không dùng số thực ở bất kỳ đâu trên đường tính sát thương.

| Hệ số | Giá trị lưu | Đọc là |
|---|---|---|
| `RPS_ADVANTAGE` | `2000` | ×2.0 |
| `RPS_NEUTRAL` | `1000` | ×1.0 |
| `RPS_DISADVANTAGE` | `500` | ×0.5 |
| `MOTOR_DAMAGE_MULT` | `1000` | ×1.0 |
| `VA_CHẠM` | `850 … 1000` | ×0.85 … ×1.00 |
| `HƯỚNG` | `850 … 1000` | ×0.85 … ×1.00 |

Công thức:

```text
sát thương = floor( nền × RPS × VA_CHẠM × HƯỚNG ÷ 1_000_000_000 )
```

Cả bốn thừa số đều là số nguyên, nên phép chia là chia số nguyên và `floor` là miễn phí. Kiểm tra hai đầu:

```text
Nhỏ nhất:  Bao đánh Búa sai mặt, cọ xát, đâm ngang
           10 × 500 × 850 × 850 ÷ 10^9 = 3,61 → floor = 3
           Không bao giờ về 0, nên KHÔNG cần sàn đặc biệt.

Lớn nhất:  Búa đánh Kéo đúng mặt, lao hết tốc
           24 × 2000 × 1000 × 1000 ÷ 10^9 = 48
```

> ⚠️ **Cạm bẫy đã bị bắt trong đợt rà soát:** nếu bảng hằng số ở mục 9 ghi `RPS_ADVANTAGE = 2.0` hay `IMPACT_BASE = 0.85` dạng **số thực**, công thức trên sẽ ra **0** ở mọi cú đánh — vì `24 × 2.0 × 0.85 × 850 = 34.680`, chia nguyên cho `10^9` bằng `0`. Triệu chứng (sát thương luôn bằng 0) không chỉ thẳng vào nguyên nhân, nên lỗi này rất khó tìm. Mục 9 đã được sửa cho khớp.

**Sai số làm tròn — phải nhớ mỗi lần đổi số.** `floor` ăn mất tới **17%** ở các cú yếu nhất:

```text
Bao đánh Kéo, hời hợt nhất:  giá trị thật 3,61  →  floor = 3   (mất 17%)
Búa đánh Kéo, hoàn hảo:      giá trị thật 48    →  floor = 48  (mất 0%)
```

Nghĩa là **sai số làm tròn không đối xứng — nó luôn bất lợi cho bên yếu thế**. Vì vậy:

> Mọi lần đổi hằng số phải kiểm tra bất biến ở mục 3.8 **sau khi áp `floor`**, không phải trước. Đổi `RPS_DISADVANTAGE` xuống dưới `500` là lúc sai số làm tròn bắt đầu đổi kết quả trận.

### 3.7. Bảng sát thương mỗi nhát

Bảng dưới là **cú đâm hoàn hảo**: đỉnh chĩa thẳng vào địch, lao hết tốc lực. Trong thực chiến mày **hầu như không bao giờ đạt được nó** — mọi cú đâm thật đều yếu hơn hoặc bằng.

| Tấn công ↓ \ Bị đánh → | 🔨 Búa | ✂️ Kéo | 📄 Bao | ⚙️ Motor |
|---|---|---|---|---|
| 🔨 **Búa** (nền 24) | **24** | **48** ✅ | 12 | 24 |
| ✂️ **Kéo** (nền 16) | 8 | **16** | **32** ✅ | 16 |
| 📄 **Bao** (nền 10) | **20** ✅ | 5 | **10** | 10 |

*(✅ = có lợi thế khắc chế)*

**Đọc bảng này thấy ngay:** đánh đúng mặt có lợi thì sát thương **gấp 4 lần** đánh sai mặt. Đó là lý do **xoay đúng mặt trước khi va chạm** là kỹ năng sống còn — và đó là việc của bộ não.

### 3.8. Bất biến bắt buộc — kiểm tra mỗi lần đổi số

> **Cú đâm hời hợt nhất của bên có lợi thế vẫn phải mạnh hơn cú đâm hoàn hảo nhất của bên bất lợi.**

Kiểm tra cặp nguy hiểm nhất — Bao đánh Búa, vì Bao có sát thương nền nhỏ nhất nên dễ bị làm tròn ăn mất lợi thế:

```text
Bao đánh Búa, hời hợt nhất:   floor(10 × 2.0 × 0.85 × 0.85) = floor(14.45) = 14
Búa đánh Bao, hoàn hảo nhất:  24 × 0.5 × 1.00 × 1.00        = 12
                              14 > 12  ✅
```

Hai cặp còn lại cách xa hơn nhiều (Búa vs Kéo: 34 so với 8 · Kéo vs Bao: 23 so với 5).

Nếu sau này chỉnh hệ số mà bất biến này vỡ thì **khắc chế mất hết ý nghĩa** — người chơi sẽ phớt lờ luật Búa–Bao–Kéo và chơi theo chỉ số thô. Đây là **bài kiểm tra bắt buộc**, phải chạy tự động mỗi lần đổi bất kỳ hằng số nào ở mục 9.

---

## 4. Bảng "bao nhiêu nhát để hạ" — kiểm tra độ đau của khắc chế

Sát thương nền chỉ có ý nghĩa khi quy ra **số nhát cần để phá một tam giác**. Đây là bảng thật sự quan trọng:

Vì hệ số va chạm và hệ số hướng giờ làm sát thương dao động, bảng này **không còn một con số cố định** mà là một khoảng: **đâm hoàn hảo → đâm hời hợt**.

| Tấn công ↓ \ Bị đánh → | 🔨 Búa (70) | ✂️ Kéo (105) | 📄 Bao (168) | ⚙️ Motor (80) |
|---|---|---|---|---|
| 🔨 **Búa** | 3 → 5 | **3 → 4** ✅ | 14 → 21 | 4 → 5 |
| ✂️ **Kéo** | 9 → 14 | 7 → 10 | **6 → 8** ✅ | 5 → 8 |
| 📄 **Bao** | **4 → 5** ✅ | 21 → 35 | 17 → 24 | 8 → 12 |

*(Đọc là: "3 nhát nếu đâm hoàn hảo, 5 nhát nếu đâm hời hợt".)*

> ⚠️ **Bảng này tính trên MÁU NỀN — tức là trường hợp bot THUẦN CHỦNG, không có cộng hưởng đa dạng.** Đây là bảng để đọc luật khắc chế, không phải bảng để đo trận thực. Trong thực chiến cả hai bên gần như luôn có cộng hưởng, nên số nhát thật cao hơn — xem bảng phụ ngay dưới.

**Bảng phụ — khi CẢ HAI bên đều trộn đủ 3 loại chiến đấu (+24% máu):**

| Tấn công ↓ \ Bị đánh → | 🔨 Búa (86) | ✂️ Kéo (130) | 📄 Bao (208) | ⚙️ Motor (99) |
|---|---|---|---|---|
| 🔨 **Búa** | 4 → 6 | **3 → 4** ✅ | 18 → 26 | 5 → 6 |
| ✂️ **Kéo** | 11 → 18 | 9 → 12 | **7 → 10** ✅ | 7 → 9 |
| 📄 **Bao** | **5 → 7** ✅ | 26 → 44 | 21 → 30 | 10 → 15 |

*(Máu hiệu dụng làm tròn xuống: 86 / 130 / 208 / 99.)*

**Đọc hai bảng cạnh nhau thấy ngay một điều quan trọng:** khi cả hai bên đều trộn, cộng hưởng **triệt tiêu lẫn nhau** — cả hai cùng +24%, nên tỉ lệ khắc chế không đổi. Cộng hưởng **không tạo ra lợi thế cho ai biết trộn**; nó chỉ **trừng phạt ai không trộn**. Xem mục 6.5 để hiểu đúng vai trò của nó.

**Tỉ lệ lợi thế khắc chế giờ cũng là một khoảng:**

| Cặp đấu | Bên thắng cần | Bên thua cần | Tỉ lệ |
|---|---|---|---|
| Búa vs Kéo | 3 → 4 | 9 → 14 | **2.25× – 4.67×** |
| Kéo vs Bao | 6 → 8 | 21 → 35 | **2.6× – 5.8×** |
| Bao vs Búa | 4 → 5 | 14 → 21 | **2.8× – 5.25×** |

**Kết luận:** khắc chế vẫn đủ đau. Trường hợp xấu nhất — bên có lợi thế đâm hời hợt còn bên bất lợi đâm hoàn hảo — tỉ lệ tụt còn **2.25×**, vẫn đủ để bên khắc chế thắng. Và bất biến ở mục 3.8 bảo đảm khắc chế **không bao giờ bị lật**, kể cả trong trường hợp xấu nhất đó.

Nói cách khác: hai hệ số mới cho phép **kỹ năng đánh tạo ra chênh lệch tối đa 1.38 lần** — đủ để lật ngược cục diện trong cùng một cặp loại, nhưng **không đủ để đảo ngược luật loại** (kém nhất vẫn 2.25 lần). Đúng liều lượng.

**Một chi tiết thú vị lộ ra từ bảng này:** đấu gương (cùng loại) có nhịp rất khác nhau:
- **Búa vs Búa:** 3 → 5 nhát → trận gương nổ cực nhanh.
- **Bao vs Bao:** 17 → 24 nhát → trận gương là một cuộc **giằng co mệt mỏi**, dễ hết giờ.

Điều này **tự nhiên chống lại bot Bao thuần chủng**: nó không thể kết liễu ai, nên dễ bị kéo vào timeout — mà timeout thì phải thắng bằng điểm số, không phải bằng cách ngồi trâu (xem mục 8).

> ⚠️ **Nhưng "nổ cực nhanh" ở Búa vs Búa có thể là một vấn đề, không phải một điểm hay.** Với cooldown 6 nhịp, 3 nhát = 18 nhịp = **0,6 giây**. Đó không phải "đã tay" — đó là **chưa kịp nhìn**. Nếu trận trung bình kết thúc dưới 30 giây thì **vùng thu hẹp (bắt đầu giây 60) và công thức điểm hết giờ không bao giờ chạy** — toàn bộ công thiết kế hai cơ chế đó bỏ đi, và lời hứa *"trận đấu kể một câu chuyện"* ở `gameplay.md` mục 5.4 không thể thực hiện.
>
> **Đây là lý do bài test số 12 ở mục 10 là bài test quan trọng nhất trong tám bài bổ sung.** Mục tiêu: trung vị thời lượng trận nằm trong **40–80 giây**. Đo trước, chỉnh sau — và nếu phải chỉnh thì tăng cooldown trước, đừng đụng vào sát thương nền.

---

## 5. Vì sao KHÔNG dùng "giáp" cộng trừ

Mày hỏi về "công thủ máu". Tao khuyên **đừng** thêm một chỉ số giáp kiểu `sát thương nhận = sát thương - giáp`. Lý do:

> **Giáp cộng trừ sinh ra bất tử.** Nếu giáp của một tam giác ≥ sát thương của địch, nó **không bao giờ chết** → bot bất khả chiến bại → game chết.

Nếu vẫn muốn có cảm giác "giáp", hãy làm nó **theo tỉ lệ** (nhân), không phải cộng trừ:

```text
SÁT THƯƠNG NHẬN = sát thương × (1 - giảm_thương)   ← giảm_thương luôn < 1
```

Nhưng đơn giản nhất — và tao khuyên dùng — là **gộp "thủ" vào máu**: máu cao = thủ tốt. Như bảng ở mục 2, Bao có 168 máu chính là "giáp" của nó, và nó vẫn chết được. Không cần thêm stat nào.

**Tóm lại:** "Thủ" = **máu** + **hệ số khắc chế khi bị đánh**. Không có stat giáp riêng.

---

## 6. Ba lớp chống bot thuần chủng

Đây là phần trả lời trực tiếp nỗi lo "người chơi lách luật bằng bot một loại".

### Lớp 1 — Khắc chế cứng (đã có ở mục 3–4)

Mỗi loại có **một khắc tinh chí mạng**:
- Bot toàn Búa → chết với bot nhiều Bao.
- Bot toàn Kéo → chết với bot nhiều Búa.
- Bot toàn Bao → chết với bot nhiều Kéo.

**Nhưng lớp này chưa đủ**, vì một bot **cân bằng** chỉ có ~1/3 quân là khắc tinh của địch — phần khắc tinh bị **pha loãng**. Nên cần lớp 2.

### Lớp 2 — Cộng hưởng đa dạng (cơ chế chính, mang tính hình học)

> **Mỗi tam giác được thưởng thêm máu nếu các hàng xóm giáp cạnh của nó thuộc nhiều LOẠI CHIẾN ĐẤU khác nhau.**

**Cách tính:**

```text
Với mỗi tam giác, nhìn vào "vòng 1" = chính nó + 3 hàng xóm giáp cạnh.
Đếm số LOẠI CHIẾN ĐẤU khác nhau trong vòng đó (Búa / Kéo / Bao → 1, 2 hoặc 3 loại).
MÁU TỐI ĐA HIỆU DỤNG = floor( MÁU NỀN × (1000 + 120 × (số_loại − 1)) ÷ 1000 )
```

| Vòng 1 có mấy loại chiến đấu | Thưởng máu | Ví dụ |
|---|---|---|
| **1 loại** (thuần chủng) | **+0%** | Khối toàn Búa chen nhau |
| **2 loại** | **+12%** | Búa chen Kéo |
| **3 loại** | **+24%** | Búa, Kéo, Bao chen nhau |

**Ba quy tắc bắt buộc của phép đếm — chốt trong đợt rà soát:**

**1. Motor KHÔNG được đếm là một loại.** Motor vẫn **được nhận** thưởng (nó là một tam giác như mọi tam giác), nhưng nó **không được tính** vào số loại của vòng 1.

Vì sao phải tách ra: nếu đếm chung Motor, thì bot **2 loại chiến đấu + Motor** đã đạt trần +24% — cơ chế không còn buộc trộn đủ Búa/Kéo/Bao nữa, và mục tiêu "chống độc canh" suy yếu còn một nửa.

```text
Bot 45 Búa + 15 Motor xen kẽ:   vòng 1 có 1 loại chiến đấu → +0%
Bot 30 Búa + 15 Kéo + 15 Motor: vòng 1 có 2 loại chiến đấu → +12%
Bot 15/15/15/15:                vòng 1 có 3 loại chiến đấu → +24%
```

**2. Thưởng cộng vào MÁU TỐI ĐA, không phải máu hiện tại.** Cộng vào máu hiện tại thì một tam giác đã mất nửa máu sẽ nhận thêm phần thưởng không đáng kể — phần thưởng mất hết ý nghĩa.

**3. Tính lại khi cấu trúc thay đổi, không tính mỗi nhịp, cũng không tính một lần rồi thôi.**

```text
Tính lại cộng hưởng CHỈ KHI:
  - có tam giác bị phá
  - có mảnh tách rời bị loại khỏi mô phỏng
Không tính lại mỗi nhịp.
```

Vì sao không tính một lần lúc khóa gói: khi cấu trúc bot vỡ ra, các tam giác còn lại sẽ **giữ nguyên +24%** dù vòng 1 của chúng giờ đã thuần chủng. Như vậy "trộn" thành **lợi thế một chiều vĩnh viễn**, và nó mâu thuẫn với nguyên tắc vàng số 5 (*"mất bộ phận phải đổi hành vi thật"*). Một trong những thay đổi tự nhiên nhất khi cấu trúc nát là **mất đi phần thưởng đa dạng**.

Vì sao không tính mỗi nhịp: tốn CPU vô ích. Số lần tính lại bằng số lần có tam giác chết — vài chục lần mỗi trận. **Vẫn rẻ, và vẫn deterministic** vì số lần chết là hoàn toàn xác định từ seed.

**Vì sao cơ chế này chống được bot thuần chủng:**

- Bot thuần một loại → **mọi tam giác đều nằm trong vòng 1 thuần chủng** → **không tam giác nào được thưởng** → toàn thân giòn hơn tới 24% so với bot trộn.
- Bot trộn khéo → hầu hết tam giác được +24% máu → trâu hơn hẳn.

**Vì sao cơ chế này hay về mặt thiết kế:**

1. **Nó mang tính hình học** — đúng linh hồn game. Mày phải **xen kẽ loại vào nhau**, chứ không phải chỉ đếm số lượng. Bot thuần chủng không thể có hình dạng tốt.
2. **Nó không cấm gì cả** — mày vẫn được chơi 70% Búa, miễn là 30% còn lại là loại khác xen vào. Nó **thưởng đa dạng**, không **phạt độc canh** bằng mệnh lệnh.
3. **Nó mềm, có độ dốc** — càng trộn nhiều càng bền, nên người chơi có động lực tinh chỉnh dần, không bị "được ăn cả ngã về không".
4. **Nó rẻ** — tính lại chỉ vài chục lần mỗi trận, và hoàn toàn tất định.

---

### Lớp 3 — Trần thuần chủng (chốt an toàn)

Thêm một lưới an toàn ở tầng kiểm duyệt:

| Ngưỡng | Hành vi |
|---|---|
| Một loại chiếm **> 65%** tổng tam giác chiến đấu | **Cảnh báo rõ** trong báo cáo validation: "bot này gần như thuần chủng, sẽ rất giòn" |
| Một loại chiếm **> 80%** | **Chặn** (tùy chọn) — buộc người chơi trộn ít nhất 20% |

Tao khuyên **để ngưỡng 80% là cảnh báo chứ không chặn**, vì:
- Lớp 2 đã đủ sức trừng phạt bot thuần chủng một cách tự nhiên.
- Chặn cứng làm mất đi một lối chơi hợp lệ: bot **all-in thủy tinh** (60 Búa lao tới) vẫn là một phong cách thú vị — miễn là nó **phải trả giá** bằng sự giòn.

Nếu sau khi test mà bot thuần chủng vẫn vô địch, **hãy bật chặn ở 80%**. Đây là công tắc để dành.

---

### 6.5. Cộng hưởng mạnh cỡ nào — nói thẳng, không thổi phồng

Phần này viết lại để thay cho một tuyên bố sai đã bị bắt trong đợt rà soát. Bản cũ nói *"bot trộn giết Búa thuần nhanh gấp 4.5 lần"* và gán công lao đó cho cộng hưởng. **Sai.**

Tính lại đầy đủ, cặp Bao (bot trộn) vs Búa (bot thuần):

```text
KHÔNG có cộng hưởng:
  Bao của bot trộn hạ 1 Búa thuần:  70 ÷ 20 = 4 nhát
  Búa thuần hạ 1 Bao của bot trộn:  168 ÷ 12 = 14 nhát
  Tỉ lệ: 3,50 lần

CÓ cộng hưởng (+24% cho bot trộn):
  Bao của bot trộn hạ 1 Búa thuần:  70 ÷ 20 = 4 nhát
  Búa thuần hạ 1 Bao của bot trộn:  208 ÷ 12 = 18 nhát
  Tỉ lệ: 4,50 lần
```

**Cộng hưởng đóng góp từ 3,50 lên 4,50 — tức 1,29 lần.** Phần còn lại, 3,50 lần, đến từ **khắc chế** (20 so với 12 sát thương mỗi nhát) và **chênh máu** (70 so với 168). Kiểm hai cặp còn lại cũng cho kết quả tương tự:

| Cặp | Không cộng hưởng | Có cộng hưởng | Cộng hưởng thêm |
|---|---|---|---|
| Bao (trộn) vs Búa (thuần) | 3,50× | 4,50× | ×1,29 |
| Búa (trộn) vs Kéo (thuần) | 3,00× | 3,67× | ×1,22 |
| Kéo (trộn) vs Bao (thuần) | 3,50× | 4,33× | ×1,24 |

Và còn một điều quan trọng hơn: **khi cả hai bên đều trộn, cộng hưởng triệt tiêu lẫn nhau** (cả hai cùng +24%) → tỉ lệ khắc chế không đổi một chút nào.

**Kết luận trung thực:**

> Cộng hưởng đa dạng là **lớp bù trừ, không phải tường chắn**. Nó chênh 1,22–1,29 lần máu. Việc chặn bot thuần chủng chủ yếu do **lớp 1 (khắc chế)** làm.
>
> Vai trò thật của lớp 2 là: **thuế độc canh** — trừng phạt ai không trộn — chứ không phải **phần thưởng kỹ năng** cho ai trộn khéo, vì ai cũng sẽ trộn. Và trong các trận sát nút, 24% máu thừa sức là yếu tố quyết định.
>
> Việc bot thuần chủng có **thật sự thua** hay không **phải đo bằng mô phỏng**, không được khẳng định trước. Xem bài test số 17 ở mục 10.

Ngoài ra phép tính cũ còn một lỗi nữa: nó chỉ so **một cặp tam giác**. Trong trận thực, bot Búa thuần (60 Búa) đánh bot trộn (20/20/20) có ba loại cặp va chạm:

| Cặp va chạm | Ai có lợi | Chiếm |
|---|---|---|
| Búa thuần vs Kéo của bot trộn | Búa thuần | 1/3 |
| Búa thuần vs Bao của bot trộn | bot trộn | 1/3 |
| Búa thuần vs Búa của bot trộn | hòa | 1/3 |

Búa thuần **thắng 1/3, thua 1/3, hòa 1/3**. Không có gì đảm bảo nó thua. Đó là lý do phải chạy mô phỏng.

> **Lưu ý:** thưởng máu áp cho **mọi tam giác, kể cả Motor** — nhưng Motor không được đếm là một loại (quy tắc 1 ở trên). Nên một Motor được bao quanh bởi nhiều loại chiến đấu khác nhau cũng bền hơn — đúng ý "che chắn cho chân".

### 6.6. Core KHÔNG được đặt trên Motor

Chốt trong đợt rà soát. Lý do là toán học, không phải thẩm mỹ.

Vì đánh vào Motor là **×1.0 với mọi loại** (Motor không nằm trong vòng khắc chế), một lõi đặt trên Motor sẽ **miễn nhiễm khắc chế** — không loại nào có lợi thế với nó. So sánh số nhát cần để phá lõi:

| Lõi đặt trên | Máu | Kẻ địch nguy hiểm nhất | Sát thương/nhát | Số nhát để phá |
|---|---|---|---|---|
| Búa | 70 | Kéo (lợi thế) | 32 | **3** |
| Kéo | 105 | Búa (lợi thế) | 48 | **3** |
| Bao | 168 | Kéo (lợi thế) | 32 | **6** |
| **Motor** | 80 | Búa (không khắc chế) | 24 | **4** |

Lõi-Motor đứng **nhì về độ bền**, mà đổi lại địch **không thể chọn loại quân để khắc lõi** — thứ mà lõi-Búa và lõi-Kéo đều dính. Đó là vị trí lõi tốt nhì trong game, và nó tốt một cách **không được thiết kế**, chỉ do một hệ số tình cờ.

**Luật:** Core phải nằm trên một tam giác **chiến đấu** (Búa / Kéo / Bao). Đặt trên Motor là không hợp lệ — Geometry Validator phải từ chối.

---

### 6.7. Tải trọng không được "nhẹ đi" khi bot bị đánh gãy

Chốt trong đợt rà soát. Đây là lỗ hổng ngược đời nhất tìm được.

Tải thân đếm **mọi** tam giác còn sống, kể cả tam giác chiến đấu. Nghĩa là khi bot mất tam giác chiến đấu, nó **nhẹ đi** → bớt quá tải → **chạy nhanh hơn**. Tao tính cho bot "cục thịt" (55 combat + 5 Motor, hệ số 3.00 — gần như đứng yên):

| Mất combat | Tải thân | Sức kéo | Hệ số tải | Tốc độ |
|---|---|---|---|---|
| 0 | 60 | 20 | 3.00 | ~15% |
| 20 | 40 | 20 | 2.00 | ~40% |
| 30 | 30 | 20 | 1.50 | ~70% |
| **40** | **20** | **20** | **1.00** | **100%** |

Một con bot bị đánh gãy 40 tam giác — **mất 2/3 cơ thể** — lại chạy **nhanh gấp 6 lần** lúc đầu.

Hai lý do phải chặn:

1. **Nó phá thông điệp cảm xúc.** `gameplay.md` mục 5.5 và `ky_thuat_my_thuat.md` mục 3.7 đều hứa *"cơ thể bị thương thì tàn tật, bò lết như con vật què"*. Nhưng một con bot quá tải lại **hồi phục** khi bị thương nặng — nó chuyển từ "bò lết" sang "chạy thoăn thoắt". Lớp mỹ thuật sẽ phải vẽ ngược lại điều mô phỏng đang làm.
2. **Nó mở ra một lối chơi lạ:** bot quá tải có thể **cố tình để mất thân** (đưa cánh ra làm mồi) để nhẹ đi và lấy lại cơ động. Không chắc ai nghĩ ra, nhưng nếu nghĩ ra thì nó rất mạnh.

**Luật:**

```text
HỆ SỐ TẢI HIỆU DỤNG = max( HỆ SỐ TẢI hiện tại , HỆ SỐ TẢI lúc khóa gói )
```

Bot **không bao giờ** được chạy nhanh hơn tốc độ ứng với cấu trúc lúc khóa gói. Một khi đã quá tải thì không tự giải phóng — đúng tinh thần "một khi đã sụp thì sụp".

Đổi lại: bot bị đánh gãy thân vẫn có thể **chậm đi** (vì mất Motor làm sức kéo tụt), nhưng **không bao giờ nhanh lên**.

---

## 7. Vì sao tổ hợp ba lớp này chặn được lách luật

Ghép lại, một bot thuần chủng phải đối mặt **ba tầng bất lợi cùng lúc**:

```
BOT THUẦN CHỦNG
    │
    ├─ Lớp 1: Bị khắc tinh chí mạng (3–3.5× bất lợi khi gặp loại khắc nó)
    │
    ├─ Lớp 2: Mất 24% máu toàn thân (không có cộng hưởng đa dạng)
    │
    └─ Lớp 3: Bị cảnh báo/chặn nếu vượt 65–80%
```

Không cần cấm. Chỉ cần **toán học không thương nó**.

Và quan trọng nhất — **nó không phá hỏng sự tự do thiết kế**: mày vẫn có thể làm bot 70% Búa. Mày chỉ cần **xen 30% loại khác vào đúng chỗ** để lấy lại cộng hưởng. Đó là một bài toán thiết kế thú vị, không phải một bức tường.

---

## 8. Chống các kiểu lách luật khác

Bot thuần chủng không phải lỗ hổng duy nhất. Ba cái bẫy còn lại:

### 8.1. Bot "trâu câu giờ" (Bao thuần, thủ để hòa)

**Vấn đề:** Bot toàn Bao rất khó chết, đánh yếu, và có thể định thắng bằng timeout nhờ lõi nguyên vẹn.

**Cách chặn — sửa công thức tính điểm hết giờ:**

Nếu để "độ nguyên vẹn lõi" lên đầu (như spec gợi ý), bot trâu sẽ tự động thắng → đúng là lách luật. Đề xuất **công thức có trọng số**, ưu tiên sát thương gây ra:

```text
ĐIỂM = 0.35 × (sát thương đã gây, chuẩn hóa)
     + 0.30 × (máu lõi còn lại, %)
     + 0.20 × (tam giác chiến đấu còn lại, %)
     + 0.15 × (Motor còn lại, %)
```

→ Bot ngồi trâu không đánh được ai sẽ **thua điểm** vì sát thương gây ra thấp. Muốn thắng phải **đánh thật**, không phải **sống lâu**.

**"Chuẩn hóa" nghĩa là gì — chốt trong đợt rà soát.** Ba chỗ ghi công thức này (`can_bang.md`, `gameplay.md` 5.6, `spec_demo.md` 17) trước đó đều bỏ trống định nghĩa. Chốt như sau:

```text
sát thương chuẩn hóa của A = sát thương A gây ra ÷ max(sát thương A gây ra, sát thương B gây ra)
```

Nghĩa là **so trực tiếp với đối thủ**, không chia cho một hằng số cố định nào:

| Trường hợp | A được | B được |
|---|---|---|
| A gây 2000, B gây 1500 | 1.00 | 0.75 |
| A gây 800, B gây 800 | 1.00 | 1.00 |
| A gây 0, B gây 0 | **0.00** | **0.00** |

Ba lý do chọn cách này:

1. **Không cần hằng số.** Chia cho một con số cố định thì phải đoán con số đó, và đoán sai là cả hai bên đều được điểm vô lý.
2. **Luôn nằm trong `[0, 1]`.** Không bao giờ tràn ra ngoài thang điểm.
3. **Không bao giờ chia cho 0** — có luật riêng cho trường hợp cả hai đều gây 0 (xem hàng cuối bảng).

> **Lưu ý về điểm yếu đã biết của công thức:** nó đếm sát thương **thô**, không phân biệt sát thương vào lõi với sát thương vào Motor. Một bot farm Motor để lấy điểm vẫn có thể thắng điểm dù không uy hiếp được lõi địch. Đây là **đánh đổi có chủ ý** — phân biệt trọng số sát thương theo mục tiêu sẽ làm công thức khó hiểu và khó kiểm chứng. Nhưng nó phải được **đo**: xem bài test số 13 ở mục 10.

### 8.2. Bot "chạy trốn" (kiting vô hạn)

**Vấn đề:** Bot siêu cơ động (30 Motor) chạy vòng vòng, không cho ai chạm vào, câu hết giờ.

**Cách chặn:**
- **Vùng thu hẹp (ring shrink):** sau ~60 giây, một vòng an toàn thu nhỏ dần, ép hai bot phải gặp nhau. Đây là cơ chế spec đã gợi ý — nên bật.
- **Luật chủ động giao chiến:** sandbox đã kiểm tra bot phải tiếp cận và tạo va chạm; trong trận, bot không tạo được va chạm trong X giây liên tục thì bị trừ điểm hoặc xử thua theo luật công khai.

### 8.3. Bot "tận dụng lỗi va chạm"

**Vấn đề:** hình dạng kỳ dị để lọt qua khe, hoặc chồng lấn để ăn sát thương nhiều lần.

**Cách chặn:** đã có sẵn trong **Geometry Validator** (mục 7 của spec) — không overlap trái phép, không collider dị dạng, cộng với cooldown đánh ở mục 8.4.

### 8.4. Bot "kẹp nhiều mặt" — lỗ hổng bùng nổ sát thương

**Vấn đề:** nếu cooldown tính **theo cặp tam giác**, thì một tam giác bị nhiều tam giác địch chạm cùng lúc sẽ ăn **nhiều hit trong cùng một nhịp**, mỗi cặp có bộ đếm riêng. Tao tính ra:

| Bị kẹp | 1 mặt | 2 mặt | 3 mặt | Máu | Kết quả |
|---|---|---|---|---|---|
| Kéo bị Búa kẹp | 48 | 96 | **144** | 105 | **chết trong 1 nhịp (0,033 giây)** |
| Búa bị Búa kẹp | 24 | 48 | **72** | 70 | **chết trong 1 nhịp** |
| Bao bị Kéo kẹp | 32 | 64 | 96 | 168 | sống, cần 2 nhịp |

Nghĩa là bảng "số nhát để hạ" ở mục 4 — vốn ghi "Búa cần 3 nhát để hạ Kéo" — **chỉ đúng nếu mỗi lúc chỉ có một mặt chạm**. Bot hình "kẹp" hoặc "nĩa" có thể xóa sổ một tam giác trong một nhịp, khiến sát thương thực tế **gấp 3 lần bảng**.

**Cách chặn — đã chốt:**

```text
HIT_COOLDOWN_TICKS = 6
HIT_COOLDOWN_SCOPE = PER_TRIANGLE_DEFENDER
```

> **Mỗi tam giác phòng thủ chỉ nhận TỐI ĐA một hit mỗi 6 nhịp, bất kể nó đang chạm bao nhiêu tam giác địch.**

Nhờ vậy bảng ở mục 4 mới đúng, và không còn cảnh một tam giác chết trong 0,033 giây mà người xem không kịp hiểu chuyện gì.

**Đánh đổi đã chấp nhận:** cách này làm việc "kẹp địch bằng nhiều mặt" **không còn nhân sát thương**. Kẹp vẫn có giá trị — nó chặn đường lui, ép hướng xoay, buộc địch phải đối mặt nhiều phía — nhưng **không còn là cách nhân ba sát thương**. Nếu sau này muốn kẹp trở thành chiến thuật sát thương thật, phải làm lại toàn bộ bảng mục 4 theo hướng "số nhát tính theo số mặt tiếp xúc", chứ không được để hai tài liệu nói hai kiểu.

---

## 9. Bảng cấu hình ruleset — tất cả giá trị nằm một chỗ

Đúng tinh thần spec ("không hard-code balance rải rác"), toàn bộ số liệu trên nên nằm trong một khối cấu hình:

```text
# ═══════════════════════════════════════════════════════════
# QUY TẮC ĐƠN VỊ: mọi hệ số là SỐ NGUYÊN đơn vị 1/1000.
# Không có số thực trên đường tính sát thương. Xem mục 3.6.
# ═══════════════════════════════════════════════════════════

# ── Chỉ số tam giác ─────────────────────────
HAMMER_HP            = 70
HAMMER_DAMAGE        = 24
SCISSOR_HP           = 105
SCISSOR_DAMAGE       = 16
PAPER_HP             = 168
PAPER_DAMAGE         = 10
MOTOR_HP             = 80
MOTOR_DAMAGE         = 0

# ── Hệ số khắc chế (1/1000) ─────────────────
RPS_ADVANTAGE        = 2000    # ×2.0
RPS_NEUTRAL          = 1000    # ×1.0
RPS_DISADVANTAGE     = 500     # ×0.5
MOTOR_DAMAGE_MULT    = 1000    # đánh vào Motor: không khắc chế

# ── Hệ số va chạm (1/1000) ──────────────────
IMPACT_REF_SPEED     = 4000    # TỐC ĐỘ THAM CHIẾU, đơn vị 1/1000 = 4.0 đơn vị/giây
                               # SỐ TẠM — phải hiệu chuẩn ở M1 sao cho r ≈ 1.0 ở ca chuẩn
                               # (bot cân bằng lao hết tốc lực). Xem bài test số 18.
IMPACT_BASE          = 850
IMPACT_RANGE         = 150
IMPACT_R_MAX         = 1000    # r bị kẹp trần ở đây

# ── Hệ số hướng (1/1000) ────────────────────
ORIENT_BASE          = 850
ORIENT_RANGE         = 150
ORIENT_LUT_STEPS     = 64      # 5.625° mỗi bước
ORIENT_LUT           = [1000, 999, 997, 994, 989, 982, 975, 966, 956,
                        945, 933, 921, 907, 894, 879, 865, 850,
                        # từ chỉ số 17 đến 63 đều là 850
                        ]

# ── Cộng hưởng đa dạng ──────────────────────
DIVERSITY_BONUS_PER_TYPE = 120     # 1/1000: +12% máu cho mỗi loại thêm
DIVERSITY_MAX_TYPES      = 3
DIVERSITY_COUNT_MOTOR    = false   # Motor KHÔNG được đếm là một loại (mục 6, quy tắc 1)
DIVERSITY_APPLY_TO       = MAX_HP  # cộng vào máu TỐI ĐA, không phải máu hiện tại
DIVERSITY_RECALC_ON      = STRUCTURE_CHANGE   # tính lại khi có tam giác chết

# ── Trần thuần chủng ────────────────────────
MONO_WARN_THRESHOLD  = 650     # 1/1000: >65% → cảnh báo
MONO_BLOCK_THRESHOLD = 800     # 1/1000: >80% → chặn (0 = tắt chặn)

# ── Nhịp đánh ───────────────────────────────
HIT_COOLDOWN_TICKS   = 6
HIT_COOLDOWN_SCOPE   = PER_TRIANGLE_DEFENDER
# Mỗi tam giác phòng thủ nhận TỐI ĐA 1 hit mỗi 6 nhịp,
# bất kể đang chạm bao nhiêu tam giác địch. Xem mục 8.4.

# ── Core ────────────────────────────────────
CORE_COUNT           = 1
CORE_ON_MOTOR_ALLOWED = false
# Lõi phải nằm trên tam giác CHIẾN ĐẤU (Búa/Kéo/Bao).
# Vì đánh Motor là ×1.0 với mọi loại, lõi-Motor sẽ miễn nhiễm khắc chế
# → là vị trí lõi tốt nhì trong game. Xem mục 6.6.

# ── Tải trọng Motor ─────────────────────────
MOTOR_PULL_PER_MOTOR = 4       # mỗi Motor kéo nổi 4 tam giác
LOAD_FACTOR_FLOORED  = true
# Hệ số tải hiệu dụng = max(hệ số tải hiện tại, hệ số tải lúc khóa gói).
# Chặn chuyện bot bị đánh gãy thân nên nhẹ đi rồi chạy NHANH HƠN. Xem mục 6.7.

# Bảng tốc độ theo hệ số tải — nằm ở gameplay.md mục 3.4.1
# ≤0.50 → 115%  |  0.50–1.00 → 100%  |  1.00–1.50 → giảm dần còn 70%
# 1.50–2.00 → 40%  |  >2.00 → 15% hoặc đứng chết

# ── Vùng thu hẹp chống câu giờ ──────────────
ARENA_HALF              = 20
RING_START_TICK         = 1800    # giây thứ 60
RING_START_RADIUS       = 28300   # 1/1000: 28.3 đơn vị (nửa đường chéo sân 40×40)
RING_END_RADIUS         = 4000    # 1/1000: 4.0 đơn vị
RING_ANNOUNCE_TICKS     = 45      # báo trước 1.5 giây
RING_DRAIN_PERCENT_TICK = 15      # 1/1000: 1.5% MÁU TỐI ĐA của tam giác mang lõi mỗi nhịp
# Đổi từ "2 máu cố định" sang "% máu tối đa" để mọi loại lõi có
# cùng thời gian ân hạn 2.22 giây. Xem ky_thuat_my_thuat.md mục 4.7.

# ── Điểm hết giờ ────────────────────────────
SCORE_WEIGHT_DAMAGE      = 350    # 1/1000
SCORE_WEIGHT_CORE        = 300
SCORE_WEIGHT_COMBAT_TRI  = 200
SCORE_WEIGHT_MOTOR       = 150
# Sát thương chuẩn hóa = sát thương mình ÷ max(sát thương mình, sát thương địch)
# Xem mục 8.1.

# ── Ngân sách & thời lượng ──────────────────
MAX_TRIANGLES        = 60
MATCH_MAX_TICKS      = 3600    # 120 giây × 30 nhịp/giây
TICK_RATE            = 30
```

---

## 10. Những gì PHẢI test ở M1 (đừng đoán mò)

Mọi con số trên là **điểm khởi đầu hợp lý**, không phải chân lý. Spec nói đúng: phải **đo bằng mô phỏng**. Cần kiểm tra:

1. **Búa thuần vs Bao thuần** — Bao có thắng áp đảo không? (Nếu không → tăng RPS_ADVANTAGE)
2. **Bot trộn 3 loại vs từng bot thuần** — bot trộn có thắng cả ba không? (Đây là **điều kiện nghiệm thu của cơ chế chống độc canh**)
3. **Bao thuần vs Bao thuần** — trận gương có bị timeout vô nghĩa không?
4. **Tỉ lệ thưởng đa dạng** — 12% có đủ mạnh không? Thử 8% / 12% / 16%.
5. **Ngưỡng trần thuần chủng** — 65/80 có hợp lý không, hay cần siết.
6. **Bot 70% Búa + 30% xen kẽ** — có còn cạnh tranh được không? (Nếu không → cơ chế quá hà khắc, đang giết sự tự do thiết kế)

Và bốn câu hỏi mới sinh ra từ hệ số va chạm + hệ số hướng (mục 3.3 – 3.4):

7. **Bất biến khắc chế (mục 3.8)** — phải chạy **tự động** mỗi lần đổi bất kỳ hằng số nào. Đây là bài kiểm tra chặn, không phải tham khảo: bất biến vỡ là luật RPS chết.
8. **Hiệu chuẩn `IMPACT_REF_SPEED`** — chỉnh sao cho một bot cân bằng lao hết tốc lực cho `r ≈ 1.0`. Nếu bỏ qua bước này, hệ số va chạm sẽ kẹt ở gần trần hoặc gần sàn và **mất hết tác dụng** mà không ai nhận ra.
9. **Đo sát thương trung bình thực tế trong trận.** Vì hệ số giờ **tối đa là 1.00**, sát thương trung bình sẽ thấp hơn bảng ở mục 3.7 khoảng **10–20%** → trận dài hơn, timeout nhiều hơn. Nếu đúng vậy thì chỉnh theo thứ tự ưu tiên: nâng `RPS_ADVANTAGE` trước, rồi mới tới sát thương nền. **Đo rồi hãy chỉnh, đừng chỉnh bừa.**
10. **Bộ não có tận dụng được hệ số hướng không?** — cho hai bot **cùng hình dạng** đánh nhau, một con có logic xoay mặt còn một con không. Nếu chênh lệch dưới 10% thì hệ số hướng đang quá nhẹ, không đáng công code.
11. **Bố cục tam giác lên/xuống** — bot xen lẫn hai hướng mặt có thắng bot chỉ dùng một hướng không? Đây là tầng chiến thuật mới ở mục 3.4; cần xác nhận nó **thật sự tồn tại** chứ không chỉ tồn tại trên giấy.

**Tám bài test bổ sung từ đợt rà soát lỗ hổng (xem `ra_soat_can_bang.md`):**

12. **Thời lượng trận.** Chạy 5 bot mẫu (spec mục 36) đánh vòng tròn, 100 seed mỗi cặp. Ghi phân vị 10 / 50 / 90 của thời lượng trận.
    **Tiêu chí:** trung vị nằm trong **40–80 giây**. Nếu < 30 giây → cơ chế vùng thu hẹp (bắt đầu giây 60) và công thức điểm hết giờ **không bao giờ kích hoạt**, toàn bộ công thiết kế hai cơ chế đó bỏ đi.
    *Thứ tự công tắc chỉnh:* tăng `HIT_COOLDOWN_TICKS` 6 → 10–12 trước; nếu chưa đủ thì tăng máu toàn bộ tam giác theo cùng tỉ lệ (giữ `máu × sát thương = 1680`). **Không** giảm sát thương nền — vì như vậy phá vỡ bảng mục 4 và bất biến mục 3.8.

13. **Đòn bẩy săn Motor.** Bot dồn Búa (săn Motor) vs bot cân bằng 15/15/15/15, 100 seed.
    **Tiêu chí a:** bot săn Motor **không** được thắng quá **70%**. Nếu vượt → đòn bẩy quá lớn.
    **Tiêu chí b:** đo tốc độ trung bình của bot qua trận — phải **> 60%** tốc độ tối đa. Nếu thấp hơn, Motor đang giòn quá so với vai trò của nó.
    *Ba công tắc chỉnh, theo thứ tự ưu tiên:* (1) `MOTOR_HP` 80 → 100; (2) `MOTOR_DAMAGE_MULT` 1000 → 750; (3) `MOTOR_PULL_PER_MOTOR` 4 → 3.

14. **Thủ có được thưởng miễn phí không.** Hai bot cùng hình, cùng não. Một con vào trận với lệnh "đứng yên, chỉ xoay mặt", một con lao thẳng. Đo tổng sát thương gây ra sau 30 giây.
    **Tiêu chí:** con đứng yên phải gây **< 80%** sát thương con lao vào. Nếu vượt → hệ số va chạm đối xứng đang quá hào phóng với bên thủ, và nó thưởng cho lối chơi câu giờ mà mục 8.1 vừa dựng công thức để chống.
    *Công tắc chỉnh:* tách hệ số va chạm theo từng bên (dùng vận tốc riêng của bên tấn công chiếu lên pháp tuyến) thay vì dùng chung một giá trị.

15. **Vòng sườn còn sống không.** 5 bot mẫu đánh vòng tròn, 100 seed mỗi cặp.
    **Tiêu chí:** Flanker thắng **≥ 40%** số trận, và thắng Spear ít nhất 1 trong 10 trận. Nếu Flanker thua Spear > 90% → hai hệ số mới (va chạm + hướng) đang giết trường phái này một cách có hệ thống.
    *Công tắc chỉnh:* nới `ORIENT_BASE` 850 → 900, hoặc bỏ yêu cầu `r` cho cú đánh đầu tiên sau khi tiếp xúc.

16. **Thuế hình học.** Bot cánh rộng (12×12) vs bot khối (6×6), cùng số tam giác, cùng loại, cùng não, 100 seed.
    **Tiêu chí:** bot khối **không** được thắng quá **75%**. Nếu vượt → "thuế hướng" đang quá nặng, làm mất giá trị thiết kế cánh.

17. **Cộng hưởng có thật sự cần không.** Chạy lại bài test số 2 (bot trộn 3 loại vs từng bot thuần) với `DIVERSITY_BONUS_PER_TYPE = 0`.
    **Cách đọc kết quả:**
    - Nếu bot trộn vẫn thắng ở **cả hai** trường hợp → cộng hưởng không phải yếu tố quyết định, **cân nhắc bỏ** để giảm độ phức tạp.
    - Nếu bot trộn **chỉ** thắng khi bật cộng hưởng → cộng hưởng mới thật sự cần thiết.
    Đây là cách duy nhất biết được, vì phân tích lý thuyết ở mục 6.5 cho thấy nó chỉ đóng góp 1,22–1,29 lần.

18. **Hiệu chuẩn `IMPACT_REF_SPEED`.** Bot cân bằng lao hết tốc lực vào bot đứng yên, đo `r` thực tế.
    **Tiêu chí:** `r` nằm trong **0.8–1.2**. Ngoài khoảng đó thì hệ số va chạm kẹt ở sàn 0.85 (nếu r quá nhỏ) hoặc kẹt ở trần 1.00 (nếu r quá lớn) — cả cơ chế thành vô dụng mà không ai nhận ra.

19. **Bị đánh nặng không được nhanh lên.** Bot 55/5 (quá tải nặng) đánh nhau tới khi mất 40 tam giác chiến đấu.
    **Tiêu chí:** tốc độ cuối trận **≤** tốc độ đầu trận. Nếu nhanh hơn → luật `max()` ở mục 6.7 chưa được áp đúng.

**Tiêu chí đạt:** bot trộn đủ 3 loại **thắng rõ ràng** trước mọi bot thuần chủng, **nhưng** bot nghiêng một loại (70/30) vẫn sống được. Nếu cả hai điều đó đúng → cân bằng đã đạt.

---

## 11. Tóm tắt trong một khung

```
        🔨 BÚA              ✂️ KÉO             📄 BAO
      70 máu / 24 đmg      105 máu / 16 đmg    168 máu / 10 đmg
      đánh đau, giòn       cân bằng            trâu, yếu
           │                    │                   │
           └──── Búa ăn Kéo ────┴── Kéo ăn Bao ─────┴── Bao ăn Búa ────┐
                                                                        │
                    ×2.0 có lợi  ·  ×1.0 cùng loại  ·  ×0.5 bất lợi  ←──┘

        SÁT THƯƠNG = nền × khắc chế × VA CHẠM × HƯỚNG

        + HỆ SỐ VA CHẠM: 0.85 → 1.00   (lao hết tốc lực = 1.00)
        + HỆ SỐ HƯỚNG:   0.85 → 1.00   (đỉnh chĩa thẳng vào địch = 1.00)
          ⇒ Cú đâm hời hợt nhất chỉ còn 72% sát thương của cú hoàn hảo.
          ⇒ Nhưng KHÔNG BAO GIỜ lật được khắc chế — xem bất biến ở mục 3.8.

        + CỘNG HƯỞNG ĐA DẠNG: xen nhiều LOẠI CHIẾN ĐẤU → +12% máu mỗi loại thêm (tối đa +24%)
                               (Motor không được đếm là một loại — mục 6)
        + TRẦN THUẦN CHỦNG:    >65% cảnh báo · >80% chặn (tùy chọn)

        ⇒ BOT THUẦN MỘT LOẠI BỊ PHẠT NẶNG. Không cần cấm — toán học tự lo.
          (Mức phạt thật: khắc chế ~3,5 lần + cộng hưởng ~1,25 lần.
           Phải ĐO bằng mô phỏng, không khẳng định trước — mục 6.5.)
        ⇒ BOT KHÔNG BIẾT XOAY MẶT CŨNG KHÔNG THỂ THẮNG. Bộ não phải làm việc.

        ══════════ BỐN LUẬT CHỐT Ở ĐỢT RÀ SOÁT ══════════
        1. Lõi KHÔNG được đặt trên Motor (mục 6.6)
        2. Cooldown theo TAM GIÁC PHÒNG THỦ, không theo cặp (mục 8.4)
        3. Tải trọng KHÔNG được nhẹ đi khi bot bị đánh gãy (mục 6.7)
        4. Mọi hệ số là SỐ NGUYÊN 1/1000 — không có số thực (mục 3.6)
```
