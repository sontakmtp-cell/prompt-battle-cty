# PROMPT CHIẾN — MÔ TẢ GAMEPLAY CHI TIẾT

> **Design with AI. Fight with code.**
>
> *Mày nghĩ ra một con thú. AI đẽo nó thành hình học. Rồi thả nó vào đấu trường, và nó tự lo phần còn lại.*

---

## 0. Một câu để hiểu cả game

Trong hầu hết game đối kháng, mày **cầm tay lái** — bấm nút, né, đánh. Ở đây thì khác.

Mày là **kiến trúc sư**, không phải tay đua. Mày quyết định con bot của mày **trông như thế nào, gắn vũ khí ở đâu, não nó nghĩ gì** — rồi ký hợp đồng. Khi trận bắt đầu, mày **buông tay**. Con bot tự bò, tự tìm địch, tự chọn mặt để đâm, tự biết lúc nào nên liều lúc nào nên lùi.

Mày thắng vì **mày đã nghĩ đúng trước khi trận bắt đầu**, không phải vì mày bấm nhanh hơn. Và nếu thua, mày xem lại băng ghi hình, thấy con bot của mình ngu ở chỗ nào, sửa, rồi quay lại. Đây là game của **thiết kế và tinh chỉnh**, chứ không phải của phản xạ.

---

## 1. Mày là ai trong câu chuyện này

Mày vào vai **"người nuôi sinh vật chiến đấu"**. Con bot của mày không phải một cỗ máy kim loại cứng nhắc — nó là **một sinh vật sống được ghép từ chất lỏng hình học**. Trắng, phẳng, uốn éo, di chuyển như có sức sống. Nhìn nó bò qua đấu trường giống như nhìn một giọt thủy ngân biết suy nghĩ hơn là nhìn một cái xe tăng.

Và mày không làm việc một mình. **AI là xưởng trưởng của mày.** Mày nói bằng tiếng người — "tao muốn con này giống cái mũi tên, đầu gắn búa, hai cánh gắn kéo" — AI lo phần biến nó thành một cấu trúc hình học hợp lệ, gắn đúng loại tam giác vào đúng ô, và viết cho nó một bộ não chiến thuật. Mày duyệt, AI sửa, mày duyệt lại.

> Ba vai trong vở kịch này: **Mày nghĩ ý tưởng — AI đẽo hình và viết não — Server trọng tài công bằng.**

---

## 2. Vòng lặp gameplay — nhịp thở của cả trò chơi

Cả game xoay quanh một vòng lặp. Một vòng hoàn chỉnh gồm **bốn mùa**:

```
   ①  NGHĨ          →   ②  ĐẺO & LUYỆN     →   ③  CHIẾN     →   ④  MỔ XẺ
   Ý tưởng,              AI dựng bot,           Hai bot tự       Xem lại băng,
   hình dung,            validate, simulate     đánh nhau        hiểu vì sao thua
   trò chuyện với AI     trong sandbox          trên server      → quay về ①
        ↑                                                              │
        └──────────────────────────────────────────────────────────────┘
```

Điểm mấu chốt: **vòng lặp không kết thúc ở trận đấu.** Trận đấu chỉ là *bài kiểm tra*. Giá trị thật nằm ở chỗ mày học được gì từ nó. Một trận thua được mổ xẻ đúng cách còn quý hơn một trận thắng không hiểu vì sao thắng.

Mỗi vòng lặp mày sẽ ra một **phiên bản bot mới** — như nuôi một sinh vật, nó lớn lên, mọc thêm gai, mất đi cái đuôi vô dụng, đổi tính nết. Con bot của mày có **lịch sử tiến hóa**, và đó là phần thú vị nhất của trò chơi.

---

## 3. MÙA ① — NGHĨ: từ ý tưởng mơ hồ tới bản thiết kế

### 3.1. Mọi thứ bắt đầu từ một câu nói

Mày không cần biết code. Mày chỉ cần biết **mày muốn con bot trông thế nào và hành xử ra sao**. Ví dụ mày nói với AI:

> *"Tạo cho tao một con hình mũi tên. Đầu nhọn gắn Búa để đâm trực diện. Hai bên cánh gắn Kéo để vòng sườn. Bao thì rải quanh lõi cho chắc. Motor dồn hết ra sau cho nó lao mạnh. Test thử, nếu nó xoay chậm quá thì sửa."*

AI nghe, rồi biến câu đó thành một **gói bot** (Bot Package) — một tập hợp gồm: hình dạng (Body), lõi (Core), cách bày tam giác (layout), và bộ não (Brain).

### 3.2. Ngân sách hình học — luật chơi công bằng nhất

Đây là khái niệm quan trọng nhất mày phải nắm:

> **Mọi người chơi đều có cùng một ngân sách. Không ai mua thêm.**

Ngân sách tính bằng **số tam giác** mày được phép dùng. Bản đầu tiên: **tối đa 60 tam giác**. Mỗi tam giác mày đặt vào con bot là một ô trong ngân sách đó. Đặt hết là hết — không thêm được.

Vì sao điều này hay? Vì nó biến game thành bài toán **đánh đổi**, không phải bài toán **ai giàu hơn**:

- **45 tam giác chiến đấu + 15 Motor** → cân bằng, vừa đủ sức kéo, chạy 100% tốc độ.
- **55 chiến đấu + 5 Motor** → một cục thịt khổng lồ, đánh đau, nhưng **quá tải nặng — gần như đứng yên**.
- **30 chiến đấu + 30 Motor** → con báo, **chạy 115% tốc độ** — nhanh nhất game, nhưng chỉ có một nửa lực chiến đấu và cụm Motor giòn.

Và đây là chỗ **tải trọng của Motor** (mục 3.4.1) bước vào: không phải cứ gắn Motor là chạy nhanh. **Mỗi Motor chỉ kéo được một số tam giác hữu hạn** — nên ba ví dụ trên không chỉ là "cảm giác", mà là kết quả của một phép chia cụ thể.

> **Chú ý về con "30 + 30":** nó nhanh hơn con "45 + 15" đúng **15%**, đổi lại ít hơn **33% tam giác chiến đấu**. Đó là một sự đánh đổi thật — không phải một lựa chọn vô nghĩa. Nhưng đừng gắn Motor quá tay: từ hệ số tải 1.0 trở lên, mỗi Motor thêm vào bắt đầu **có hại** (tốn ngân sách mà không thêm tốc độ).

**Cùng 60 viên gạch, hai người có thể xây ra hai sinh vật hoàn toàn khác nhau.** Đó là lời hứa cốt lõi của game: công bằng về tài nguyên, tự do về ý tưởng.

