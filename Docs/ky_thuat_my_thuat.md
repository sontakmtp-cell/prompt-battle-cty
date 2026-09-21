# PROMPT CHIẾN — ĐẶC TẢ KỸ THUẬT MỸ THUẬT (TECHNICAL ART)

**Trạng thái:** Đề xuất, áp dụng từ mốc M1.5
**Phạm vi:** Lớp hiển thị của Web Battle Viewer và Replay Viewer (Canvas 2D)
**Mục tiêu:** Kết nối khâu mỹ thuật với khâu phát triển — biến dữ liệu mô phỏng thành hình ảnh sống động, mà **không phá vỡ tính tất định** của engine.

---

## 0. Vì sao cần tài liệu này

Đọc `spec_demo.md`, `PLAN.md`, `gameplay.md` và `can_bang.md` thì thấy dự án đã đặc tả rất chặt phần **luật chơi** và **dữ liệu**. Riêng phần hình ảnh mới dừng ở:

- `spec_demo.md` mục 20 — Visual Direction (7 dòng, toàn tính từ: "mềm", "sống", "hơi giống chất lỏng")
- `gameplay.md` mục 5.7 — vài câu về cảm giác khi xem trận

Còn thiếu hẳn bốn thứ mà khâu phát triển cần để làm việc được:

| Thiếu gì | Hệ quả nếu không bổ sung |
|---|---|
| Hợp đồng dữ liệu engine → lớp hiệu ứng | Dev và artist đoán ý nhau; hiệu ứng gắn chặt vào engine, sửa là vỡ |
| Cách biến hình học cứng thành sinh vật mềm | Kết quả ra "hai đống tam giác trượt qua nhau", phản bội lời hứa ở mục 37 |
| Cách mã hóa loại tam giác / đội | 120 tam giác trên nền trắng nhìn không phân biệt được, người mù màu không đọc được |
| Ngân sách hiệu năng | Hiệu ứng đẹp trên máy dev, giật trên máy người chơi |

Tài liệu này bổ sung đúng bốn thứ đó.

---

## 1. Nguyên tắc vàng số 0 — mỹ thuật không được chạm vào mô phỏng

Đây là nguyên tắc quan trọng nhất, mọi thứ khác phải nhường nó.

`spec_demo.md` mục 18 yêu cầu engine tất định: *cùng engine + cùng hai gói bot + cùng seed = cùng kết quả*. Để giữ được điều đó:

> **Lớp mỹ thuật là lớp trang trí thuần túy, chảy một chiều, không có đường quay ngược.**

Ba hệ quả bắt buộc:

**1. Không có gì trong lớp vẽ được ảnh hưởng tới mô phỏng.**
Nếu ta uốn cong hình để bot trông mềm nhũn, thì đó **chỉ là hình vẽ**. Hộp va chạm, vị trí, sát thương vẫn dùng hình học gốc. Không bao giờ đọc vị trí "đã làm mượt" để tính va chạm.

**2. Mọi ngẫu nhiên trong hiệu ứng phải lấy từ seed của trận.**
Nếu hạt lửa bắn ra bằng `Math.random()`, thì xem lại replay lần hai sẽ thấy màn bắn khác lần đầu. Số liệu vẫn đúng, nhưng lời hứa ở `gameplay.md` mục 6.1 — *"băng ghi hình có thể phát lại chính xác 100%"* — sụp đổ về mặt cảm giác. Người chơi sẽ không tin vào băng ghi nữa.

Cách làm: mọi giá trị ngẫu nhiên của hiệu ứng đều tính bằng
```text
rng = hash(matchSeed, tick, eventIndex, particleIndex)
```
Cùng seed → cùng màn bắn hạt, y như nhau ở mọi lần xem.

**3. Mảnh tách rời được phép có "bóng ma".**
`gameplay.md` mục 5.5 nói mảnh tách rời biến mất ngay trong mô phỏng, nhưng Viewer cho tan biến cho đẹp mắt. Nghĩa là lớp vẽ được phép giữ một **thực thể chỉ-để-nhìn** (cosmetic-only): nó không tồn tại trong sim, không va chạm, không tính điểm, tự chết sau ~0.6 giây. Đây là khuôn mẫu hợp lệ và sẽ dùng lại nhiều lần.

---

## 2. Hợp đồng dữ liệu — cầu nối thật giữa hai khâu

Đây là phần trả lời trực tiếp yêu cầu "kết nối khâu mỹ thuật với khâu phát triển".

**Tin tốt:** engine **đã buộc phải** sinh event log cho replay (`spec_demo.md` mục 19). Vậy lớp mỹ thuật chỉ cần **dùng lại đúng luồng event đó** — dev không phải viết thêm gì.

### 2.1. Kiểu dữ liệu sự kiện

```ts
// Gói trong Contracts, dùng chung cho replay và cho lớp hiệu ứng
type Team = 'A' | 'B';
type TriType = 'hammer' | 'scissor' | 'paper' | 'motor';

type VfxEvent =
  | { kind: 'hit';          tick: number; at: Vec2; normal: Vec2;
      attacker: TriId; defender: TriId;
      damage: number; advantage: 'adv' | 'neutral' | 'disadv';
      impactMul: number; orientMul: number }   // đơn vị 1/1000, khoảng 850–1000

  | { kind: 'destroy';      tick: number; at: Vec2; tri: TriId;
      type: TriType; team: Team; by: TriId | null }

  | { kind: 'detach';       tick: number; team: Team; tris: TriId[] }

  | { kind: 'motorLost';    tick: number; team: Team;
      side: 'left' | 'right' | 'center'; count: number }

  | { kind: 'overload';     tick: number; team: Team; loadFactor: number }

  | { kind: 'coreHit';      tick: number; team: Team; hpRatio: number }

  | { kind: 'coreDestroyed';tick: number; team: Team; at: Vec2 }

  | { kind: 'ringStart';   tick: number; radius: number }
  | { kind: 'ringEnter';   tick: number; team: Team }   // lõi vừa ra ngoài vòng
  | { kind: 'ringExit';    tick: number; team: Team }   // lõi vừa quay vào trong

  | { kind: 'matchEnd';     tick: number; winner: Team | 'draw';
      reason: 'core' | 'incap' | 'timeout' };
```

### 2.2. Ba quy tắc của hợp đồng

1. **Engine chỉ phát sự kiện, engine không biết gì về hình ảnh.** Trong event không có trường nào kiểu `color`, `effect`, `particle`. Nếu dev muốn đổi hiệu ứng, dev không cần sửa engine.
2. **Bộ điều phối hiệu ứng (VFX Director) là nơi duy nhất đọc sự kiện** và quyết định vẽ gì. Một file, một chỗ, dễ tìm.
3. **Thêm hiệu ứng mới = thêm một nhánh xử lý + một khối cấu hình.** Không đụng vào lõi game.

### 2.3. Bảng ánh xạ sự kiện → hiệu ứng

