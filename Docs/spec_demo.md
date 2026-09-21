# PROMPT CHIẾN — SPEC DEMO

**Trạng thái:** Draft nền tảng cho MVP  
**Mục tiêu:** Làm một web game 1v1 nơi người chơi cùng AI thiết kế bot hình học, còn trận đấu được server thực thi tự động, công bằng, deterministic và có thể replay.

---

# 1. Tầm nhìn sản phẩm

PROMPT Chiến là một web game đối kháng/chiến thuật nơi người chơi **không trực tiếp điều khiển bot trong trận**.

Người chơi đưa ra ý tưởng, hình dáng và chiến thuật. AI đóng vai trò kỹ sư thiết kế + lập trình viên chiến thuật, biến ý tưởng đó thành một Bot Package hợp lệ.

Khi trận đấu bắt đầu:

- không dùng LLM để suy luận theo thời gian thực
- không cho AI bên ngoài gửi lệnh điều khiển trực tiếp
- Battle Engine của server là nguồn sự thật duy nhất
- cùng input + cùng seed phải cho cùng kết quả

Tinh thần cốt lõi:

```text
CON NGƯỜI ĐƯA Ý TƯỞNG
        +
AI THIẾT KẾ VÀ LẬP TRÌNH BOT
        +
SERVER VALIDATE
        +
BATTLE ENGINE THỰC THI CÔNG BẰNG
```

Tagline đề xuất:

> Design with AI. Fight with code.

---

# 2. Trải nghiệm cốt lõi

Gameplay loop:

```text
Nghĩ ý tưởng
    ↓
Mô tả / vẽ bot
    ↓
Bàn với AI
    ↓
AI tạo geometry
    ↓
AI bố trí Búa / Bao / Kéo / Motor
    ↓
AI viết Brain
    ↓
Validate
    ↓
Sandbox Simulation
    ↓
Cải tiến
    ↓
Submit
    ↓
Matchmaking
    ↓
Battle
    ↓
Replay
    ↓
Phân tích
    ↓
Tạo phiên bản mới
```

Kỹ năng người chơi nằm ở:

- nghĩ hình dáng bot
- phân bổ Geometry Budget
- bố trí các loại tam giác
- bố trí Motor
- định nghĩa chiến thuật
- mô tả ý tưởng tốt cho AI
- đọc replay
- cải tiến bot qua nhiều phiên bản

---

# 3. Phạm vi Demo đầu tiên

Demo đầu tiên phải cố tình nhỏ.

## Bắt buộc

- Web game
- 1 arena trắng, phẳng, 2D
- 1v1
- bot được ghép từ lưới tam giác chuẩn
- 3 Combat Triangle: Búa / Bao / Kéo
- 1 Motor Triangle
- 1 Core
- Geometry Budget cố định
- bot tự tìm và giao chiến
- real-time autonomous battle
- Battle Engine chạy fixed timestep
- deterministic simulation
- seed trận đấu
- geometry validator
- brain validator
- sandbox test
- replay
- local simulator / CLI
- MCP Server tối thiểu

## Chưa làm ở Demo Core

- item
- nhiều arena
- PvE
- guild
- economy
- marketplace
- skin/cosmetic phức tạp
- tournament nâng cao
- vật lý mềm phức tạp
- LLM suy luận trong trận
- voice control
- mobile app native

Các tính năng trên có thể thêm sau khi gameplay lõi đã chứng minh là thú vị.

---

# 4. Mô hình Bot

Mỗi bot gồm 3 phần logic:

```text
BOT
├── BODY
├── CORE
└── BRAIN
```

## 4.1. Body

Body được tạo từ nhiều tam giác cùng kích thước đặt trên một lưới chuẩn.

Bot có thể mang hình dạng:

- mũi tên
- khiên
- cánh
- xoắn ốc
- sinh vật
- robot
- hình đối xứng
- hình bất quy tắc
- các cấu trúc hình học khác

Miễn là hợp lệ theo Geometry Rules.

## 4.2. Core

Mỗi bot có đúng 1 Core.

Core:

- nằm trên một triangle hợp lệ
- **phải là triangle chiến đấu (Búa / Kéo / Bao) — KHÔNG được đặt trên Motor**
- phải thuộc body chính
- không được tách rời
- bị phá hủy thì bot thua ngay