### 3.3. Ngữ pháp bố trí — vị trí quan trọng hơn số lượng

Đây là chỗ game có **chiều sâu thật sự**. Không phải cứ gắn nhiều Búa là mạnh. **Gắn ở đâu mới là chuyện.**

Mày phải nghĩ về **hình học như một cơ thể**:

| Mày đặt gì | Ở đâu | Nó có nghĩa gì trong trận |
|---|---|---|
| **Búa** | Phía trước, thành mũi nhọn | Mạnh khi đâm thẳng vào mặt địch |
| **Kéo** | Hai bên cánh | Lợi khi vòng ra sườn, đánh ngang hông |
| **Bao** | Bao quanh lõi | Tấm khiên chống lại Búa của địch |
| **Motor** | Dồn phía sau | Tăng lực lao tới |
| **Motor** | Hai bên đối xứng | Tăng khả năng xoay, quay tại chỗ |
| **Motor** | Lệch một bên | Con bot có xu hướng **quay lệch** — vừa hại vừa có thể thành mẹo |
| **Motor** | Rải thành nhiều cụm đều khắp thân | Chia tải trọng, mất một cụm vẫn còn kéo nổi thân — nhưng mỗi cụm yếu hơn |

Và đây là phần đẹp nhất: **vị trí không chỉ là con số lúc thiết kế — nó là số phận trong trận đấu.** Nếu địch bẻ gãy **cụm Motor bên trái** của mày, từ tick tiếp theo con bot của mày **mất khả năng rẽ trái**, nó bắt đầu bò xiêu vẹo, mất thăng bằng, và cả chiến thuật sụp đổ. Hình học là **cơ thể**, và cơ thể bị thương thì **hành vi đổi theo**.

### 3.4. Bốn loại viên gạch — bốn chức năng

Toàn bộ con bot được ghép từ **bốn loại tam giác**. Ba loại đánh nhau theo luật **Búa – Bao – Kéo** kinh điển, một loại chỉ để di chuyển.

**🔨 Búa (Hammer)** — Thắng Kéo.
- Vai trò: đầu công phá, mũi giáo, vùng lao trực diện.
- Tâm lý: hung hăng, thích đâm thẳng.

**✂️ Kéo (Scissor)** — Thắng Bao.
- Vai trò: cánh, đánh sườn, cấu trúc cơ động.
- Tâm lý: lắt léo, thích vòng ra sau lưng.

**📄 Bao (Paper)** — Thắng Búa.
- Vai trò: khiên, lớp phòng thủ, chống công phá trực diện.
- Tâm lý: trầm, thủ, chờ địch sơ hở.

**⚙️ Motor (Tam giác di chuyển)** — Không thuộc vòng khắc chế, **không gây sát thương**.
- Vai trò: tiến, lùi, xoay, đổi hướng, tăng tốc.
- Đặc biệt: Motor **nhận sát thương** từ tam giác chiến đấu (nên nó cũng là mục tiêu để bẻ gãy khả năng vận động của địch).
- **Quan trọng nhất:** mỗi Motor chỉ **kéo được một số lượng tam giác giới hạn** — gọi là **Tải trọng**. Đây là luật tao mô tả riêng ở mục 3.4.1 ngay dưới, vì nó thay đổi toàn bộ cách mày cân bot.

---

### 3.4.1. Tải trọng — mỗi Motor kéo được bao nhiêu thân?

Đây là luật làm cho chuyện "dồn bao nhiêu Motor" trở nên **thật sự có ý nghĩa**.

> **Mỗi Motor chỉ có thể kéo theo một số tam giác hữu hạn. Thân bot càng nặng (càng nhiều tam giác) thì càng cần nhiều Motor để kéo nổi. Không đủ Motor → con bot bị quá tải, bò ì ạch, thậm chí đứng chết một chỗ.**

Hãy tưởng tượng Motor như **cơ bắp của một con vật**. Một con voi cần bốn cái chân to khỏe. Nếu mày nhét cả bộ xương voi lên hai cái chân chuột, nó không chạy nổi — nó sụp. Game mô phỏng đúng cái đó bằng một phép chia đơn giản.

#### Cách tính — chỉ có một phép chia

```text
SỨC KÉO   = số Motor còn sống × TẢI MỖI MOTOR   (mặc định: 4 tam giác)
TẢI THÂN  = tổng số tam giác còn sống của bot
HỆ SỐ TẢI = TẢI THÂN ÷ SỨC KÉO

HỆ SỐ TẢI HIỆU DỤNG = max( HỆ SỐ TẢI hiện tại , HỆ SỐ TẢI lúc khóa gói )
```

> ⚠️ **Dòng `max()` cuối cùng là bắt buộc, đừng bỏ.** Không có nó, con bot **nhẹ đi khi bị đánh gãy** → bớt quá tải → **chạy nhanh hơn**. Ví dụ một con bot 55 combat + 5 Motor (hệ số 3.0, gần như đứng yên) mà mất 40 tam giác chiến đấu thì hệ số tụt còn 1.0 — **từ 15% tốc độ vọt lên 100%**, tức là mất 2/3 cơ thể lại chạy nhanh gấp 6 lần. Nghe vô lý, và nó vô lý thật.
>
> Với `max()`: **một khi đã quá tải thì không tự giải phóng.** Bot vẫn có thể chậm đi khi mất Motor, nhưng **không bao giờ nhanh lên** nhờ bị đánh.

Rồi tra vào bảng này để biết con bot chạy được bao nhanh:

| Hệ số tải | Con bot cảm giác thế nào | Tốc độ & xoay |
|---|---|---|
| **≤ 0.50** (dư sức kéo nặng) | Nhẹ như lông, lao vun vút | **115%** — nhanh nhất |
| **0.50 – 1.00** | Vừa đủ sức, chạy thoăn thoắt | **100%** |
| **1.00 – 1.50** | Bắt đầu ì, như mang ba lô | Giảm dần còn **~70%** |
| **1.50 – 2.00** | Nặng trịch, bò lết | Còn **~40%** |
| **> 2.00** | Quá tải hoàn toàn | **~15% hoặc đứng chết** — thành pháo đài bất động |

*(Tất cả con số trên là giá trị khởi điểm để cân bằng, nằm trong `ruleset` chứ không phải chân lý cứng.)*