| Sự kiện | Hiệu ứng | Ghi chú |
|---|---|---|
| `hit` hệ số lợi thế | Tia va chạm bắn theo pháp tuyến, màu đậm, 6–10 hạt | Đây là cú đánh "đau" — phải nhìn là biết ngay |
| `hit` cùng loại | Chớp trắng nhẹ ở điểm chạm, 3 hạt | Cú đánh trung tính, không nên ồn |
| `hit` bất lợi | Tia mảnh, màu nhạt, 2 hạt + rung nhẹ bên thua | Bên gây ra phải thấy rõ là đang yếu thế |

Ba dòng `hit` ở trên quyết định **loại** hiệu ứng. Số lượng hạt, độ dài tia và độ nén còn **nhân thêm theo `impactMul` và `orientMul`** — xem mục 3.4. Cùng là "hit có lợi thế" nhưng một cú lao hết tốc lực phải trông khác hẳn một cú cọ xát.
| `destroy` | Tam giác chớp trắng 2 khung hình → vỡ thành 4–6 mảnh nhỏ → tan biến 0.4s | Mảnh là thực thể chỉ-để-nhìn |
| `detach` | Cụm **đứng yên tại chỗ**, đổi xám bạc, có đường đứt gãy, rồi trôi nhẹ và mờ dần — tổng 0.9s | Xem **mục 4.8**. Mảnh **không được** trôi theo thân bot |
| `motorLost` | Tia lửa + luồng hơi ở vị trí cụm, thân bot nghiêng về phía mất | Báo hiệu "mất chân", nối với cơ chế tải trọng |
| `overload` | Hơi nước thoát ra rìa thân, nhịp thở chậm lại, thân chùng xuống | Chỉ bắn **một lần** khi vượt ngưỡng, không lặp mỗi nhịp |
| `coreHit` | Vòng lõi nháy đỏ, rung toàn thân | Mức độ mạnh theo lượng máu mất |
| `coreDestroyed` | Vòng xung kích lan rộng, mọi tam giác của bên thua chớp trắng rồi tan | Cao trào của trận — được phép ồn nhất |
| `ringStart` | Vòng nét đứt hiện dần trong 1.5 giây | Báo trước — **không bật đột ngột** (mục 4.7) |
| `ringEnter` | Vòng lõi nháy đỏ 2 Hz + đường mảnh chỉ hướng quay vào | Chi tiết quan trọng nhất của mục 4.7 |
| `ringExit` | Tắt nháy đỏ, đường chỉ hướng mờ dần rồi biến mất | Không ăn mừng — chỉ là hết nguy hiểm |
| `matchEnd` | Làm chậm thời gian 0.5s, chữ kết quả hiện dần | Không dùng slow-motion nếu đang ở tốc độ x4 |

---

## 3. Bài toán khó nhất — làm hình học cứng trông như sinh vật sống

`spec_demo.md` mục 20 và mục 37 đòi: *silhouette mềm, sống, hơi giống chất lỏng; chuyển động hữu cơ dù cấu trúc nền là hình học*. Đây chính là bài toán của Technical Artist, và là chỗ dễ thất bại nhất của cả dự án.

Bảy kỹ thuật dưới đây xếp theo **cảm giác thu được trên mỗi đơn vị công sức**, làm từ trên xuống.

### 3.1. Nội suy giữa hai nhịp — mượt mà không phá tất định

Đây là quyết định quan trọng nhất, và phải chốt trước khi viết một dòng code vẽ nào.

Sim chạy **30 nhịp/giây** (`spec_demo.md` mục 9). Màn hình thường chạy **60 hoặc 120 khung/giây**. Nếu cứ mỗi nhịp mô phỏng vẽ một khung, hình sẽ giật thấy rõ — trong khi `gameplay.md` mục 5.1 hứa *"người xem thấy nó chạy liên tục như phim"*.

**Giải pháp:** vẽ ở tần số màn hình, nội suy vị trí và góc giữa **hai nhịp liền kề**:

```text
alpha  = (thời gian_hiện_tại − mốc_nhịp_N) / độ_dài_một_nhịp
vẽ_tại = nội_suy(trạng_thái[N], trạng_thái[N+1], alpha)
```

Điểm mấu chốt: **đây là phép nội suy thuần túy để vẽ.** Mô phỏng vẫn nhảy từng nhịp nguyên vẹn, vẫn tất định. Ta chỉ vẽ ở giữa hai nhịp.

> ⚠️ **Cạm bẫy:** đừng bao giờ "làm mượt" bằng cách lấy trung bình nhiều nhịp trước. Cái đó làm mô phỏng phụ thuộc vào lịch sử, và ở tốc độ x4 (bỏ nhịp) sẽ cho hình khác x1. Nội suy giữa đúng hai nhịp liền kề là an toàn ở mọi tốc độ.

### 3.2. Trễ thị giác + lò xo — kỹ thuật đem lại nhiều cảm giác nhất

Thân bot được vẽ **không trùng khít** với vị trí mô phỏng. Thay vào đó, nó đuổi theo vị trí đó qua một lò xo tắt dần:

```text
v   += (vị_trí_sim − vị_trí_vẽ) × độ_cứng − v × độ_tắt_dần
vị_trí_vẽ += v
```

Thân bot vì thế **vượt lên trước rồi mới rơi về đúng chỗ** sau mỗi cú tăng tốc, và **chúi về trước** khi phanh gấp. Đây chính là thứ khiến người ta đọc hình là "có khối lượng" chứ không phải "một mảng đang bị dịch chuyển".

Cùng cơ chế áp cho **góc xoay**: bot xoay ý định thì thân xoay theo trễ hơn một chút. Bot quay nhanh sẽ thấy thân "bị bỏ lại sau" rồi mới bắt kịp.

Thông số khởi điểm: độ cứng ≈ 18–25, độ tắt dần ≈ 6–9 (tính theo giây). Chỉnh ở sân thử hiệu ứng, không hard-code.

### 3.3. Dao động đỉnh — cho silhouette thôi thẳng tắp

Mỗi đỉnh tam giác có một độ lệch pha riêng, suy ra từ id của nó (không dùng `Math.random()` — xem mục 1). Mỗi khung hình, đỉnh lệch khỏi vị trí gốc một đoạn:

```text
lệch = biên_độ × ( sin(t × tần_số + pha) , cos(t × tần_số × 0.7 + pha × 1.3) )
```

- **Biên độ:** 2–4% cạnh tam giác. Quá lớn sẽ trông như bot bị tách khỏi hộp va chạm của chính nó.
- **Tần số:** ~1.2 Hz khi khỏe, tăng lên 3–4 Hz khi bị thương.
- **Quan trọng:** chỉ đỉnh ở **rìa silhouette** dao động mạnh; đỉnh nằm sâu bên trong thân dao động yếu (dùng khoảng cách tới biên để điều biến). Nhờ vậy khối thân giữ được hình dạng, chỉ có đường viền "thở".

### 3.4. Nén – giãn khi va chạm

Khi có `hit`, thân bên bị đánh bị nén theo phương pháp tuyến của va chạm: co lại theo phương đó, phình ra theo phương vuông góc, rồi bật về bằng lò xo trong ~8 nhịp.