**Vì sao cấm Core trên Motor:** đánh vào Motor là **×1.0 với mọi loại** (Motor không nằm trong vòng khắc chế), nên lõi-Motor sẽ **miễn nhiễm khắc chế** — địch không thể chọn loại quân để khắc lõi. Cộng thêm Motor có 80 máu (nhiều hơn Búa 70), nó thành vị trí lõi tốt nhì trong game. Muốn chọn lõi thì chọn giữa ba loại chiến đấu và chấp nhận điểm yếu của loại đó. Chi tiết: [can_bang.md](H:/AI/Prompt-battle/can_bang.md) mục 6.6.

Core tạo ra mục tiêu chiến thuật: vừa phải bảo vệ lõi, vừa phải giữ cấu trúc đủ linh hoạt để tấn công.

## 4.3. Brain

Brain là logic chiến thuật đã được validate trước trận.

Brain quyết định:

- tìm đối thủ
- tiếp cận
- né
- xoay
- lựa chọn hướng tấn công
- rút lui
- phản công
- thay đổi hành vi khi bot mất một phần body hoặc motor

Brain không được truy cập hệ điều hành hay mạng bên ngoài.

---

# 5. Hệ tam giác

Có 4 loại triangle trong Demo Core.

## 5.1. Hammer Triangle — Búa

Mạnh khi va chạm với Kéo.

```text
Búa > Kéo
```

Phù hợp:

- đầu công phá
- mũi nhọn
- vùng lao trực diện

## 5.2. Scissor Triangle — Kéo

Mạnh khi va chạm với Bao.

```text
Kéo > Bao
```

Phù hợp:

- cánh
- đánh sườn
- cấu trúc cơ động

## 5.3. Paper Triangle — Bao

Mạnh khi va chạm với Búa.

```text
Bao > Búa
```

Phù hợp:

- bảo vệ lõi
- lớp phòng thủ
- vùng chống công phá trực diện

## 5.4. Motor Triangle

Không thuộc vòng Búa-Bao-Kéo.

Motor tạo khả năng vận động:

- tiến
- lùi
- xoay
- đổi hướng
- tăng tốc

Motor cũng tiêu tốn Geometry Budget.

Ví dụ với ngân sách 60 triangle:

```text
45 combat + 15 motor = cân bằng        → hệ số tải 1.00 → 100% tốc độ
55 combat + 5 motor  = mạnh nhưng chậm → hệ số tải 3.00 → ~15% tốc độ, gần như đứng yên
30 combat + 30 motor = rất cơ động     → hệ số tải 0.50 → 115% tốc độ
                       nhưng ít hơn 33% lực chiến đấu
```

Chi tiết bảng tốc độ theo hệ số tải: [gameplay.md](H:/AI/Prompt-battle/gameplay.md) mục 3.4.1. Motor cũng là **mục tiêu béo bở** — đánh vào Motor là ×1.0 với mọi loại và Motor không gây sát thương trở lại, nên đó là giao dịch một chiều không rủi ro. Cùng tài liệu, mục 3.4.1 bài toán thứ 4.

---

# 6. Ý nghĩa vị trí triangle

Không chỉ số lượng mà **vị trí** triangle phải có ý nghĩa.

Ví dụ:

- Búa phía trước → mạnh khi đâm trực diện
- Kéo hai bên → phù hợp vòng sườn
- Bao quanh Core → chống Búa
- Motor phía sau → tăng lực tiến
- Motor hai bên → tăng khả năng xoay
- Motor phân bố lệch → bot có xu hướng quay lệch
- mất motor bên trái/phải → khả năng điều khiển tương ứng suy giảm

Do đó, geometry chính là một phần gameplay chứ không chỉ là cosmetic.

---

# 7. Geometry Budget

Mọi người chơi dùng cùng giới hạn nền.

Giá trị thật sẽ được balance sau; Demo có thể bắt đầu với:

```text
MAX_TRIANGLES = 60
MAX_WIDTH      = configurable
MAX_HEIGHT     = configurable
MAX_JOINTS     = configurable
CORE_COUNT     = 1
```

Geometry Validator kiểm tra:

- tổng triangle không vượt budget
- tất cả triangle cùng thuộc grid chuẩn
- không overlap trái phép
- không có triangle siêu nhỏ hoặc collider bất thường
- bot không vượt kích thước tối đa
- cấu trúc chính phải liên thông
- **Core hợp lệ — Core phải nằm trên tam giác chiến đấu, không được trên Motor** (mục 4.2)
- Motor hợp lệ
- **có khả năng chiến đấu** — dưới 5 tam giác chiến đấu thì **cảnh báo** (không chặn): bot sẽ bị xử thua sau 10 giây vì không tạo được hành động chiến đấu hữu ích
- không tạo geometry nhằm exploit collision engine