**Băng 115% là có chủ ý.** Nếu mọi mức từ 0.5 đến 1.0 đều cho 100% tốc độ, thì con "30 combat + 30 Motor" (hệ số 0.5) và con "45 combat + 15 Motor" (hệ số 1.0) **chạy nhanh y hệt nhau** — nghĩa là con báo hy sinh 15 tam giác chiến đấu để đổi lấy **đúng 0% tốc độ**. Không ai chọn nó, và cả trường phái cơ động biến mất khỏi game. Băng 115% trả lại lý do tồn tại cho nó: **nhanh hơn 15%, đổi lấy ít hơn 33% lực chiến đấu.**

**Và đây là lợi ích thứ hai của dư Motor — khả năng chịu mất chân.** Vì sức kéo tính theo số Motor **còn sống**, bot nhiều Motor bền hơn hẳn khi bị bẻ chân:

| Bot | Mất bao nhiêu Motor thì bắt đầu tụt dưới 100% tốc độ | Mất bao nhiêu thì đứng yên hẳn |
|---|---|---|
| 15 Motor | **1** (còn 14 → hệ số 1.05) | 15 (mất hết) |
| 20 Motor | **7** (còn 13 → hệ số 1.02) | 20 (mất hết) |
| 30 Motor | **21** (còn 9 → hệ số 1.08) | 30 (mất hết) |

Con "30 + 30" có thể mất **21 trong 30 Motor** — tức 70% cơ bắp — mà vẫn giữ nguyên tốc độ tối đa. Con "45 + 15" mất **một cái** là đã bắt đầu ì. Đây là lý do thật sự để dồn nhiều Motor — không phải để nhanh hơn, mà để **khó bị bẻ chân hơn**.

*(Vì sao con số lại lớn đến vậy: khi mất Motor, cả sức kéo **và** tải thân cùng giảm. Mất 1 Motor mất 4 sức kéo nhưng chỉ mất 1 tải thân — nên phải mất một tỉ lệ lớn Motor mới đủ để hệ số tải vượt 1.0.)*

#### Nó đổi cách chơi như thế nào — nhìn lại ba ví dụ cũ

Ba ví dụ ngân sách ở mục 3.2 giờ **có lý do rõ ràng** đằng sau, chứ không chỉ là cảm giác:

| Thiết kế | Sức kéo | Tải thân | Hệ số | Kết quả thật |
|---|---|---|---|---|
| **45 chiến đấu + 15 Motor** | 15 × 4 = **60** | 60 | **1.00** | Vừa đủ — cân bằng, chạy 100% tốc độ |
| **55 chiến đấu + 5 Motor** | 5 × 4 = **20** | 60 | **3.00** | **Quá tải nặng** — gần như đứng yên, thành cục thịt ngồi chờ |
| **30 chiến đấu + 30 Motor** | 30 × 4 = **120** | 60 | **0.50** | Dư sức — chạy **115%**, cực cơ động |

Mày thấy chưa? Con "55 + 5" không chỉ *chậm* — nó **gần như bất động**. Còn con "30 + 30" **dư sức kéo**, nên nó chạy **nhanh hơn 15%** so với mọi bot ở mức cân bằng. Đây là lý do thật sự khiến ngân sách Motor trở thành một quyết định sinh tử.

#### Tải trọng tạo ra bốn bài toán mới

**1. Mày không thể vừa "to" vừa "nhanh" miễn phí.**
Muốn mang 55 tam giác chiến đấu? Mày buộc phải **hy sinh** ít nhất ~14 Motor chỉ để kéo nổi cái thân đó — và ngân sách chỉ có 60. Toán học không cho mày ăn cả hai.

**2. Con bot có thể bị "quá tải giữa trận" — và đó là một cú twist tuyệt đẹp.**
Đây là phần tao thích nhất. Con bot của mày có thể **chạy bình thường lúc đầu**, rồi địch bẻ gãy vài Motor → **sức kéo tụt xuống ngay ở nhịp kế tiếp** → đột nhiên con bot **trở nên quá tải** dù thân nó chưa mất bao nhiêu. Nó không chỉ mất vài điểm tốc độ — nó **rơi hẳn xuống một bậc** trong bảng trên. Một con bot đang lao tới hùng hổ bỗng khựng lại, bò lết như bị bó chân. Mày xem replay sẽ thấy rõ khoảnh khắc đó — và nó đau như xem một con vật bị què.

**3. Vị trí Motor vẫn quan trọng — nhưng giờ có thêm tầng "chia tải".**
Vì tải trọng tính theo **số Motor còn sống**, nên cách bố trí ảnh hưởng đến việc con bot **sống sót về vận động** ra sao:
- **Dồn hết Motor vào một cụm** → một cú đánh trúng cụm đó là mày mất gần hết sức kéo cùng lúc → sụp đổ tức thì.
- **Rải Motor thành nhiều cụm đều khắp thân** → mất một cụm chỉ mất một phần sức kéo, con bot vẫn lết được → **chịu đòn dai hơn**.

Đổi lại, rải Motor khắp thân thì chúng **lộ ra nhiều hơn** và **tốn chỗ** đáng lẽ để gắn Búa/Bao/Kéo. Lại là một sự đánh đổi nữa — đúng tinh thần của game.

**4. Motor là mục tiêu béo bở — và đây là điều mày phải nhớ nhất khi thiết kế.**

Đánh vào Motor là **giao dịch một chiều hoàn hảo**: mọi loại tam giác đánh vào Motor đều ăn **×1.0** (không bị khắc chế), mà Motor **không gây sát thương trở lại** (sát thương nền = 0). Nghĩa là mày **không bao giờ bị đánh trả** khi đâm vào Motor của địch.

Mà phần thưởng thì khổng lồ. Nhìn lại bảng ở mục 3.4.1 cho một bot 45 combat + 15 Motor:

| Địch phá được | Máu mày mất | Motor còn | Tốc độ của mày |
|---|---|---|---|
| 3 Motor | 240 (3,8% tổng máu) | 12 Motor | ~89% |
| 5 Motor | 400 (6,3%) | 10 Motor | ~78% |
| **8 Motor** | **640 (10,1%)** | **7 Motor** | **~49%** |
| 11 Motor | 880 (13,9%) | 4 Motor | ~15% |

**Mất 10% máu đổi lấy 51% tốc độ.** Cùng 640 máu đó nếu đánh vào tam giác chiến đấu thì chỉ phá được ~5 tam giác — tức mất ~12% lực chiến đấu. Đòn bẩy nghiêng hẳn về phía Motor.

Hệ quả chiến thuật:

- **Giấu Motor đi.** Đừng để cụm Motor lộ ra ở rìa thân — đó là mời địch bẻ chân.
- **Đừng dồn hết Motor vào một cụm.** Một cú đánh trúng cụm là mất gần hết sức kéo cùng lúc.
- **Nếu mày chơi Búa, mày là thợ săn Motor giỏi nhất.** Búa gây 24 sát thương vào Motor — phá 1 Motor trong 4 nhát. Kéo cần 5, Bao cần 8. Nếu meta nghiêng về "bẻ chân trước, giết lõi sau", Búa là loại dẫn đầu.

> **Tóm gọn:** Tải trọng biến Motor từ "bình xăng" thành **cơ bắp thật sự**. Mày không hỏi "gắn bao nhiêu Motor cho đẹp" nữa — mày hỏi **"bao nhiêu cơ bắp mới đủ vác cái thân này, và bố trí sao cho khi bị đánh gãy vẫn còn đủ sức mà bò?"**

### 3.5. Core — trái tim, và cũng là tử huyệt

Mỗi bot có **đúng một Core**. Nó nằm trên một tam giác, phải thuộc phần thân chính, không được tách rời. Và:

> **Core bị phá → bot thua ngay lập tức. Không cần đánh tiếp.**

**Một luật nhỏ nhưng quan trọng: Core không được đặt trên Motor.** Nó phải nằm trên một tam giác **chiến đấu** (Búa / Kéo / Bao).

Vì sao? Nhớ lại ở mục 3.4: Motor **không nằm trong vòng khắc chế** — mọi loại đánh vào Motor đều là ×1.0 như nhau. Nếu lõi nằm trên Motor, nó sẽ **miễn nhiễm khắc chế** — địch không thể chọn loại quân để khắc lõi, trong khi lõi đặt trên Búa thì sợ Kéo, lõi trên Bao thì sợ Kéo, lõi trên Kéo thì sợ Búa. Cộng thêm Motor có 80 máu (nhiều hơn Búa 70), lõi-Motor trở thành **vị trí lõi tốt nhì trong game** — mà tốt một cách không ai thiết kế, chỉ do một hệ số tình cờ.

Vậy nên: **muốn chọn lõi thì chọn giữa ba loại chiến đấu, và chấp nhận điểm yếu của loại đó.** Búa lõi thì giòn, Bao lõi thì sợ Kéo, Kéo lõi thì bị Búa đâm. Không có lựa chọn nào miễn phí.

Core tạo ra bài toán chiến thuật đẹp nhất của game: mày vừa phải **giấu và bọc lõi cho kỹ**, vừa phải **giữ cấu trúc đủ linh hoạt để tấn công**. Bọc lõi quá kỹ → con bot thành cái khiên biết bò, không đánh được ai. Để lõi trần → địch chọc một nhát là xong. Cân bằng giữa "thủ lõi" và "tấn công" chính là trái tim của nghệ thuật thiết kế bot.

### 3.6. Bộ não (Brain) — linh hồn nằm ở đây

Hai người có thể có **hình dạng y hệt nhau** nhưng bộ não khác nhau, và cho ra hai con bot **chiến đấu như hai loài khác nhau**. Đây là lời hứa số 5 của game.

Bộ não quyết định con bot:
- làm sao **tìm** địch,
- làm sao **tiếp cận**,
- khi nào **né**,
- khi nào **xoay** để đưa mặt có lợi vào va chạm,
- khi nào **rút lui**,
- khi nào **phản công**,
- và **đổi tính nết khi mất một phần cơ thể** (mất cánh → đánh kiểu khác; mất motor → co cụm thủ).

Bộ não không được truy cập mạng, không được đọc file hệ thống, không được gọi AI trong trận. Nó chỉ có một bộ lệnh giới hạn (nhìn, di chuyển, xoay, đọc trạng thái) và một ngân sách xử lý mỗi nhịp. Nghĩ quá lâu, vượt giới hạn → hành động nhịp đó bị bỏ, và vi phạm liên tục thì thua theo luật công khai.

**Điểm thú vị:** trong game này không có nút "Đánh". Con bot **chiến đấu bằng cách điều khiển chính cơ thể mình để tạo va chạm**. Muốn đánh thì phải *đâm cái mặt Búa của mình vào con địch*. Vũ khí chính là **hình dạng** — và đó là lý do hình dạng là gameplay.

---

## 4. MÙA ② — ĐẺO & LUYỆN: kiểm tra trước khi ra trận

Trước khi con bot của mày được phép bước vào đấu trường chính thức, nó phải qua **cửa kiểm duyệt**:

```
Ý TƯỞNG  →  AI DỰNG BOT  →  [KIỂM TRA SCHEMA]
                                    ↓
                            [KIỂM TRA HÌNH HỌC]
                                    ↓
                            [KIỂM TRA BỘ NÃO]
                                    ↓
                            [CHẠY SANDBOX]
                                    ↓
                                  ĐẠT  →  KHÓA GÓI BOT  →  SẴN SÀNG CHIẾN
```

### 4.1. Kiểm tra hình học — không cho phép xây nhà trên cát

Máy sẽ soi con bot của mày và loại bỏ mọi thứ gian lận hoặc vô nghĩa:
- tổng số tam giác không vượt ngân sách,
- mọi tam giác phải nằm trên **lưới chuẩn** (không đặt bừa),
- không chồng chéo bất hợp pháp,
- không có tam giác tí hon hay vật cản dị dạng để lợi dụng lỗi va chạm,
- con bot không vượt kích thước tối đa,
- **cấu trúc chính phải liên thông** (không có bộ phận lơ lửng vô chủ),
- Core hợp lệ — **và Core phải nằm trên tam giác chiến đấu, không được trên Motor** (mục 3.5); Motor hợp lệ,
- **đủ sức kéo** — nếu tổng tải vượt sức kéo của Motor (bot quá tải), máy sẽ **cảnh báo rõ**: con bot này sẽ bò rất chậm hoặc đứng yên (không chặn, nhưng cảnh báo để mày biết mình đang tự bắn vào chân),
- **có khả năng chiến đấu** — nếu số tam giác chiến đấu dưới 5, máy **cảnh báo**: bot này sẽ bị xử thua sau 10 giây vì không tạo được hành động chiến đấu hữu ích. Đây là lưới an toàn cho trường hợp mày dồn gần hết ngân sách vào Motor.

### 4.2. Sandbox — sân tập trước khi ra chiến trường

Đây là chỗ mày "thử xe". Sandbox cho con bot của mày đánh với **một con bù nhìn đứng im** để xem nó có làm được những việc tối thiểu không:

1. Có tìm thấy địch không?
2. Có di chuyển được không?
3. Có **tiếp cận** được không?
4. Có **tạo được va chạm chiến đấu** không?