Từ khi `can_bang.md` tách sát thương thành bốn thừa số (mục 3.1), sự kiện `hit` mang theo **`impactMul` và `orientMul`** — hai hệ số nói rõ cú đánh này *mạnh cỡ nào* và *có vuông mặt không*. Lớp vẽ dùng thẳng hai số đó, **không suy diễn từ `damage`**:

| Thành phần biến dạng | Lấy từ | Ý nghĩa hình ảnh |
|---|---|---|
| **Độ lớn nén** | `impactMul` | Lao mạnh → nén sâu. Cọ xát → gần như không nén |
| **Hướng nén** | `normal` | Nén dọc theo pháp tuyến va chạm |
| **Độ tóe của tia lửa** | `orientMul` | Đâm vuông mặt → tia bắn thẳng, gọn. Đâm ngang → tia tóe rộng, tản mát |

```text
nén = 1 + 0.30 × (impactMul − 850) ÷ 150      // 850 → 1.00 ; 1000 → 1.30
```

**Vì sao tách hai kênh thay vì gộp vào `damage`:** một cú đâm vuông mặt nhưng chậm và một cú đâm ngang nhưng nhanh có thể ra **cùng một con số sát thương**, nhưng phải **trông khác nhau**. Dùng `damage` thì hai cú đó vẽ y hệt nhau — mất sạch thông tin.

Đây là chỗ mỹ thuật trả lại giá trị cho gameplay: người xem phân biệt được *"con này đâm đúng mặt"* với *"con này chỉ lao mạnh"* mà không cần nhìn số.

### 3.5. Thở

Một dao động co giãn rất chậm (0.5–0.7 Hz, biên độ ±1.5%) áp lên toàn thân. Không nhìn thấy rõ bằng mắt thường, nhưng khi tắt đi thì hình lập tức trông như đồ chết. Đây là loại hiệu ứng "không ai nhận ra, nhưng thiếu là biết ngay".

### 3.6. Vệt lao

Khi tốc độ vượt ~60% tốc độ tối đa, thân để lại vệt mờ phía sau. **Không vẽ lại thân bot N lần** (quá đắt với 60 tam giác × N bản). Dùng kỹ thuật đệm mờ:

1. Vẽ thân bot vào một canvas phụ.
2. Mỗi khung hình, phủ lên canvas phụ một lớp mờ nhẹ (đổ màu nền arena với alpha ~0.35).
3. Vẽ bản thân mới nhất lên trên.
4. Đem canvas phụ ghép vào màn hình.

Chi phí gần như cố định, không phụ thuộc số bản vệt. Nền arena trắng nên pha mờ về màu trắng là hoàn toàn tự nhiên.

### 3.7. Bảng trạng thái cơ thể → dáng vẻ

Đây là chỗ nối trực tiếp với `gameplay.md` mục 5.5 (*"cơ thể bị thương thì hành vi đổi"*) và mục 3.4.1 (tải trọng). Hình dáng phải **kể lại** trạng thái đó:

| Trạng thái trong mô phỏng | Dáng vẻ phải thể hiện |
|---|---|
| Hệ số tải ≤ 1.0 | Thở đều, dao động êm, vệt lao gọn |
| Hệ số tải 1.0 – 1.5 | Thở hơi nặng, thân hơi chùng, dao động chậm lại |
| Hệ số tải 1.5 – 2.0 | Thân chùng rõ, tần số thở giảm, có hơi thoát ra rìa |
| Hệ số tải > 2.0 (quá tải) | **Gần như bất động, thân xệ xuống, hơi nước thoát liên tục** — phải trông như một con vật gục |
| Mất cụm Motor một bên | **Nghiêng hẳn về phía mất**, đường đi cong lệch thấy rõ |
| Mất > 50% thân | Rung biên độ lớn, tần số cao — run như đói hoặc như đau |
| Máu lõi < 30% | Nhịp đập lõi nhanh gấp đôi, quầng đỏ quanh lõi |
| Còn đúng 1 tam giác chiến đấu | Rung mạnh liên tục, gần như mất ổn định |

> Mục tiêu: **người xem phải đoán được trạng thái bot chỉ bằng mắt**, trước cả khi nhìn thanh máu.

---

## 4. Mã hóa hình ảnh — nhìn là hiểu, không cần chú thích

### 4.1. Vấn đề

120 tam giác, 4 loại, 2 đội, trên nền trắng phẳng. Nếu phân biệt **chỉ bằng màu** thì hai lỗi xảy ra ngay:

- Loại và đội tranh nhau trong cùng một kênh thị giác → rối, không đọc được.
- Người mù màu (khoảng 8% nam giới) không phân biệt được đội nào với đội nào.

### 4.2. Giải pháp — bốn kênh nhận diện

> **Màu mã hóa ĐỘI. Hoa văn và nét vẽ mã hóa LOẠI.**
> Hai kênh độc lập, không tranh nhau.

Nhưng chỉ hai kênh đó là chưa đủ: màu là kênh duy nhất mà người mù màu không đọc được. Nên hệ thống có **bốn kênh**, xếp theo tốc độ đọc:

| Kênh | Mã hóa cái gì | Ai đọc được | Đọc trong bao lâu |
|---|---|---|---|
| **1. Họ màu** | Đội | Người nhìn màu bình thường | ~0.2 giây |
| **2. Hoa văn + độ dày nét** | Loại tam giác | Mọi người | ~0.5 giây |
| **3. Huy hiệu ở lõi** | Đội (dự phòng) | Mọi người | ~1 giây |
| **4. Vị trí + HUD** | Đội (dự phòng) | Mọi người | tức thì |

**Bảng màu và hoa văn:**

| Loại | Đội A (họ nóng) | Đội B (họ lạnh) | Hoa văn + nét |
|---|---|---|---|
| 🔨 **Búa** | `#C0392B` | `#1D4ED8` | Nền đặc, **viền dày 2px** |
| ✂️ **Kéo** | `#E67E22` | `#0E9488` | Nền đặc, **viền mảnh 1px** |
| 📄 **Bao** | `#A0821A` | `#4D7C3A` | Nền **chấm bi** (alpha 65%), viền 1px |
| ⚙️ **Motor** | `#E8EBEF` | `#E8EBEF` | Nền rất nhạt, **viền nét đứt**, màu viền = màu đội |

Kiểm tra bắt buộc: mọi màu trên phải đạt **tương phản ≥ 3:1** với nền trắng (chuẩn WCAG cho đối tượng đồ họa). Riêng Motor dùng viền nét đứt để vẫn đọc được khi in đen trắng.

### 4.3. Vì sao kênh 3 và 4 là bắt buộc, không phải tùy chọn

Đây là chỗ dễ tự lừa mình nhất. Nhiều người tưởng "nóng với lạnh thì khác nhau rõ" — nhưng khi mất màu thì không.

Tính theo công thức độ sáng tương đối của WCAG:

```text
#C0392B  (Búa Đội A)  →  độ sáng tương đối 0.143
#1D4ED8  (Búa Đội B)  →  độ sáng tương đối 0.107
tương phản thang xám  =  (0.143 + 0.05) ÷ (0.107 + 0.05)  ≈  1.23 : 1
```

**1.23 : 1 là gần như không phân biệt được.** Ngưỡng tối thiểu cho hai mảng màu nằm cạnh nhau là 3:1. Nghĩa là: in báo cáo đen trắng, hoặc chụp màn hình đăng lên bài viết không màu — hai con bot thành hai đám xám giống hệt nhau.

> ⚠️ **Không thể vừa đạt tương phản cao với nền trắng, vừa đạt tương phản cao giữa hai đội trong thang xám.** Hai mục tiêu kéo ngược nhau. Phải chọn: ưu tiên nhìn rõ trên nền trắng (vì đó là điều kiện để chơi được), rồi bù bằng **kênh không dùng màu**.

**Kênh 3 — huy hiệu ở lõi.** Lõi là thứ duy nhất luôn tồn tại suốt trận và luôn là tâm điểm của mắt. Huy hiệu vẽ quanh vòng lõi:

| Đội | Huy hiệu | Mô tả |
|---|---|---|
| A | Vòng tròn **liền** | Một nét tròn khép kín, nét 2px |
| B | Vòng tròn **bốn rãnh** | Cùng vòng tròn đó, cắt bỏ 4 cung đối xứng |

Vì huy hiệu nằm ở lõi, nó **không phụ thuộc hình dạng bot** — bot mất 90% thân thì huy hiệu vẫn nguyên chỗ. Chi phí vẽ: 2 hình cho cả sân.

**Kênh 4 — vị trí và HUD.** Không bao giờ đổi trong suốt trận:

- Đội A **luôn** xuất phát từ cạnh trái, Đội B **luôn** từ cạnh phải.
- HUD: thanh máu và tên Đội A nằm bên trái, Đội B nằm bên phải — không đảo thứ tự ở bất kỳ chỗ nào, kể cả trong danh sách sự kiện, bảng kết quả, hay bài phân tích sau trận.

**Kiểm tra nghiệm thu:** chụp một khung hình giữa trận → chuyển sang thang xám → hai bot **phải phân biệt được** nhờ huy hiệu và vị trí, dù màu đã mất hết thông tin. Đây là bài kiểm tra tự động chạy được, nên đưa vào bộ kiểm tra của M2.

**Nếu sau này muốn màu cũng sống sót qua thang xám:** cách duy nhất là đảo ngược độ đậm giữa hai đội — Đội A nền đậm + viền đậm, Đội B nền nhạt + viền đậm. Đổi lại, Đội B mất tương phản với nền trắng. Không khuyến nghị ở bản demo; ghi lại đây để dành.

### 4.4. Viền silhouette — kỹ thuật rẻ tiền cho đường bao sạch

Cần một đường bao tối quanh **toàn bộ** con bot (không phải quanh từng tam giác) để nó tách khỏi nền trắng và khỏi con địch. Cách làm:

1. Với mỗi tam giác: vẽ **bản phóng to ra ~2px từ trọng tâm**, tô màu tối.
2. Với mỗi tam giác: vẽ bản đúng kích thước, tô màu thật, **đè lên trên**.

Các bản phóng to của những tam giác kề nhau **hợp lại thành một đường bao liền**, còn các nét bên trong bị lớp tô phía sau che mất. Kết quả: đường bao ngoài sạch, không có nét thừa bên trong, chi phí chỉ gấp đôi số lệnh tô — rẻ hơn nhiều so với việc tính hợp hình học.

### 4.5. Trạng thái máu

| Mức | Cách thể hiện |
|---|---|
| 100% – 60% | Màu gốc |
| 60% – 40% | Pha dần về trắng ~15% (nhợt đi) |
| 40% – 15% | Nhợt hơn + thêm **một vạch nứt** từ trọng tâm tới một đỉnh |
| < 15% | Nhợt nhiều + vạch nứt đậm, hơi rung cục bộ |

**Lõi:** vòng tròn quanh trọng tâm tam giác mang lõi, có **cung tròn hiển thị % máu còn lại**, nhịp đập chậm khi khỏe và nhanh dần khi yếu. Lõi phải là thứ dễ thấy nhất trên sân — vì nó là mục tiêu của cả trận.

### 4.6. Bản đồ sát thương (chế độ xem lại)

`spec_demo.md` mục 19 yêu cầu có bản đồ sát thương nhưng chưa nói vẽ thế nào — và cũng chưa nói **lấy dữ liệu từ đâu**. Cần cả hai.

**Yêu cầu dữ liệu (phần của dev):** engine phải đếm **tổng sát thương đã nhận của từng tam giác**, cộng dồn theo trận. Không cần lưu mỗi nhịp — chỉ cần lưu trong **checkpoint mỗi giây** đã có sẵn (`spec_demo.md` mục 19).

```text
// thêm vào mỗi checkpoint, cho mỗi bot
damageReceived: Uint16Array   // 60 phần tử, theo thứ tự tam giác
```

Chi phí: 60 × 2 byte × 2 bot × 120 checkpoint ≈ **28.8 KB mỗi trận**. Không đáng kể so với dung lượng replay.

**Cách vẽ:**

- Bật/tắt bằng nút riêng trong Replay Viewer, **mặc định tắt** để không phá vẻ sạch của arena.
- Khi bật: **thay màu nền** của từng tam giác bằng màu nhiệt, **giữ nguyên viền và hoa văn**. Nhờ vậy vẫn đọc được đội và loại tam giác qua viền — hệ thống mã hóa ở mục 4.2 không bị vô hiệu.
- Giá trị nhiệt = sát thương đã nhận **tính đến nhịp đang xem**, chia cho giá trị lớn nhất trong cả hai bot tại nhịp đó. Nghĩa là bản đồ **nóng dần khi tua**, cho thấy trận đánh tập trung ở đâu theo thời gian.
- Thang màu:

| Mức | Màu | Ý nghĩa |
|---|---|---|
| 0 | trong suốt (giữ màu gốc) | Chưa từng ăn đòn |
| 0.25 | `#FAC775` | Bị đánh nhẹ |
| 0.5 | `#EF9F27` | Chịu đòn đáng kể |
| 0.75 | `#D85A30` | Đây là chỗ giao chiến chính |
| 1.0 | `#A32D2D` | Chỗ ăn đòn nặng nhất trận |

- Kèm một **thang màu nhỏ ở góc** và **ba tam giác nóng nhất** ghi rõ mã tam giác + nhịp bị phá (nếu có). Đây là thứ biến bản đồ từ "hình cho đẹp" thành **công cụ phân tích** — đúng tinh thần Mùa ④ ở `gameplay.md` mục 6.
- Hiệu năng: chỉ là đổi bảng tra màu khi tô, **không thêm lệnh vẽ nào**. Gần như miễn phí.