Mục tiêu thiết kế:

> Hai người có cùng tài nguyên nền nhưng vẫn có thể tạo ra hai sinh vật chiến đấu hoàn toàn khác nhau.

---

# 8. Tách mảnh và phá hủy

Triangle có thể bị phá trong trận.

Khi một triangle bị phá:

1. triangle bị loại khỏi body
2. engine kiểm tra connectivity
3. phần geometry không còn nối với Core bị coi là detached
4. detached fragment không còn thuộc quyền điều khiển của bot

Trong Demo Core, detached fragment có thể đơn giản:

- biến mất sau một khoảng ngắn; hoặc
- trở thành debris không gây damage

Không cần mô phỏng vật lý mềm hoặc gãy vỡ phức tạp ở giai đoạn đầu.

---

# 9. Mô hình trận đấu

PROMPT Chiến dùng:

> **Real-time autonomous combat + fixed timestep simulation**

Người xem thấy trận đấu diễn ra liên tục như real-time.

Bên trong server, Battle Engine xử lý theo từng tick cố định.

Ví dụ:

```text
TICK_RATE = 30 ticks / second
```

Giá trị thật có thể thay đổi sau benchmark.

## 9.1. Một tick gồm các phase

```text
1. SENSE
2. THINK
3. INTENT
4. MOVE / ROTATE
5. COLLISION
6. DAMAGE
7. STRUCTURE UPDATE
8. WIN CONDITION
9. EVENT LOG
```

### SENSE

Bot nhận snapshot hợp lệ của thế giới.

### THINK

Brain tính hành động từ snapshot đó.

### INTENT

Engine thu action intent của cả hai bot trước khi áp dụng.

Điều này tránh việc Bot A luôn được lợi chỉ vì được xử lý trước Bot B.

### MOVE / ROTATE

Engine áp movement theo khả năng Motor còn hoạt động.

### COLLISION

Tìm triangle collision/contact.

### DAMAGE

Resolve Búa / Bao / Kéo theo luật deterministic.

### STRUCTURE UPDATE

Xóa triangle chết, tính lại connectivity và motor capability.

### WIN CONDITION

Kiểm tra Core, khả năng chiến đấu và giới hạn trận.

### EVENT LOG

Ghi dữ liệu cần thiết cho replay.

---

# 10. Combat Resolution

Demo đầu ưu tiên luật dễ hiểu và deterministic hơn là vật lý chân thực.

Khi hai Combat Triangle tiếp xúc đủ điều kiện tạo hit:

```text
Hammer  > Scissor
Scissor > Paper
Paper   > Hammer
```

Nếu một triangle có lợi thế loại:

- bên có lợi thế gây damage cao hơn
- bên bất lợi gây damage thấp hơn hoặc không gây damage, tùy balance

Nếu cùng loại:

- damage ngang nhau hoặc theo lực va chạm

Motor không có lợi thế RPS.

Damage cuối cùng có thể phụ thuộc vào:

```text
base_damage
× type_modifier
× impact_modifier
× orientation_modifier
```

Trong Demo Core nên giữ công thức đơn giản và cấu hình bằng constants.

Không hard-code balance rải rác trong code.

> ⚠️ **Quy tắc đơn vị — bắt buộc, đừng bỏ qua:** mọi hệ số (`type_modifier`, `impact_modifier`, `orientation_modifier`) lưu dạng **số nguyên đơn vị 1/1000**, không dùng số thực. Nếu trộn số thực vào, phép chia nguyên trong công thức sẽ cho **sát thương = 0** ở mọi cú đánh — lỗi rất khó tìm vì nhìn công thức thấy đúng. Bảng hằng số đầy đủ ở [can_bang.md](H:/AI/Prompt-battle/can_bang.md) mục 9, giải thích ở mục 3.6.

---

# 11. Movement Model

Không cần rigid-body simulator phức tạp ở Demo Core.

Mỗi bot cần tối thiểu:

```text
forward_power
reverse_power
rotation_power
max_speed
max_angular_speed
```

Các giá trị này được suy ra từ Motor Triangle còn hoạt động và vị trí của chúng tương đối với tâm bot.

Ví dụ:

- motor phía sau → tăng forward power
- motor nằm xa tâm → đóng góp rotation torque lớn hơn
- motor bị phá → khả năng di chuyển giảm ngay ở tick tiếp theo

Movement phải deterministic.

---

# 12. Brain API

Brain chỉ sử dụng API whitelist.