Nếu con bot đứng ì một chỗ, hoặc cứ chạy vòng tránh địch mãi — nó **không qua**. Luật game cấm bot **chủ động tránh giao chiến vĩnh viễn** để câu hòa.

> Nhưng đừng hiểu lầm: game **không** bắt mọi bot phải lao thẳng như trâu điên. Né rồi phản công, vòng sườn, giữ khoảng cách ngắn hạn, giả lùi dụ địch — **đều là chiến thuật hợp lệ**. Chỉ cấm cái kiểu "đứng ngoài rìa cả trận cho khỏi thua".

### 4.3. Khóa gói — con bot thành bất biến

Khi đã đạt hết, server **khóa con bot lại** thành một gói bất biến, có **mã băm (hash)** riêng. Từ đó:

- không ai sửa được con bot trong lúc đánh,
- trận đấu ghi lại **chính xác phiên bản bot nào** đã tham chiến,
- băng ghi hình (replay) gắn chặt với đúng phiên bản đó.

Muốn sửa? Phải tạo **phiên bản mới**. Đây chính là cơ chế "nuôi tiến hóa": con bot của mày có dòng dõi, có tổ tiên, có các đời khác nhau.

---

## 5. MÙA ③ — CHIẾN: trận đấu diễn ra như thế nào

### 5.1. Bản chất: mày xem, không can thiệp

Trận đấu là **tự động hoàn toàn**. Người xem thấy nó chạy **liên tục như phim** — con bot bò, xoay, đâm, vỡ vụn. Nhưng bên trong server, mọi thứ chạy theo **nhịp cố định (tick)**, không phải theo thời gian thực đúng nghĩa.

> **Bên ngoài: real-time. Bên trong: từng nhịp cố định.** — đây là nguyên tắc vàng.

Bản đầu chạy **30 nhịp mỗi giây**. Mỗi nhịp là một khung suy nghĩ nhỏ của cả hai con bot.

### 5.2. Một nhịp có chín bước — não bot hoạt động ra sao

Cứ mỗi 1/30 giây, server chạy đúng chín bước:

| Bước | Việc gì xảy ra | Ví như |
|---|---|---|
| **1. SENSE** | Mỗi bot nhận một "ảnh chụp" thế giới quanh nó | Mở mắt nhìn |
| **2. THINK** | Bộ não tính xem nên làm gì từ ảnh đó | Suy nghĩ |
| **3. INTENT** | Server **gom ý định của CẢ HAI** trước khi áp dụng | Hai bên cùng giơ tay |
| **4. MOVE / ROTATE** | Áp dụng di chuyển theo Motor còn sống | Cử động |
| **5. COLLISION** | Tìm xem tam giác nào chạm tam giác nào | Chạm mặt |
| **6. DAMAGE** | Tính sát thương theo luật Búa–Bao–Kéo | Ăn đòn |
| **7. STRUCTURE** | Xóa tam giác chết, tính lại phần nào còn dính lõi | Gãy chi |
| **8. WIN CHECK** | Kiểm tra lõi, khả năng chiến đấu, hết giờ chưa | Trọng tài soi |
| **9. EVENT LOG** | Ghi lại mọi thứ để replay | Camera quay |

**Bước 3 là bước công bằng nhất.** Cả hai bot đều **giơ tay cùng lúc**, rồi server mới xử. Nhờ vậy, con bot nào cũng không bị thiệt chỉ vì "bị xử sau". Không có chuyện Bot A luôn được đánh trước Bot B.

### 5.3. Luật khắc chế — cái băng giấy kéo búa bao sống động

Khi hai tam giác chiến đấu chạm nhau đủ mạnh để tạo "cú đánh":

```
    🔨 Búa   THẮNG   ✂️ Kéo
    ✂️ Kéo   THẮNG   📄 Bao
    📄 Bao   THẮNG   🔨 Búa
```

- Bên **có lợi thế** → gây sát thương **cao**.
- Bên **bất lợi** → gây sát thương **thấp hoặc không gây gì** (tùy cân bằng).
- **Cùng loại** → sát thương ngang nhau, có thể theo lực va chạm.
- **Motor** → không có lợi thế khắc chế nào; nó chỉ để chạy, và **ăn sát thương** khi bị đụng.

Sát thương cuối cùng không phải một con số cố định. Nó là **kết quả của một phép tính**:

```
SÁT THƯƠNG = nền × hệ số loại × hệ số va chạm × hệ số hướng
```

Hai hệ số cuối là chỗ **bộ não của con bot chứng minh giá trị của nó**:

| Hệ số | Phụ thuộc vào cái gì | Khoảng |
|---|---|---|
| **Va chạm** | Mày lao vào địch mạnh cỡ nào | 0.85 (cọ xát) → **1.00** (lao hết tốc lực) |
| **Hướng** | Đỉnh tam giác của mày có chĩa thẳng vào địch không | 0.85 (đâm ngang hông) → **1.00** (đâm vuông mặt) |

Nghĩa là: **đâm mạnh, đâm đúng mặt, đâm đúng góc** thì đau hơn đâm nhẹ hời hợt — cụ thể là **đau hơn tới 38%**. Con bot giỏi là con bot biết **xoay đúng mặt** trước khi va.

Và đây là chỗ thú vị: vì mỗi tam giác chỉ có **một hướng mặt** (hướng cái đỉnh nhọn của nó chĩa tới), nên **một tam giác chỉ đâm vuông mặt được vào địch nằm ở một phía**. Muốn phủ nhiều hướng thì phải **xen tam giác lên và tam giác xuống vào nhau** — đúng lúc chúng cũng đang được thưởng máu nhờ cộng hưởng đa dạng (mục 3.4). Hai cơ chế đẩy về cùng một hướng: **đa dạng thì mạnh**.

> ⚠️ **Nhưng đừng lo:** hai hệ số này **không bao giờ lật được luật Búa–Bao–Kéo**. Đâm hoàn hảo mà bất lợi khắc chế vẫn thua đâm hời hợt mà có lợi thế. Xoay mặt giỏi giúp mày thắng **trong cùng một cặp loại** — không giúp mày phá luật loại.

### 5.4. Đánh nhau thật sự diễn ra thế nào — ví dụ một trận

Hãy tưởng tượng mày thả con **Mũi Giáo** (nhiều Búa trước mặt, Motor sau lưng) vào đấu với con **Cánh Cụp** (Kéo hai bên, thích vòng sườn).

