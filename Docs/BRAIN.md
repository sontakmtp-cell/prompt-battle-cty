# Brain API 1.0.0 — thực thi M1

Brain là **danh sách luật viết bằng JSON**. Nó chỉ được xem thông tin game cho phép rồi chọn cách đi và xoay. M1 đã có kiểm tra tĩnh và trình thực thi từng nhịp.

Mẫu dễ đọc: [bot-basic.json](../examples/bot-basic.json). Mẫu có tiếp cận, vòng sườn, lùi rồi phản công: [brain-flanker.json](../examples/brain-flanker.json).

## Cấu trúc và thứ tự thực hiện

Một Brain có `apiVersion`, `initialState`, `variables` và `states`. Tên trạng thái/biến phải duy nhất, từ 1 đến 48 ký tự, bắt đầu bằng chữ ASCII; phần còn lại dùng chữ, số, `_` hoặc `-`. Tên được xem là dữ liệu, không chuyển thành tên thuộc tính của đối tượng thực thi.

Mỗi trạng thái có danh sách `rules`. Mỗi luật có `when`, `action`, có thể thêm `set` và `nextState`.

1. Hai Brain cùng đọc ảnh chụp **đầu nhịp**, bao gồm biến và trạng thái của chính nó.
2. Chỉ xét các luật của trạng thái hiện tại, từ trên xuống. Luật khớp đầu tiên được chọn.
3. Luật đó cho đúng **một lệnh đi và một lệnh xoay**. Không có nút đánh: tiếp xúc cơ thể tạo sát thương.
4. Tất cả giá trị `set` đọc biến ở đầu nhịp, rồi được ghi đồng thời. Không được ghi cùng biến hai lần trong một luật.
5. `nextState` có hiệu lực từ nhịp sau. Chuyển sang trạng thái khác thì `stateTicks` ở nhịp sau bằng 0; không chuyển hoặc chuyển về chính nó thì tăng 1. Nhịp đầu trận có `stateTicks = 0`.
6. Không luật nào khớp: đi `stop`, xoay `hold`, không ghi biến. Tên trạng thái hoặc biến chưa khai báo là lỗi.

Không có vòng lặp, lời gọi hàm tùy ý, JavaScript, mạng, file, AI hay quyền đọc Brain đối thủ.

## Biểu thức số nguyên

| `kind` | Trường còn lại | Ý nghĩa |
|---|---|---|
| `constant` | `value` | Số nguyên từ −2³¹ đến 2³¹−1 |
| `sensor` | `name` | Một chỉ số trong bảng dưới |
| `variable` | `name` | Giá trị biến riêng của Brain |
| `math` | `op`, `left`, `right` | `add`, `subtract`, `min`, `max` |

Phép cộng/trừ kẹp kết quả về khoảng số nguyên trên. Không có chia nên không có trường hợp chia cho 0. Các biểu thức không có tác dụng phụ.

| Sensor được phép | Đơn vị / ý nghĩa |
|---|---|
| `tick`, `stateTicks` | Số nhịp kể từ đầu trận / vào trạng thái |
| `self.x`, `self.y` | Vị trí gốc bot trên sân, 1000 = 1 đơn vị cạnh |
| `self.heading`, `enemy.heading` | Hướng bot, 0–63; 0 hướng +X, tăng ngược chiều kim đồng hồ |
| `self.coreHpRatio`, `enemy.coreHpRatio` | Tỉ lệ máu lõi, 0–1000, chia nguyên xuống |
| `self.combatCount`, `enemy.combatCount` | Số tam giác chiến đấu còn nối Core |
| `self.motorCount`, `enemy.motorCount` | Số Motor còn nối Core |
| `self.loadFactor` | Tải hiệu dụng, 1000 = đủ tải; mất hết Motor dùng `ruleset.motor.noMotorLoad` |
| `self.speed` | Độ lớn vận tốc, 1000 = 1 đơn vị/giây |
| `enemy.distance` | Khoảng cách hai gốc bot, 1000 = 1 đơn vị |
| `enemy.bearing` | Góc tới gốc địch tương đối với hướng mình, −32 đến 31; đối hướng lấy −32 |
| `ring.radius` | Bán kính vòng, đơn vị 1/1000; trước khi thu trả bán kính bắt đầu |
| `self.outsideRing` | 1 nếu Core ngoài vòng đang gây sát thương, ngược lại 0 |

`self.loadFactor` là `max(tải hiện tại, tải lúc khóa gói)`. Trong thân bot, trục +Y là mũi trước; heading 0 xoay mũi về +X của sân. Trục +Y của sân hướng lên; Canvas lật trục Y khi vẽ. Các phép tính vật lý chia nguyên về 0; sát thương và các tỉ lệ không âm lấy phần nguyên xuống.

## Điều kiện