Demo Core nên giữ API nhỏ.

Ví dụ:

```text
GET_SELF_STATUS()
GET_DAMAGE_MAP()
GET_MOTOR_STATUS()

SCAN_ENEMY()
GET_ENEMY_POSITION()
GET_ENEMY_DIRECTION()

MOVE(direction, power)
ROTATE(direction, power)
MOVE_TO(target)
```

Trong Demo Core, combat có thể được tạo tự động bởi collision thay vì yêu cầu `ATTACK()`.

Như vậy bot chiến đấu bằng cách **điều khiển geometry của chính nó để tạo va chạm**, phù hợp hơn với concept sinh vật hình học.

Nếu sau này có vũ khí/item thì mới bổ sung:

```text
USE_ITEM(slot)
FIRE(slot, target)
```

---

# 13. Yêu cầu chủ động giao chiến

Bot không được đứng yên vô hạn để câu hòa.

Sandbox Test phải xác nhận bot có khả năng:

1. tìm đối thủ
2. tiếp cận
3. tạo giao chiến

Pseudo logic tối thiểu:

```text
WHILE enemy_exists:
    locate_enemy()
    approach_enemy()
    orient_attack_surface()
    engage()
```

Không bắt buộc mọi bot phải lao thẳng.

Các chiến thuật hợp lệ vẫn có thể gồm:

- né rồi phản công
- vòng sườn
- giữ khoảng cách ngắn hạn
- giả lùi

Nhưng bot không được chủ động tránh giao chiến vĩnh viễn.

> ⚠️ **Lưu ý từ đợt rà soát — hệ số va chạm đối xứng đang thưởng cho bên thủ.**
> Vì hệ số va chạm dùng chung cho cả hai bên, một bot **đứng yên** vẫn nhận hệ số 1.00 khi địch lao hết tốc lực vào nó — nó hưởng miễn phí động năng của địch. Nghĩa là *"đứng yên, xoay mặt đúng"* có thể gây sát thương gần bằng *"lao vào"*, mà không tốn công di chuyển và không lộ sơ hở.
> Điều này đi ngược tinh thần "phải chủ động giao chiến" ở mục này. **Bài test số 14** trong [can_bang.md](H:/AI/Prompt-battle/can_bang.md) mục 10: bot đứng yên phải gây **< 80%** sát thương so với bot lao vào. Nếu vượt, phải tách hệ số va chạm theo từng bên.

---

# 14. Brain Sandbox

Brain Code không được:

- đọc file hệ thống
- ghi file tùy ý
- truy cập mạng
- gọi API ngoài game
- chạy shell
- tạo process
- truy cập environment secrets
- gọi LLM trong trận
- sử dụng clock hệ thống làm nguồn randomness

Brain phải có:

- CPU budget mỗi tick
- memory limit
- execution timeout
- deterministic random API do engine cung cấp nếu cần

Nếu Brain vượt giới hạn:

- action của tick đó bị bỏ; hoặc
- bot bị xử lý theo luật penalty xác định trước

Không để Brain làm crash Battle Engine.

---

# 15. Bot Package

Sau validation, server khóa bot thành immutable package.

Cấu trúc logic:

```text
BOT PACKAGE
├── metadata
├── geometry
├── triangle_layout
├── core
├── motor_layout
├── brain
└── package_hash
```

Ví dụ khái niệm `bot.json`:

```json
{
  "version": "0.1",
  "name": "Hammer Shark",
  "geometry": {
    "grid": "tri-v1",
    "triangles": []
  },
  "core": {
    "triangle_id": "t32"
  },
  "brain": {
    "language": "promptchien-brain-v1",
    "entry": "main"
  }
}
```

Format thật phải có JSON Schema/version rõ ràng.

Sau khi lock:

- không sửa package trong trận
- package có hash
- trận lưu hash của cả hai bot
- replay gắn với chính xác bot version đã dùng

---

# 16. Validation Pipeline

```text
PLAYER IDEA / SKETCH
        ↓
AI / EDITOR
        ↓
BOT DEFINITION
        ↓
SCHEMA VALIDATOR
        ↓
GEOMETRY VALIDATOR
        ↓
BRAIN VALIDATOR
        ↓
SANDBOX TEST
        ↓
PASS
        ↓
LOCK BOT PACKAGE
        ↓
READY FOR MATCH
```

Sandbox Test kiểm tra tối thiểu:

- package đọc được
- geometry hợp lệ
- brain hợp lệ
- không crash
- không treo
- không vượt resource limit
- bot tìm được dummy enemy
- bot có thể di chuyển
- bot có thể tiếp cận
- bot có thể tạo combat interaction