- **Nhịp 0–100:** Hai con bò về phía nhau. Mũi Giáo đi thẳng, hiên ngang. Cánh Cụp **không đâm thẳng** — nó bắt đầu **cong sang bên** để tìm sườn.
- **Nhịp 100:** Mũi Giáo nhận ra địch lệch hướng, xoay đầu Búa để bám theo. Đây là lúc bộ não của hai con đấu trí — con nào xoay khéo hơn, con đó chọn được góc đánh.
- **Nhịp 135:** Chạm! Búa của Mũi Giáo đập trúng một cánh Kéo của Cánh Cụp → **Búa thắng Kéo** → cánh đó vỡ.
- **Nhịp 136:** Server xóa tam giác chết, **kiểm tra lại xem phần còn lại còn dính lõi không**. Phần đứt rời khỏi lõi bị coi là **mảnh tách rời** — mất quyền điều khiển, tan biến sau ít giây hoặc thành mảnh vụn vô hại.
- **Nhịp 170:** Cánh Cụp mất **cụm Motor bên trái** → nó **bắt đầu quay lệch**, không giữ được đường vòng nữa.
- **Nhịp 171:** Ngay lập tức, **sức kéo của Cánh Cụp tụt xuống** — nó rơi vào trạng thái **quá tải** (xem mục 3.4.1). Từ nhịp này nó không chỉ quay lệch, mà còn **bò chậm hẳn đi** như vác thêm đá. Mất một cụm Motor không chỉ lấy đi khả năng rẽ — nó lấy đi **cả tốc độ**, vì số cơ bắp còn lại không đủ vác cái thân.
- **Nhịp 200+:** Bộ não của Cánh Cụp **đổi tính nết** — hết vòng sườn được rồi, nó chuyển sang cò cưa, thủ. Nhưng đã muộn. Mũi Giáo đâm thẳng vào lõi.
- **Hết trận.** Core vỡ → Mũi Giáo thắng.

Điều đáng chú ý: **trận đấu này kể một câu chuyện** — có cao trào, có bước ngoặt, có lúc con này đổi chiến thuật. Đó là thứ game muốn mày thấy.

### 5.5. Phá hủy và mất bộ phận — cơ thể bị thương thì hành vi đổi

Đây là nguyên tắc tạo chiều sâu số 5: **mất bộ phận phải làm bot thay đổi hành vi thật sự**, không chỉ mất vài điểm máu.

Khi một tam giác bị phá:
1. Nó bị loại khỏi cơ thể.
2. Server kiểm tra lại xem phần nào **còn nối với lõi**.
3. Phần **không còn nối** → thành "mảnh tách rời", **mất quyền điều khiển**.
4. Mảnh đó tan biến sau vài giây, hoặc thành **mảnh vụn không gây sát thương** (bản đầu giữ đơn giản, không mô phỏng gãy vỡ phức tạp).

Và hệ quả lên vận động thì tức thì: mất Motor → **sức chạy, sức xoay, khả năng rẽ giảm ngay ở nhịp kế tiếp**. Motor đặt xa tâm đóng góp lực xoay lớn hơn → mất nó thì con bot xoay như đang say.

Đặc biệt, vì có **tải trọng** (mục 3.4.1), mất Motor còn gây một hiệu ứng dây chuyền nặng hơn: **sức kéo tụt → con bot rơi vào trạng thái quá tải → chậm hẳn lại**. Nghĩa là một cú đánh bẻ gãy Motor có thể biến một con bot đang lao tới thành một con bot bò lết, dù phần thân chiến đấu của nó gần như còn nguyên. Đây là kiểu "thắng bằng cách bẻ chân địch" — một lối chơi hoàn toàn hợp lệ.

> Con bot của mày **không phải một khối máu**. Nó là một cơ thể, và nó **tàn phế dần** theo cách có ý nghĩa chiến thuật.

### 5.6. Bốn con đường tới chiến thắng

Theo thứ tự ưu tiên:

1. **Thắng trực tiếp** — phá Core địch. Sạch sẽ nhất.
2. **Địch mất khả năng chiến đấu** — nếu một con mất hết tam giác chiến đấu hoặc hết Motor trong một khoảng thời gian liên tục, nó bị xử thua.
3. **Hết giờ** — server tính điểm bằng **công thức công khai, có trọng số**:
   - **35%** tổng sát thương đã gây,
   - **30%** độ nguyên vẹn của lõi,
   - **20%** số tam giác chiến đấu còn lại,
   - **15%** số Motor còn lại.
   Bằng điểm → **hòa**.

   Sát thương đã gây được đặt nặng nhất là có chủ ý: nó chặn bot **"trâu câu giờ"** — con bot ngồi thủ, lõi còn nguyên, nhưng không đánh được ai thì **thua điểm**. Muốn thắng phải **đánh thật**, không phải **sống lâu**.

   **"Sát thương đã gây" được tính bằng cách so trực tiếp với đối thủ:** bên gây nhiều hơn được **1.0**, bên kia được **tỉ lệ của mình chia cho bên nhiều hơn**. Ví dụ mày gây 2000 còn địch gây 1500 thì mày được 1.0, địch được 0.75. Cả hai cùng gây 0 thì cả hai được 0.

   Cách tính này không cần hằng số nào, luôn nằm trong khoảng 0 đến 1, và không bao giờ chia cho 0 — nên ai cũng kiểm chứng lại được bằng tay. Ba con số còn lại (lõi, tam giác chiến đấu, Motor) đều tính theo **phần trăm còn lại của chính mình**, không so với địch.
4. **Không bao giờ có "trọng tài AI" phán bừa.** Không tiêu chí mơ hồ. Người thắng luôn được xác định bằng luật rõ ràng, ai cũng đọc được.

### 5.7. Cảm giác khi xem một trận

Đây là phần game muốn mày *cảm* được:

> **Mày phải có cảm giác đang nhìn hai sinh vật hình học sống, tự tìm cách giết nhau — chứ không phải hai con sprite chạy theo kịch bản cứng.**

Con bot **trông mềm, uốn éo, hơi giống chất lỏng**, dù cấu trúc nền là hình học. Chuyển động hữu cơ. Khi nó bị thương, mày thấy nó **xiêu vẹo đi** như một con vật què. Khi nó đổi chiến thuật, mày thấy nó **khựng lại, tính toán, rồi bò theo cách khác**. Hai con bot phân biệt rõ bằng màu sắc/nhận diện. Đấu trường trắng tinh, UI tối giản — để mày chỉ tập trung vào **cuộc chiến của hai cơ thể**.

---

## 6. MÙA ④ — MỔ XẺ: biến trận thua thành bài học