| `op` | Trường còn lại | Kết quả |
|---|---|---|
| `always` | Không có | Luôn đúng |
| `compare` | `cmp`, `left`, `right` | So sánh `eq`, `ne`, `lt`, `lte`, `gt`, `gte` |
| `all` | `args` | Tất cả điều kiện đúng |
| `any` | `args` | Ít nhất một điều kiện đúng |
| `not` | `arg` | Đảo đúng/sai |

`all`/`any` có ít nhất một phần tử, xét trái sang phải và dừng khi đã biết kết quả. `left`/`right` là biểu thức số nguyên.

## Đi và xoay

`action.move` có `mode` và `power` (0–1000):

- `stop`: không yêu cầu lực đẩy; động lượng/cản do engine xử lý, không dịch chuyển tức thời.
- `forward`, `backward`: đi theo hướng thân hoặc ngược hướng thân.
- `towardEnemy`, `awayFromEnemy`: đi về phía gốc địch hoặc xa gốc địch.
- `orbitLeft`, `orbitRight`: đi theo tiếp tuyến quanh địch, lệch ±90° so với vector hướng tới địch.

`action.turn` có `mode`, `power` (0–1000), `offset` (−32 đến 31):

- `hold`: không yêu cầu xoay.
- `left`, `right`: yêu cầu xoay ngược/thuận chiều kim đồng hồ.
- `faceEnemy`, `faceAway`: xoay về phía/ra xa địch; cộng `offset` để chọn mặt vũ khí. Lấy góc ngắn nhất, trường hợp đối hướng xoay theo chiều âm.

`power = 0` không tạo lực. `stop`/`hold` bỏ qua power; các chế độ xoay khác `faceEnemy`/`faceAway` bỏ qua offset. Nếu vector tới địch bằng 0 thì lệnh phụ thuộc vector đó không tạo thêm lực/xoay. Tất cả chỉ là **ý định**, bị giới hạn bởi Motor, tải trọng và cấu trúc; không có dịch chuyển tức thời.

## Giới hạn và cách đếm

- Tối đa **256 nút**, **16 tầng**, **32 biến**. Một đối tượng JSON tính một nút, bao gồm đối tượng gốc, khai báo biến, trạng thái, luật, lệnh và biểu thức. Mảng và giá trị đơn không tính nút. Đối tượng gốc có độ sâu 1; mảng không tăng độ sâu.
- M0 đã kiểm tra các giới hạn trên, tên trùng, tham chiếu sai, lệnh/sensor lạ, số thực và thuộc tính thừa.
- M1 thực thi tối đa **1000 bước/nhịp**: mỗi luật được xét, mỗi điều kiện, mỗi biểu thức, mỗi lệnh đi/xoay, mỗi phép ghi biến và phép chuyển trạng thái tính một bước; phép so sánh/logic gồm các bước của biểu thức/điều kiện con thực sự được thăm. Kiểm tra ngân sách trước mỗi bước.
- Vượt ngân sách: bỏ **toàn bộ** ý định, ghi biến và chuyển trạng thái của nhịp đó; giữ biến/trạng thái cũ, tăng `stateTicks` như nhịp không chuyển trạng thái. Đếm vi phạm liên tiếp; nhịp hợp lệ đặt lại bộ đếm. **30 nhịp liên tiếp** thì thua với lý do `brainBudget`; hai bên cùng chạm ngưỡng cùng nhịp thì hòa.
- CLI M1 chạy job trong tiến trình riêng, giới hạn 60 giây thực và 256 MiB V8 old heap. Lỗi tiến trình, timeout hạ tầng hoặc hết bộ nhớ là **job failed**, không phải bot thua.

Validation thử 3 seed `7, 42, 2026`, đổi bên A/B thành 6 trận với đối thủ đứng yên cùng thân. Bot phải di chuyển, tiến gần và gây ít nhất một hit trước khi trận kết thúc. Dùng giới hạn thời gian trận thật, để bot quá tải 55/5 vẫn có cơ hội tiếp cận; không nhầm bot chậm với bot cố tình đứng yên.

Từ ruleset 0.1.3, tam giác tấn công phải hồi phục thêm `ceil(30 × (1000 − powerDiChuyen) / 1000)` nhịp giữa hai lần gây hit. Đi `stop` hoặc mất hết Motor tương đương power 0; chỉ xoay không được tính là dùng lực di chuyển. Lệnh đi power 1000 không thêm thời gian hồi phục. Đồng thời mỗi tam giác phòng thủ vẫn nhận tối đa một hit mỗi 18 nhịp. Đây là luật chống đứng yên đã được Khầy chọn ở M1; công thức sát thương mỗi hit và bất biến RPS được giữ nguyên.

Định nghĩa chuẩn máy đọc: [brain.json](../schemas/brain.json); kiểm tra tĩnh: `@prompt-chien/core/brain` → `validateBrain()`.