**Một lưu ý về ý nghĩa:** bản đồ này đo **sát thương đã nhận**, không phải sát thương đã gây. Đó là lựa chọn có chủ ý — nó trả lời câu hỏi *"con bot của tao gãy ở đâu"*, là câu hỏi người chơi thật sự hỏi khi xem lại trận thua (`gameplay.md` mục 6.2). Muốn xem sát thương đã gây thì cần một lớp phủ thứ hai — để dành sau M2.

### 4.7. Vùng thu hẹp chống câu giờ

`can_bang.md` mục 8.2 đề xuất vòng an toàn thu nhỏ sau ~60 giây, nhưng **chỉ có đúng một câu** — thiếu cả thông số lẫn mô tả hình ảnh. Cần cả hai.

**Thông số đề xuất** (thuộc `ruleset`, phải qua mô phỏng để chốt — không phải chân lý):

```text
ARENA_HALF              = 20      # sân 40 × 40, tâm ở (20, 20)
RING_START_TICK         = 1800    # bắt đầu thu ở giây thứ 60
RING_START_RADIUS       = 28.3    # bán kính phủ trọn cả sân (nửa đường chéo)
RING_END_RADIUS         = 4.0     # bán kính lúc hết giờ (giây 120)
RING_DRAIN_PERCENT_TICK = 1.5     # % MÁU TỐI ĐA của tam giác mang lõi, mỗi nhịp
RING_ANNOUNCE           = 45      # nhịp báo trước khi vòng bắt đầu thu (1.5 giây)
```

Tốc độ thu: `(28.3 − 4.0) ÷ 60 giây ≈ 0.405 đơn vị mỗi giây` — chậm, đủ để người chơi phản ứng.

**Luật đi kèm:** sát thương vùng thu hẹp đánh vào **tam giác đang mang lõi**, không rải lên toàn thân. Lý do: chỉ có một mục tiêu nên người xem hiểu ngay, và tránh hiệu ứng dây chuyền kỳ quặc kiểu *"ở ngoài vòng nên mất Motor nên quá tải"*.

> ⚠️ **Đã sửa trong đợt rà soát: sát thương vòng đổi từ "2 máu cố định mỗi nhịp" sang "1.5% máu tối đa mỗi nhịp".**
>
> Bản cũ dùng số cố định, nên thời gian ân hạn phụ thuộc hoàn toàn vào **loại tam giác mang lõi** — chênh nhau tới 2,4 lần:
>
> | Lõi | Máu | Bản cũ (2 máu/nhịp) | Bản mới (1.5%/nhịp) |
> |---|---|---|---|
> | Búa | 70 | **1,17 giây** | **2,22 giây** |
> | Kéo | 105 | 1,75 giây | 2,22 giây |
> | Bao | 168 | **2,80 giây** | 2,22 giây |
> | Motor | 80 | 1,33 giây | — (không được làm lõi) |
>
> Với bản cũ, một bot lõi Búa bị đẩy ra ngoài vòng **chết gần như chắc chắn** — 1,17 giây không đủ để hiểu chuyện gì đang xảy ra, chứ chưa nói tới quay vào. Điều đó vô tình biến **lõi Bao thành mặc định**, và mở ra chiến thuật giết người mới: *"kiting + vòng thu"* — kéo địch ra rìa đúng lúc vòng bắt đầu thu, địch lõi Búa chết trong hơn 1 giây mà không cần đánh.
>
> Bản mới cho **mọi loại lõi cùng 2,22 giây ân hạn** — công bằng, và dễ hiểu hơn cho người xem: *"mày có hơn 2 giây để quay vào"*. Đổi lại, lõi Bao không còn được lợi vô lý từ việc chọn lõi trâu.
>
> **Việc của lớp vẽ:** dòng máu chảy ra ở vòng lõi phải tính theo **tỉ lệ**, không theo số tuyệt đối — nếu không, một lõi Bao sẽ trông như đang mất máu chậm hơn hẳn lõi Búa, trong khi thời gian ân hạn thật của hai bên đã bằng nhau.

**Mô tả hình ảnh:**

| Giai đoạn | Hình ảnh |
|---|---|
| Trước khi thu 1.5 giây | Vòng nét đứt hiện dần từ alpha 0 lên 0.6. **Không bao giờ để vòng "bật" đột ngột** — người xem phải được báo trước |
| Đang thu | Vòng nét đứt 1.5px màu `#888780`, bán kính co lại theo nhịp. Vùng **ngoài** vòng phủ lớp xám alpha 8% |
| Càng về cuối trận | Lớp phủ ngoài đậm dần lên 14% khi bán kính xuống dưới 10 — mắt thấy "đất đang hết" |
| Lõi một bot ở ngoài vòng | Vòng lõi bot đó **nháy đỏ 2 Hz** + một **đường mảnh nối từ lõi tới điểm gần nhất trên vòng**, chỉ thẳng đường quay vào. Đây là chi tiết quan trọng nhất: nó biến "mày đang mất máu" thành "mày đang mất máu và phải đi hướng này" |
| Cả hai lõi trong vòng | Không có tín hiệu gì thêm. Vòng chỉ là nền |

Không dùng hiệu ứng gây sốc (chớp màn hình, rung camera). Đây là **tín hiệu chiến thuật**, không phải hình phạt.

**Cần bổ sung vào hợp đồng sự kiện** (mục 2.1):

```ts
  | { kind: 'ringStart'; tick: number; radius: number }
  | { kind: 'ringEnter'; tick: number; team: Team }   // lõi vừa ra ngoài vòng
  | { kind: 'ringExit';  tick: number; team: Team }   // lõi vừa quay vào trong
```

Bán kính mỗi nhịp **không cần phát sự kiện** — nó suy được từ `tick` cộng hằng số ruleset, nên lớp vẽ tự tính. Phát mỗi nhịp là lãng phí và làm phình replay.

### 4.8. Mảnh tách rời — khoảnh khắc mất liên thông

`spec_demo.md` mục 8 và `gameplay.md` mục 5.5 mô tả luật rất rõ, nhưng chưa nói **trông ra sao khi xem**. Đây là một trong những khoảnh khắc kể chuyện quan trọng nhất của trận — bỏ qua là mất rất nhiều.

**Ba nguyên tắc:**

1. **Mảnh phải đứng yên tại chỗ ngay lập tức.** Đây là lỗi dễ mắc nhất: nếu mảnh vẫn trôi theo thân bot đang bò, người xem hiểu sai là nó còn thuộc bot. Mảnh giữ nguyên **vị trí thế giới** tại đúng nhịp đứt.
2. **Mảnh đổi màu để báo "hết quyền điều khiển".** Chuyển sang xám bạc `#B4B2A9`, mất hết màu đội và hoa văn loại. Nó không còn là một phần của sinh vật nữa.
3. **Cả cụm trôi cùng nhau, giữ nguyên hình dạng tương đối.** Một cụm 5 tam giác rời ra phải trôi như một mảnh, không tản ra như bụi.

**Dòng thời gian của hiệu ứng:**