### 6.1. Replay — cuốn băng ghi lại cả trận

Mỗi trận đều có **băng ghi hình có thể phát lại chính xác 100%**. Không phải video — mà là **dữ liệu mô phỏng** được dựng lại y như cũ.

Nhờ cơ chế **deterministic** (cùng bot + cùng seed → cùng kết quả), mày có thể chạy lại một trận cũ và thấy **đúng từng nhịp** như lần đầu. Điều này quan trọng cho: chống gian lận, gỡ lỗi, giải đấu, và **cho chính mày học hỏi**.

Băng ghi cho mày:
- **Play / Pause**, thanh thời gian, **tua nhanh/chậm** (x0.5 / x1 / x2 / x4), **seek** tới đoạn bất kỳ,
- trạng thái **máu lõi** và **số tam giác còn lại** của cả hai bên,
- **tô sáng tam giác vừa bị phá** (mày thấy rõ chỗ nào vỡ),
- **bản đồ sát thương** — chỗ nào con bot ăn đòn nhiều nhất,
- danh sách **sự kiện**: *"nhịp 100: A phát hiện B", "nhịp 135: Búa A chạm Kéo B", "nhịp 136: B mất tam giác t44"*.

### 6.2. Cách đọc một trận thua

Đây là **kỹ năng người chơi** thật sự của game. Mày tua băng lại và tự hỏi:

- **Nó thua vì hình, hay vì não?** Nếu cùng hình mà đổi não thì khác không → lỗi ở bộ não. Nếu não ổn mà hình yếu → lỗi thiết kế.
- **Nó chết vì cái gì?** Bị đâm trực diện → thiếu Bao che mặt trước. Bị vòng sườn → thiếu Kéo bên hông. Bị bẻ Motor → Motor đặt lộ quá.
- **Nó có xoay đủ nhanh không?** Nếu nó cứ đưa nhầm mặt vào va chạm → thiếu Motor xoay, hoặc bộ não xoay ngu.
- **Nó có quá tham tấn công không?** Bỏ lõi trống → dễ bị chọc chết.

Rồi mày quay về Mùa ① và sửa **một thứ mỗi lần** — đúng kiểu một người nuôi sinh vật kiên nhẫn.

### 6.3. Tiến hóa — con bot có dòng dõi

Mỗi lần sửa là một **phiên bản mới**, có lịch sử rõ ràng. Mày có thể nhìn lại:

```
v1  Mũi Giáo        → thua Cánh Cụp (bị vòng sườn)
v2  Mũi Giáo + Kéo hông  → thắng Cánh Cụp, thua Khiên (không xuyên được)
v3  Mũi Giáo + Búa nặng  → xuyên Khiên, nhưng xoay chậm, thua Báo Đen
v4  Mũi Giáo cân bằng    → thắng cả ba...
```

Đây là phần **gây nghiện** nhất: mày đang **lai tạo và chọn lọc tự nhiên** cho con thú của mình, qua nhiều thế hệ.

---

## 7. Chiều sâu chiến thuật — vì sao game này không nhàm

### 7.1. Không có bot "mạnh nhất" — chỉ có bot "đọc được meta"

Vì mọi người cùng ngân sách, không có bot nào vô địch tuyệt đối. Chỉ có **băng giấy–búa–bao bậc hai**: bot A khắc bot B, bot B khắc bot C, bot C lại khắc bot A. Meta tự xoay vòng khi mọi người bắt đầu **đọc đối thủ** và thiết kế để khắc chúng.

### 7.2. Năm trường phái bot mẫu — năm triết lý chiến đấu

Để hiểu game, mày nên biết năm con bot "chuẩn" mà dev dùng để thử luật:

| Bot | Hình dáng | Triết lý |
|---|---|---|
| **Spear (Mũi Giáo)** | Búa dồn trước, Motor sau | Lao thẳng, một nhát chí mạng |
| **Shield (Khiên)** | Bao che trước/lõi, chậm | Thủ chắc, để địch tự sập |
| **Flanker (Vòng Sườn)** | Kéo hai cánh, Motor hai bên | Không đâm thẳng, luôn tìm sườn |
| **Spinner (Con Xoay)** | Tròn/radial, xoay cực mạnh | Xoay để đưa mặt có lợi vào va chạm |
| **Glass Cannon (Súng Thủy Tinh)** | Gần như không thủ, combat dồn trước, nhanh | Đánh trước, đánh chết, hoặc chết |

Nếu năm con này **tạo ra matchup khác biệt rõ ràng** — nghĩa là hệ thống chiến đấu bắt đầu có chiều sâu. Đó là cột mốc quan trọng nhất của game.

### 7.3. Bốn tầng đánh đổi mày phải cân mỗi lần thiết kế

1. **Cân bằng vũ khí** — Búa/Kéo/Bao đặt bao nhiêu, ở đâu?
2. **Cân bằng cơ động** — dồn bao nhiêu vào Motor? (mạnh mà chậm, hay nhanh mà yếu?)
3. **Cân bằng tải trọng** — thân bot có đủ cơ bắp để vác chính nó không? Motor rải đều hay dồn cụm? (xem mục 3.4.1)
4. **Cân bằng não** — hung hăng hay thủ? Bám đuổi hay vòng sườn? Đổi tính khi bị thương thế nào?

Bốn tầng này **nhân với nhau** thành vô số tổ hợp. Đó là lý do cùng một luật, mọi người tạo ra **vô số sinh vật khác nhau**.

> **Vì sao tải trọng là một tầng đánh đổi hay:** nó chặn đứng chiến thuật "nhồi thật nhiều tam giác chiến đấu cho khỏe". Muốn to thì phải nuôi cơ bắp để vác — và ngân sách không cho mày ăn cả hai. Đây chính là cơ chế khiến **ngân sách 60 tam giác** trở thành một bài toán thật, chứ không phải một con số để nhồi cho đầy.

---

## 8. Hành trình người chơi — từ gà mờ tới kiến trúc sư

- **Giờ đầu tiên:** Mày nói với AI một ý tưởng đơn giản. AI dựng cho mày con bot đầu tiên. Mày bấm "thử", xem nó đánh với bù nhìn. Ngạc nhiên vì nó **tự chạy tự đâm**.
- **Ngày đầu tiên:** Mày chạy vài trận thử, xem replay, thấy con bot của mình xoay ngu, sửa, chạy lại. Mày bắt đầu hiểu **vị trí quan trọng thế nào**.
- **Tuần đầu tiên:** Mày có 3–4 phiên bản bot, mỗi bản khắc một kiểu địch. Mày bắt đầu nghĩ tới **meta** — "bọn nó đang chơi nhiều Kéo quá, tao làm con nhiều Bao".
- **Lâu dài:** Mày thiết kế bot không phải để "mạnh nhất" mà để **lạ nhất**, **khó đoán nhất**. Mày thắng bằng cái đầu, không bằng phản xạ. Và mày có một bộ sưu tập sinh vật hình học mang dấu ấn riêng của mày.