---

# 17. Điều kiện thắng

Theo thứ tự ưu tiên:

## Win trực tiếp

- phá Core đối thủ

## Combat incapacity

- bot không còn khả năng tạo hành động chiến đấu hữu ích theo ngưỡng định trước

## Timeout

Nếu hết thời gian/tick:

server tính score bằng công thức công khai, **có trọng số** (chi tiết và lý do: [can_bang.md](H:/AI/Prompt-battle/can_bang.md) mục 8.1):

```text
0.35 × damage_dealt
0.30 × core_integrity
0.20 × remaining_combat_triangles
0.15 × remaining_motor_triangles
```

Sát thương đã gây được đặt nặng nhất là có chủ ý — nó chặn bot thủ câu giờ thắng oan.

**`damage_dealt` chuẩn hóa thế nào — chốt:** so trực tiếp với đối thủ, không chia cho hằng số cố định.

```text
damage_dealt của A = sát thương A gây ra ÷ max(sát thương A gây ra, sát thương B gây ra)
```

Bên gây nhiều hơn được 1.0, bên kia được tỉ lệ của mình. Cả hai cùng gây 0 thì cả hai được 0. Cách này không cần hằng số nào, luôn nằm trong `[0, 1]`, và không bao giờ chia cho 0.

Ba số còn lại (`core_integrity`, `remaining_combat_triangles`, `remaining_motor_triangles`) đều tính theo **phần trăm còn lại của chính mình**, không so với địch. Chi tiết và lý do: [can_bang.md](H:/AI/Prompt-battle/can_bang.md) mục 8.1.

Không dùng tiêu chí mơ hồ hoặc AI judge để quyết định người thắng.

---

# 18. Determinism

Battle Engine phải bảo đảm:

```text
same engine version
+ same bot A package
+ same bot B package
+ same seed
= same result
```

Mỗi match lưu:

```text
match_id
engine_version
ruleset_version
bot_a_hash
bot_b_hash
seed
result
replay_hash
```

Determinism quan trọng cho:

- chống gian lận
- debug
- tournament
- replay
- local simulator
- AI optimization

---

# 19. Replay System

Không nhất thiết lưu full world state ở mọi tick.

Có thể lưu:

- seed
- input packages
- engine version
- event log
- periodic checkpoints nếu cần seek nhanh

Ví dụ event:

```text
tick 100: Bot A detects Bot B
tick 120: Bot A rotates +15°
tick 135: A Hammer contacts B Scissor
tick 136: B loses triangle t44
tick 170: B loses left motor group
```

Replay Viewer cần:

- Play / Pause
- timeline
- x0.5 / x1 / x2 / x4
- seek
- HP/Core status
- số triangle còn lại
- highlight triangle vừa bị phá
- damage map

---

# 20. Visual Direction

Arena Demo:

- nền trắng tinh
- không gian 2D phẳng
- bot là các sinh vật hình học được ghép từ nhiều triangle
- silhouette có cảm giác mềm, sống, hơi giống chất lỏng
- chuyển động hữu cơ dù cấu trúc nền là hình học
- hai bot phân biệt rõ bằng visual identity
- UI tối giản

Bot không nên trông giống robot cơ khí cứng.

Mục tiêu hình ảnh:

> Một sinh vật chiến thuật sống được tạo từ chất lỏng hình học.

---

# 21. Web Architecture

Web game là giao diện chính của hệ thống.

Kiến trúc logic:

```text
                    PROMPT CHIẾN BACKEND
                  ┌──────────────────────┐
                  │ Battle Engine        │
                  │ Validation           │
                  │ Simulation           │
                  │ Match / Replay API   │
                  │ Persistence          │
                  └──────────┬───────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
              Web API               MCP Server
                  │                     │
          Web Game / Editor       AI Agents
```

Battle Engine không được phụ thuộc vào frontend.

Frontend không được tự quyết định damage hoặc kết quả trận.

---

# 22. Web UI Modules

Nên tách UI thành component có thể tái sử dụng.

## Battle Viewer

Hiển thị:

- arena
- bot A / bot B
- Core
- triangle state
- damage
- timeline
- replay controls

## Bot Editor

Cho phép:

- thêm/xóa triangle
- đổi Búa/Bao/Kéo/Motor
- chọn Core
- xem Geometry Budget
- validate
- xem warnings

## Bot Inspector

Hiển thị:

- geometry
- triangle counts
- motor distribution
- brain version
- package hash
- lịch sử version