| Nhịp | Hình ảnh |
|---|---|
| T | Tam giác vừa vỡ **chớp trắng** 2 khung hình |
| T → T+8 (~0.27 giây) | Mảnh **đóng băng**, vẽ thêm một **đường đứt gãy** zigzag 2–3 đoạn ở chỗ vừa mất kết nối, màu tối, mờ dần |
| T+9 → T+27 (~0.6 giây) | Mảnh trôi nhẹ ra xa theo hướng ly tâm (khoảng 0.15 đơn vị/giây), đồng thời mờ dần về 0 |
| T+27 | Biến mất hoàn toàn |

Tổng cộng ~0.9 giây. Đủ để mắt bắt được, không đủ để rối màn hình khi có nhiều mảnh vỡ cùng lúc.

**Trường hợp riêng — cụm Motor bị tách rời:** phải có thêm tín hiệu "mất chân", vì đây là bước ngoặt chiến thuật lớn (`gameplay.md` mục 3.4.1). Thêm tia lửa ngắn ở mép đứt + thân chính **nghiêng hẳn** về phía vừa mất. Người xem phải thấy ngay: *con này vừa mất một chân*.

**Trường hợp riêng — nhiều mảnh cùng lúc:** nếu một nhịp có từ 3 mảnh trở lên, giảm alpha và kích thước hiệu ứng của từng mảnh theo tỉ lệ, để tổng lượng "mực" trên màn hình không tăng vọt. Trần cứng: hiệu ứng mảnh vỡ không được chiếm quá 40% số hạt trong ngân sách.

**Vết sẹo (tùy chọn, mặc định tắt):** một vạch tối mảnh đánh dấu chỗ đứt, tồn tại tới hết trận. Hữu ích khi phân tích, nhưng làm rối arena trong lúc xem thường. Đề xuất gắn nó vào chế độ "phân tích" dùng chung với bản đồ sát thương (mục 4.6).

**Nhắc lại một điều quan trọng:** mảnh tách rời **không tồn tại trong mô phỏng** (`PLAN.md`: *"loại khỏi mô phỏng ngay"*). Nó không tính vào tải trọng, không va chạm, không gây sát thương. Toàn bộ mục 4.8 này là **thực thể chỉ-để-nhìn** — đúng khuôn mẫu đã đặt ra ở mục 1.3.

---

## 5. Ngân sách hiệu năng Canvas 2D

### 5.1. Phân bổ trong một khung hình 16.6 ms (mục tiêu 60 fps)

| Hạng mục | Ngân sách | Ghi chú |
|---|---|---|
| Nền arena + lưới mờ | 0.3 ms | Vẽ một lần vào canvas phụ, không vẽ lại |
| 120 tam giác (2 bot) | 1.5 ms | Gộp lệnh vẽ theo kiểu — xem 5.2 |
| Hiệu ứng hạt (trần 300 hạt) | 3.0 ms | Dùng vòng đối tượng tái sử dụng, không cấp phát mới |
| Vệt lao | 1.0 ms | Kỹ thuật đệm mờ ở mục 3.6 |
| Lớp phủ (lõi, thanh máu, HUD) | 1.0 ms | HUD nên để ở DOM, không vẽ vào canvas |
| **Còn dự phòng** | **~9.8 ms** | Đủ rộng cho máy yếu |

Nói thẳng: **120 tam giác với Canvas 2D gần như miễn phí.** Chỗ dễ vượt ngân sách thật sự là hạt, vệt, và bóng đổ — không phải thân bot. Nên tối ưu tập trung vào ba chỗ đó.

### 5.2. Năm quy tắc tối ưu bắt buộc

1. **Gộp lệnh vẽ.** Thay vì 120 lần `fill()`, gom tam giác theo cặp (loại × đội) thành 8 đối tượng `Path2D`, mỗi cái tô một lần. Đây là mức tối ưu lớn nhất và dễ làm nhất.
2. **Cấm `shadowBlur`.** Đây là thứ giết hiệu năng Canvas 2D nhanh nhất. Nếu cần bóng, vẽ một hình ellipse mờ bằng gradient đã tạo sẵn.
3. **Cấm `ctx.filter`.** Không dùng blur/glow của canvas. Muốn hiệu ứng phát sáng thì vẽ 2–3 lớp hình đồng tâm alpha giảm dần — nhanh hơn hàng chục lần.
4. **Không tạo gradient/pattern trong vòng lặp khung hình.** Tạo một lần lúc khởi động, dùng lại mãi.
5. **Trần cứng cho hạt.** Vượt 300 hạt thì hạt cũ nhất bị thu hồi, không phải hạt mới bị bỏ. Hạt mới là hạt người xem đang nhìn.

### 5.3. Bậc chất lượng tự động

Đo thời gian khung hình trung bình mỗi 2 giây, tự hạ bậc khi tụt:

| Bậc | Điều kiện | Thay đổi |
|---|---|---|
| **Cao** | ≥ 55 fps | Đầy đủ: 300 hạt, vệt lao, dao động đỉnh, nén giãn |
| **Vừa** | 40–55 fps | 150 hạt, vệt lao giữ, giảm biên độ dao động đỉnh |
| **Thấp** | < 40 fps | 60 hạt, tắt vệt lao, tắt dao động đỉnh, giữ nén giãn và thở |
| **Tối thiểu** | < 25 fps | Tắt hết hiệu ứng, chỉ còn thân bot + lõi + thanh máu |

Quan trọng: **bậc thấp nhất vẫn phải chơi được.** Không có hiệu ứng nào là điều kiện để hiểu trận đấu.

### 5.4. LOD theo tốc độ xem lại

| Tốc độ | Xử lý |
|---|---|
| x0.5 / x1 | Đầy đủ |
| x2 | Giảm hạt còn 50%, tắt nén giãn (quá nhanh để thấy) |
| x4 | Tắt hạt và vệt, chỉ còn thân bot + chớp trắng khi có sát thương |

Ở x4, hiệu ứng đầy đủ không những đắt mà còn **vô nghĩa về mặt cảm nhận** — mắt người không bắt được. Bỏ đi là đúng cả về hiệu năng lẫn thẩm mỹ.

### 5.5. Riêng cho MCP App UI (mốc M4)

Viewer chạy trong khung chat sẽ nhỏ hơn và tài nguyên hạn chế hơn trang web đầy đủ. Không viết viewer thứ hai (`spec_demo.md` mục 25 cấm điều này). Thay vào đó:

- Khởi động ở bậc **Vừa**, để thuật toán tự nâng lên nếu máy đủ khỏe.
- Đặt trần hạt theo **kích thước khung vẽ**, không theo số tuyệt đối.
- Tự động tắt vệt lao khi khung vẽ nhỏ hơn 480px chiều rộng.

---

## 6. Công cụ cho artist — sân chỉnh hiệu ứng

Đây là hạng mục quyết định tốc độ làm mỹ thuật của cả dự án. Nếu artist phải chờ dev build lại mỗi lần chỉnh một con số, tiến độ mỹ thuật sẽ chết trong hai tuần.