---

## 9. Vì sao trò này vui — điều làm nên khác biệt

1. **Mày thắng bằng trí tưởng tượng, không bằng tay nhanh.** Cả game chơi bằng cái đầu.
2. **Mọi người công bằng.** Cùng 60 viên gạch — ai nghĩ giỏi hơn, người đó thắng.
3. **Hình dạng là vũ khí.** Con bot của mày *chính là* chiến thuật của mày.
4. **Cơ thể biết đau.** Bị thương thì hành vi đổi — trận đấu kể một câu chuyện.
5. **Không thể vừa to vừa nhanh miễn phí.** Tải trọng của Motor buộc mày phải chọn: nhồi giáp thì phải nuôi cơ bắp, mà ngân sách có hạn. Mọi thiết kế đều là một sự đánh đổi thật.
6. **Băng ghi hình dạy mày.** Mỗi trận thua là một bài học cụ thể, không phải một con số vô hồn.
7. **AI là đồng đội, không phải đối thủ.** Mày nghĩ, AI đẽo — mày không cần biết code.
8. **Mọi thứ công bằng và kiểm chứng được.** Không có trọng tài thiên vị, không có kết quả mơ hồ. Cùng đầu vào, cùng kết quả — ai cũng tự kiểm tra được.

---

## 10. Bảng tóm tắt — những con số cần nhớ (bản đầu)

| Thứ | Giá trị khởi điểm | Ghi chú |
|---|---|---|
| Ngân sách hình học | **60 tam giác/bot** | Cứng, mọi người như nhau |
| Core | **1** | Nằm trên 1 tam giác **chiến đấu** — không được đặt trên Motor; vỡ là thua |
| Kích thước bot | tối đa **12 × 12** đơn vị | Tránh bot khổng lồ |
| Đấu trường | **40 × 40**, trắng, phẳng, 2D | Một sân duy nhất |
| Nhịp mô phỏng | **30 nhịp/giây** | Bên trong; ngoài nhìn như real-time |
| Thời lượng trận | tối đa **120 giây** | Hết giờ → tính điểm công khai |
| Máu mỗi tam giác | Búa **70** · Kéo **105** · Bao **168** · Motor **80** | Cân sức: `máu × sát thương = 1680` |
| Sát thương nền | Búa **24** · Kéo **16** · Bao **10** · Motor **0** | Xem `can_bang.md` để biết chi tiết |
| Hệ số khắc chế | lợi thế **×2.0** / cùng loại **×1.0** / bất lợi **×0.5** | Đánh vào Motor: **×1.0** |
| Cộng hưởng đa dạng | **+12% máu tối đa** mỗi loại chiến đấu khác trong vòng 1, tối đa **+24%** | Motor **nhận** thưởng nhưng **không được đếm** là một loại; tính lại khi cấu trúc đổi |
| **Tải mỗi Motor** | **4 tam giác** | Mỗi Motor kéo nổi 4 tam giác (tính cả nó) |
| **Bảng tốc độ theo tải** | ≤0.50 → **115%** · 0.50–1.00 → **100%** · 1.00–1.50 → 70% · 1.50–2.00 → 40% · >2.00 → 15% | Hệ số tải hiệu dụng lấy `max()` với hệ số lúc khóa gói — bot không bao giờ nhanh lên nhờ bị đánh |
| **Ngưỡng quá tải** | hệ số tải **> 2.0** | Tải ÷ sức kéo vượt 2.0 → gần như đứng yên |
| Nhịp đánh | **mỗi tam giác phòng thủ** nhận tối đa **1 hit / 6 nhịp** | Không phải theo cặp — chặn chuyện bị kẹp 3 mặt ăn 3 hit trong 1 nhịp |
| Vùng thu hẹp | từ giây **60**, bán kính 28.3 → 4.0 | Lõi ngoài vòng mất **1.5% máu tối đa mỗi nhịp** (~2.2 giây ân hạn cho mọi loại lõi) |
| Mảnh tách rời | **biến mất ngay** trong mô phỏng | Viewer cho tan biến cho đẹp mắt |
| Não tối đa | 256 nút, sâu 16, 32 biến, 1000 bước/nhịp | Vượt → bỏ hành động nhịp đó |

> ⚠️ **Toàn bộ con số trên là điểm khởi đầu để cân bằng, không phải chân lý.** Chúng sẽ được chỉnh sau khi M1 (hai bot tự đánh) chạy được và người ta **đo bằng thực nghiệm**, không đoán mò. Các giá trị nằm trong "ruleset" — bộ luật tập trung, không rải rác trong code.
>
> 📐 **Chi tiết cân bằng chiến đấu** (ma trận sát thương, bảng số nhát để hạ, cơ chế chống bot thuần chủng) nằm trong tài liệu riêng: **`can_bang.md`**.

---

## 11. Nguyên tắc vàng — tinh thần không được phá vỡ

1. **Gameplay trước, nền tảng sau.** Phải vui trước đã.
2. **Server là trọng tài duy nhất.** Frontend không tự quyết định sát thương hay thắng thua.
3. **Ngoài real-time, trong từng nhịp cố định.**
4. **Hình học phải có ý nghĩa chiến thuật** — vị trí quan trọng hơn số lượng, và **Motor phải kéo nổi thân** (tải trọng).
5. **Mất bộ phận phải đổi hành vi thật** — mất Motor thì mất tốc độ, mất xoay, và có thể **rơi vào quá tải**.
6. **AI không được điều khiển trận chính thức.** Nó chỉ thiết kế trước và phân tích sau.
7. **Mọi trận chính thức phải tái hiện được** — cùng bot, cùng seed, cùng kết quả.
8. **MVP nhỏ, đo gameplay trước khi thêm hệ thống lớn.**

---

*Tinh thần cuối cùng, viết cho mày — người chơi:*

> Mày không điều khiển con thú của mình. Mày **tạo ra nó**, **dạy nó**, rồi **tin nó**. Khi nó bước vào đấu trường, mày chỉ ngồi xem — và hy vọng mày đã nghĩ đủ kỹ. Đó là toàn bộ linh hồn của PROMPT CHIẾN.