Battle Viewer nên được viết sao cho sau này có thể tái sử dụng trong MCP App UI thay vì viết lại.

---

# 23. MCP Server

PROMPT Chiến cung cấp MCP Server public để AI agent có thể làm việc với game.

Mục tiêu:

- không phụ thuộc một nhà cung cấp AI cụ thể
- AI có thể thiết kế và test bot bằng tool
- web game vẫn hoạt động độc lập với MCP

Demo đầu chỉ cần bộ tool nhỏ:

```text
get_rules()
create_bot()
get_bot()
edit_bot()
validate_bot()
simulate_bot()
get_replay()
submit_bot()
```

Có thể bổ sung sau:

```text
get_match_result()
get_leaderboard()
clone_bot_version()
compare_simulations()
```

Không nên tạo quá nhiều MCP tools ngay từ đầu.

---

# 24. MCP Workflow

Ví dụ AI agent:

```text
create_bot
    ↓
edit_bot
    ↓
validate_bot
    ↓
simulate_bot
    ↓
get_replay
    ↓
analyze result
    ↓
edit_bot
    ↓
simulate_bot
    ↓
submit_bot
```

Người chơi có thể nói:

> Tạo cho tao bot hình mũi tên. Đầu dùng Búa, hai cánh dùng Kéo, Bao bảo vệ Core, motor tập trung phía sau. Test thử rồi cải tiến nếu nó xoay quá chậm.

AI sẽ biến ý tưởng thành Bot Package qua MCP.

---

# 25. MCP App UI

MCP Tools và MCP App UI phải được coi là hai lớp khác nhau.

```text
MCP TOOLS = chức năng bắt buộc
MCP APP UI = lớp trải nghiệm nâng cao
```

Nếu AI host hỗ trợ MCP App UI, PROMPT Chiến có thể hiển thị Battle Viewer trực tiếp trong cuộc chat.

Ví dụ:

```text
AI chat
  │
  ├── create/edit/simulate qua MCP tools
  │
  └── mở Battle Viewer trong chat
          │
          ├── Play/Pause
          ├── Timeline
          ├── Damage map
          └── Inspect bot
```

Nguyên tắc quan trọng:

> Không xây một frontend game thứ hai riêng cho MCP App.

Web Game và MCP App nên dùng chung Battle Viewer/core UI package ở mức tối đa có thể.

---

# 26. Compatibility Strategy

Không phải mọi AI client đều hỗ trợ cùng mức UI.

Hệ thống phải graceful fallback.

## Client hỗ trợ MCP + App UI

- dùng MCP tools
- hiển thị viewer ngay trong chat

## Client chỉ hỗ trợ MCP tools

- vẫn tạo/edit/simulate bot được
- trả match/replay metadata
- cung cấp link mở viewer trên website

## Client không hỗ trợ MCP

- người chơi dùng web game trực tiếp

Do đó gameplay và backend **không được phụ thuộc vào MCP App UI**.

---

# 27. Không điều khiển trận qua MCP

MCP chỉ dùng trước hoặc sau trận:

- thiết kế
- chỉnh sửa
- validate
- simulate
- submit
- xem replay
- phân tích kết quả

Khi official match bắt đầu:

```text
MCP COMMANDS → BLOCKED FROM LIVE CONTROL
```

Trận chỉ phụ thuộc:

```text
Bot Package
+ Brain
+ Battle Engine
+ Ruleset
+ Seed
```

---

# 28. Agent Onboarding

Website nên cung cấp tài liệu máy đọc được.

Ví dụ:

```text
/agent.md
/rules
/mcp
/schema/bot.json
/schema/replay.json
```

Người chơi có thể nói với AI:

> Đọc agent.md của PROMPT Chiến rồi giúp tao tạo một bot.

Tài liệu agent cần giải thích:

- luật
- schema
- MCP endpoint
- tools
- validation flow
- giới hạn sandbox
- ví dụ bot nhỏ

---

# 29. Local Simulator / CLI

Phải có simulator local dùng cùng core engine/ruleset với server ở mức tối đa có thể.

Ví dụ:

```text
promptchien validate bot.json
promptchien simulate botA.json botB.json --seed 1234
promptchien replay match.json
```

AI agent có thể dùng CLI để:

- test nhanh
- tìm lỗi
- chạy nhiều seed
- so sánh phiên bản bot
- tối ưu trước khi submit

Official match vẫn do server chính xác nhận.

---

# 30. Open Source Strategy

Có thể public:

- game rules
- Geometry spec
- triangle types
- Brain language/spec
- Bot schema
- replay format
- validator
- local simulator
- Battle Engine nếu phù hợp
- MCP spec

Server chính giữ vai trò:

- official matchmaking
- official leaderboard
- xác thực package
- anti-cheat
- season/tournament
- official result signing

Open source luật và simulator giúp cộng đồng tin rằng engine công bằng và giúp AI agent dễ tích hợp.

---

# 31. Versioning

Các thành phần sau phải version độc lập:

```text
engine_version
ruleset_version
bot_schema_version
brain_api_version
replay_version
mcp_api_version
```

Một bot chỉ được matchmaking với ruleset tương thích.

Không thay đổi luật silently giữa các trận.

---

# 32. Security Boundaries

Tách rõ ba vùng:

```text
UNTRUSTED
AI Agent / User Input / Brain Source

VALIDATION BOUNDARY
Schema + Geometry + Brain Sandbox

TRUSTED
Battle Engine + Match State + Result
```

Nguyên tắc:

- mọi input bên ngoài đều untrusted
- server không chạy source code tùy ý trực tiếp
- official result chỉ sinh từ server engine
- giới hạn CPU/memory/runtime
- rate limit simulation API
- package hash trước official match
- replay/result gắn engine version và seed

---

# 33. Dữ liệu tối thiểu cần lưu

## Bot

```text
bot_id
owner_id
version
package_hash
schema_version
created_at
status
```

## Match

```text
match_id
bot_a_hash
bot_b_hash
engine_version
ruleset_version
seed
started_at
result
replay_id
```

## Replay

```text
replay_id
match_id
format_version
event_log/checkpoints
hash
```

Account/auth/database implementation có thể làm sau khi engine demo hoạt động.

---

# 34. Milestone phát triển

## M1 — Game sống được

Mục tiêu: chứng minh gameplay lõi.

Cần có:

- triangle grid
- Bot Package cơ bản
- Geometry Validator
- Búa/Bao/Kéo/Motor
- Core
- fixed-tick Battle Engine
- movement
- collision
- damage
- destruction
- 2 bot tự đánh nhau
- deterministic seed
- CLI simulation

**Exit criteria:** Hai bot khác thiết kế có thể tự đánh từ đầu đến khi có người thắng và replay lại cùng kết quả.

---

## M2 — Game xem và chỉnh được

Cần có:

- Web Battle Viewer
- Replay Viewer
- Bot Editor
- timeline
- damage visualization
- validate từ web
- lưu/load bot local hoặc backend đơn giản

**Exit criteria:** Người không biết code có thể tạo bot, bấm simulate và xem trận hoàn chỉnh trên web.

---

## M3 — AI thiết kế được

Cần có:

- MCP Server
- 8 tool lõi
- agent.md
- schema docs
- sandbox simulation endpoint
- test với ít nhất 2 AI agent/client khác nhau

**Exit criteria:** Người chơi chỉ mô tả bằng ngôn ngữ tự nhiên, AI có thể tạo → validate → simulate → sửa → submit bot.

---

## M4 — Game xuất hiện trong AI chat

Cần có:

- MCP App UI cho host hỗ trợ
- reuse Battle Viewer
- replay interaction trong chat
- fallback link cho host chỉ hỗ trợ tools

**Exit criteria:** Từ một cuộc chat, AI có thể tạo bot, chạy simulation và hiển thị trận/replay ngay trong giao diện AI khi host hỗ trợ.

---

# 35. Những thứ chưa nên làm trước M1 hoàn tất

Không ưu tiên:

- login phức tạp
- payment
- leaderboard production
- matchmaking production
- ranking algorithm
- tournament
- item system
- cosmetics
- guild
- marketplace
- social feed
- nhiều map

Lý do:

> Trước hết phải chứng minh hai bot hình học tự đánh nhau thực sự vui và tạo ra chiến thuật khác biệt.

---

# 36. Các bot mẫu để kiểm thử gameplay

Nên có ít nhất 5 bot reference do dev viết tay.

## Spear

- Búa tập trung phía trước
- nhiều motor phía sau
- lao trực diện

## Shield

- Bao bảo vệ phía trước/Core
- chậm
- thiên phòng thủ

## Flanker

- Kéo hai cánh
- motor hai bên
- ưu tiên vòng sườn

## Spinner

- geometry tròn/radial
- rotation power cao
- dùng xoay để đưa mặt có lợi vào contact

## Glass Cannon

- rất ít phòng thủ
- nhiều combat triangle phía trước
- tốc độ cao