**Đề xuất: một trang `/dev/fx` trong chính web game**, chỉ bật ở môi trường phát triển.

| Tính năng | Vì sao cần |
|---|---|
| Nút bắn thử **từng loại sự kiện** | Xem ngay một hiệu ứng mà không phải chạy cả trận để chờ nó xảy ra |
| Thanh trượt cho **mọi hằng số hiệu ứng** | Chỉnh biên độ dao động, độ cứng lò xo, số hạt… thấy kết quả tức thì |
| Thanh tua **từng khung hình** | Dừng đúng khung hình có va chạm, soi kỹ |
| Chế độ **ghi lại** | Ghi một phiên bắn thử → lưu thành tệp mẫu → sau này dùng làm bài kiểm tra tự động |
| Nút **đổi seed** | Kiểm tra hiệu ứng có thật sự tất định không |
| Hiện **thời gian khung hình** theo từng hạng mục | Biết ngay hạt hay vệt đang ăn hết ngân sách |

Mọi hằng số hiệu ứng nằm trong **một tệp cấu hình riêng**, không nằm trong code vẽ. Đúng tinh thần `spec_demo.md` mục 10: *không hard-code balance rải rác*. Ở đây là "không hard-code mỹ thuật rải rác".

---

## 7. Chia việc giữa hai khâu

Bảng này để hai bên không giẫm chân nhau:

| Việc | Ai làm | Ai duyệt |
|---|---|---|
| Định nghĩa kiểu `VfxEvent` | Dev chính | Technical Artist |
| Sinh event log trong engine | Dev | — |
| Bộ điều phối hiệu ứng (VFX Director) | Technical Artist | Dev chính |
| Cảm giác chuyển động (mục 3) | Technical Artist | Designer |
| Danh mục hiệu ứng + hằng số | Technical Artist | Designer |
| Đường vẽ, gộp lệnh, tối ưu | Technical Artist + Dev | Dev chính |
| Bậc chất lượng tự động | Technical Artist | Dev chính |
| Sân thử hiệu ứng `/dev/fx` | Technical Artist | Dev chính |
| Bảng màu + kiểm tra tương phản | Designer + Technical Artist | — |
| **Logic mô phỏng, va chạm, sát thương** | **Dev** | **— Technical Artist không được chạm** |
| Bố cục HUD, chữ, nút bấm | Designer | Designer |

Dòng in đậm là ranh giới cứng. Technical Artist đẹp đến mấy cũng không được sửa một dòng nào trong lõi mô phỏng.

---

## 8. Gắn vào các mốc M1 – M4

| Mốc | Việc mỹ thuật cần làm | Mức độ |
|---|---|---|
| **M1 — Hai bot tự đánh** | Chỉ cần **chế độ vẽ gỡ lỗi**: tam giác tô màu phẳng, lõi khoanh tròn, không hiệu ứng gì. Mục tiêu là *nhìn thấy mô phỏng đúng*, không phải nhìn cho đẹp. **Không tốn công mỹ thuật ở mốc này.** | Rất nhẹ |
| **M1.5 — Dựng nền mỹ thuật** | Chốt hợp đồng `VfxEvent`. Dựng bộ điều phối hiệu ứng, bảng màu, đường vẽ gộp lệnh, sân thử `/dev/fx`. **Đây là mốc quan trọng nhất về kỹ thuật mỹ thuật** — làm sai ở đây thì M2 rất đau. | Nặng |
| **M2 — Chơi trên web** | Đây là mốc mỹ thuật thật: bảy kỹ thuật ở mục 3, danh mục hiệu ứng đầy đủ, bản đồ sát thương, chớp sáng tam giác vừa bị phá, bậc chất lượng tự động. Điều kiện nghiệm thu: người xem mô tả được trận đấu bằng lời mà không cần nhìn số liệu. | Rất nặng |
| **M3 — Demo dùng AI** | Không thêm gì mới về mỹ thuật. Chỉ cần rà lại `agent.md` để chắc chắn **AI không phải hiểu gì về mỹ thuật** vẫn tạo được bot hợp lệ. | Nhẹ |
| **M4 — Replay trong chat** | Hạ bậc chất lượng cho khung chat, kiểm tra viewer chạy được trong không gian nhỏ. Không viết lại. | Vừa |

---

## 9. Bốn chỗ hở đã bù — và những gì còn lại

### 9.1. Trạng thái bốn chỗ hở

| # | Chỗ hở | Nguồn phát hiện | Đã bù ở |
|---|---|---|---|
| 1 | Vùng thu hẹp chống câu giờ không có thông số lẫn mô tả hình ảnh | `can_bang.md` 8.2 | **Mục 4.7** |
| 2 | Bản đồ sát thương không nói cách vẽ, cũng không nói lấy dữ liệu từ đâu | `spec_demo.md` 19 | **Mục 4.6** |
| 3 | Mất liên thông / mảnh tách rời không có mô tả thị giác | `spec_demo.md` 8, `gameplay.md` 5.5 | **Mục 4.8** |
| 4 | "Hai bot phân biệt rõ bằng visual identity" quá mơ hồ để dev làm theo | `spec_demo.md` 20 | **Mục 4.2 – 4.3** |

### 9.2. Phát hiện thêm khi bù — cần dev quyết

**(a) `PLAN.md` và `can_bang.md` đang mâu thuẫn về máu và sát thương. — ✅ ĐÃ XỬ LÝ**

| | `PLAN.md` mục 2 (bản cũ) | `can_bang.md` |
|---|---|---|
| Máu mỗi tam giác | 100, đồng nhất | Búa 70 · Kéo 105 · Bao 168 · Motor 80 |
| Sát thương tiếp xúc | lợi thế 20 · bất lợi 5 · cùng loại 10 | nền 24 / 16 / 10 × hệ số 2.0 / 1.0 / 0.5 |

Hai bộ số này không thể cùng đúng. Đã chốt `can_bang.md` là nguồn đúng và sửa bảng ở `PLAN.md` mục 2 cho khớp, kèm một dòng ghi rõ `can_bang.md` là nguồn sự thật. **Chỗ hở này đóng rồi.**

Việc này ngoài phạm vi mỹ thuật, nhưng nó sẽ cắn khâu mỹ thuật ngay khi làm hiệu ứng — vì mọi hiệu ứng sát thương đều lấy tỉ lệ từ hai bộ số này.

**(b) Câu hỏi chặn đường, cần chốt trước M1.5:** sim chạy 30 nhịp/giây, màn hình 60–120 Hz. **Nội suy ở mục 3.1 là bắt buộc, không phải tùy chọn.** Nếu không làm, hình sẽ giật và toàn bộ mục 3 đổ sông đổ biển. Đây là việc của dev, nhưng nó chặn đường mỹ thuật.

**(c) Bán kính vòng thu hẹp cần một nguồn sự thật duy nhất.** Nếu lớp vẽ tự tính bán kính từ `tick` (mục 4.7) mà lõi mô phỏng cũng tự tính riêng, hai bên lệch nhau một hằng số là người xem thấy lõi mất máu khi vẫn còn nằm trong vòng. Đề nghị: hằng số nằm trong `ruleset`, cả hai bên đọc chung, và có một bài kiểm tra so khớp.