Nếu các bot này tạo ra matchup khác biệt rõ ràng thì combat system bắt đầu có chiều sâu.

> ⚠️ **Cảnh báo từ đợt rà soát — Flanker có nguy cơ bị hai hệ số mới giết.**
> Hệ số va chạm phạt cú đánh có tốc độ tương đối thấp (vòng sườn thường tiếp cận khi địch đang chạy, nên tốc độ tương đối chiếu lên pháp tuyến nhỏ), còn hệ số hướng phạt cú đâm lệch khỏi trục trước–sau. **Vòng sườn dính cả hai.**
> Đây là trường phái trụ cột, không được để nó chết. **Bài test số 15** trong [can_bang.md](H:/AI/Prompt-battle/can_bang.md) mục 10: Flanker phải thắng **≥ 40%** số trận, và thắng Spear ít nhất 1 trong 10 trận. Nếu thua Spear trên 90% thì hai hệ số đang quá nặng tay.

---

# 37. Tiêu chí thành công của Demo

Demo đạt yêu cầu khi chứng minh được 6 điều:

1. Hai người có cùng Geometry Budget nhưng có thể tạo bot rất khác nhau.
2. Cách bố trí Búa/Bao/Kéo ảnh hưởng trực tiếp đến kết quả.
3. Vị trí Motor ảnh hưởng rõ đến cách bot di chuyển.
4. Bot bị phá từng phần làm chiến thuật và khả năng vận động thay đổi trong trận.
5. Brain khác nhau tạo ra hành vi chiến đấu khác nhau dù geometry giống nhau.
6. AI agent có thể hiểu spec và tạo bot hợp lệ mà người chơi không cần biết code.

Mục tiêu sâu hơn:

> Người xem phải có cảm giác đang nhìn hai sinh vật hình học sống tự tìm cách đánh nhau, chứ không phải hai sprite chạy script đơn giản.

---

# 38. Câu hỏi cần balance sau khi M1 chạy được

Không cần quyết định bằng suy đoán trước khi có prototype.

Cần test thực tế:

- 30 hay 60 tick/s?
- 40, 60 hay 80 triangle/bot?
- Motor nên chiếm bao nhiêu % budget?
- same-type collision gây bao nhiêu damage?
- RPS advantage mạnh đến đâu?
- detached fragment xử lý thế nào đẹp nhất?
- arena lớn bao nhiêu?
- timeout bao lâu?
- có cần anti-stall zone/ring shrink hay không?

Các giá trị này phải là config/ruleset, không hard-code.

---

# 39. Kiến trúc mục tiêu tổng thể

```text
                       PLAYER
                         │
              ┌──────────┴──────────┐
              │                     │
           WEB GAME              AI CHAT
              │                     │
              │                  MCP CLIENT
              │                     │
              └──────────┬──────────┘
                         │
                  PROMPT CHIẾN API
                         │
          ┌──────────────┼───────────────┐
          │              │               │
      BOT SERVICE    MCP SERVER     MATCH SERVICE
          │              │               │
          └──────────────┼───────────────┘
                         │
                  VALIDATION LAYER
                         │
                   BATTLE ENGINE
                         │
              ┌──────────┴──────────┐
              │                     │
          RESULT STORE          REPLAY STORE
```

Battle Engine là lõi dùng chung.

Web, MCP và AI chỉ là các cách khác nhau để tương tác với cùng hệ thống.

---

# 40. Nguyên tắc thiết kế cuối cùng

1. **Gameplay trước platform.**
2. **Battle Engine authoritative.**
3. **Real-time bên ngoài, fixed-tick bên trong.**
4. **Geometry phải có ý nghĩa chiến thuật.**
5. **Mất bộ phận phải làm bot thay đổi hành vi thực tế.**
6. **LLM không điều khiển official match.**
7. **MCP Tools là lõi; MCP App UI là nâng cấp.**
8. **Web UI và MCP App tái sử dụng cùng Battle Viewer.**
9. **Mọi official match phải deterministic và replayable.**
10. **MVP nhỏ, đo gameplay trước khi thêm hệ thống lớn.**

---

# 41. Định vị sản phẩm

Bản đầy đủ:

> PROMPT Chiến là một đấu trường web nơi con người cùng AI thiết kế những sinh vật chiến đấu bằng hình học và chiến thuật, sau đó để chúng tự chiến đấu trong một Battle Engine công bằng, deterministic và có thể kiểm chứng.

Bản ngắn:

> **Design with AI. Fight with code.**