**(d) Bản đồ sát thương cần engine đếm thêm một thứ.** Mục 4.6 yêu cầu `damageReceived` cho từng tam giác. Đây là **một trường mới trong checkpoint của replay**, không phải thứ có sẵn. Dev cần xác nhận trước M2, nếu không thì tính năng này không làm được.

### 9.3. Đợt rà soát lỗ hổng cân bằng — ảnh hưởng tới lớp mỹ thuật

Rà soát đợt 2 (xem `ra_soat_can_bang.md`) sửa 4 lỗ hổng có đụng tới khâu vẽ. Ghi lại đây để lớp mỹ thuật không vẽ sai:

| Thay đổi trong mô phỏng | Lớp vẽ phải làm gì |
|---|---|
| **Sát thương vòng thu hẹp đổi từ "2 máu cố định" sang "1.5% máu tối đa" mỗi nhịp** | Máu chảy ở vòng lõi phải tính theo **tỉ lệ**, không theo số tuyệt đối. Nếu vẽ theo số tuyệt đối, lõi Bao sẽ trông như mất máu chậm hơn hẳn lõi Búa — trong khi thời gian ân hạn thật của hai bên đã bằng nhau. Xem mục 4.7 |
| **Cộng hưởng đa dạng giờ tính lại khi cấu trúc thay đổi** (trước đây tính một lần lúc khóa gói) | **Máu tối đa của từng tam giác có thể tụt giữa trận.** Cung tròn máu ở lõi và thanh máu tam giác phải cập nhật theo giá trị mới. Cân nhắc thêm một hiệu ứng nhỏ báo "mất cộng hưởng" khi một cụm bị phá vỡ cấu trúc — đây là thông tin chiến thuật thật, không chỉ là trang trí |
| **Hệ số tải hiệu dụng lấy `max()` với hệ số lúc khóa gói** | Bot **không bao giờ chạy nhanh hơn** nhờ bị đánh gãy. Bảng trạng thái cơ thể → dáng vẻ ở mục 3.7 giữ nguyên hiệu lực: bị thương thì chỉ có chậm đi hoặc giữ nguyên, không bao giờ nhanh lên. Nếu thấy bot khựng lại rồi vọt lên, đó là bug mô phỏng, không phải hiệu ứng |
| **Cooldown 6 nhịp giờ tính theo tam giác phòng thủ, không theo cặp** | Một tam giác **không còn ăn 3 hit trong cùng một nhịp**. Số sự kiện `hit` mỗi nhịp giảm mạnh so với thiết kế cũ — ngân sách hạt ở mục 5.1 rộng rãi hơn dự kiến. Đổi lại, hiệu ứng "kẹp nhiều mặt" không còn cần thiết kế riêng |

**Một ghi chú về Core:** luật mới cấm đặt Core trên Motor (`can_bang.md` mục 6.6). Nếu lớp vẽ có mã riêng để tô màu Motor theo đội, không cần sửa — nhưng đừng viết mã giả định "lõi luôn có thể nằm trên bất kỳ loại tam giác nào".

---

## 10. Checklist nghiệm thu mỹ thuật

**Về cảm giác (`spec_demo.md` mục 37):**
- [ ] Tắt hết hiệu ứng, chỉ còn thân bot — vẫn thấy chuyển động có khối lượng
- [ ] Người xem đoán được con nào đang thắng chỉ bằng mắt, không nhìn thanh máu
- [ ] Khoảnh khắc bot bị bẻ Motor trông **đau** — thấy rõ nó khựng lại và chệch hướng
- [ ] Khoảnh khắc quá tải trông như một con vật gục, không phải một con số giảm

**Về đọc hiểu:**
- [ ] Phân biệt được 4 loại tam giác khi in đen trắng (nhờ hoa văn + độ dày nét)
- [ ] Phân biệt được 2 đội khi in đen trắng (nhờ huy hiệu lõi + vị trí, **không** nhờ màu)
- [ ] Mọi màu đạt tương phản ≥ 3:1 với nền trắng
- [ ] Lõi là thứ dễ thấy nhất trên sân
- [ ] Không có chỗ nào trong game, HUD, danh sách sự kiện hay bảng kết quả đảo thứ tự hai đội

**Về bốn chỗ hở vừa bù (mục 4.6 – 4.8):**
- [ ] Bật bản đồ sát thương → vẫn đọc được đội và loại qua viền, không bị vô hiệu hóa
- [ ] Bản đồ sát thương nóng dần khi tua, và ba tam giác nóng nhất hiện đúng
- [ ] Vòng thu hẹp hiện dần 1.5 giây trước khi thu, **không bật đột ngột**
- [ ] Lõi ở ngoài vòng → thấy rõ nháy đỏ **và** đường chỉ hướng quay vào
- [ ] Mảnh tách rời **đứng yên tại chỗ** ngay khi đứt, không trôi theo thân bot
- [ ] Mảnh tách rời đổi sang xám, mất hết màu đội
- [ ] Cụm Motor bị tách rời → có tín hiệu "mất chân" riêng, thân chính nghiêng hẳn
- [ ] Một nhịp có từ 3 mảnh vỡ trở lên → màn hình vẫn không rối, không vượt trần 40% hạt

**Về các thay đổi từ đợt rà soát cân bằng (mục 9.3):**
- [ ] Máu chảy ở vòng lõi tính theo **tỉ lệ** — lõi Búa và lõi Bao trông có cùng tốc độ mất máu tương đối
- [ ] Khi một cụm bị phá vỡ làm mất cộng hưởng, **máu tối đa của tam giác cập nhật đúng** — cung tròn máu không hiển thị quá 100% hoặc âm
- [ ] Bot bị đánh gãy thân **không bao giờ chạy nhanh hơn** lúc đầu trận (nếu thấy, đó là bug mô phỏng)
- [ ] Số sự kiện `hit` mỗi nhịp không vượt số tam giác tiếp xúc — xác nhận cooldown theo tam giác phòng thủ đã có hiệu lực

**Về tất định:**
- [ ] Xem lại cùng một replay hai lần cho ra **hình ảnh y hệt**, kể cả hạt
- [ ] Không có `Math.random()` nào trong toàn bộ đường vẽ
- [ ] Tắt toàn bộ lớp mỹ thuật → kết quả trận **không đổi một đơn vị nào**
- [ ] Bán kính vòng do lớp vẽ tự tính **khớp** với bán kính lõi mô phỏng dùng (mục 9.2c)

**Về hiệu năng:**
- [ ] 60 fps trên máy phổ thông ở 1080p, có hiệu ứng đầy đủ
- [ ] Bậc Tối thiểu vẫn chơi và hiểu được trận
- [ ] Không có `shadowBlur` hay `ctx.filter` trong mã nguồn
- [ ] Số lệnh tô mỗi khung hình không phụ thuộc số tam giác (đã gộp theo kiểu)
