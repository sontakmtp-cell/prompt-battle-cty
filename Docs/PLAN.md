# PROMPT Chiến — kế hoạch xây dựng theo mô-đun

Xây dựng theo [spec_demo.md](H:/AI/prompt-battle-cty/Docs/spec_demo.md), với bản đầu dành cho **nhóm thử nghiệm**. M3 dùng Vercel cho web và Cloudflare Worker + D1 + Durable Object cho API/MCP/matchmaking; VPS vẫn là phương án triển khai riêng nếu cần. Người chơi dùng **ChatGPT và Claude qua MCP** để thiết kế bot; Brain sử dụng bộ lệnh riêng của game. Demo lõi hoàn tất ở M3; khung xem trận trong chat triển khai tiếp ở M4.

## 1. Kiến trúc và cách chia mô-đun

Dùng **một kho mã chung, các mô-đun có ranh giới rõ**, ban đầu triển khai chung trong một backend.

Công nghệ chọn:

- **TypeScript + pnpm workspace**, Node.js 22.23.1 đồng nhất giữa máy phát triển và server.
- **HTML module + Canvas 2D** cho web, editor và viewer; `packages/ui` giữ helper dùng chung.
- **Cloudflare Worker** cho Web API và điểm kết nối MCP; **D1** lưu dữ liệu và **Durable Object** điều phối FIFO.
- **Vercel** phục vụ web tĩnh; API base được cấu hình bằng `PROMPTCHIEN_API_BASE` lúc build.
- **MCP Streamable HTTP + OAuth 2.1 S256 PKCE**; M3 dùng adapter mỏng để giữ package lõi không phụ thuộc nền tảng.

| Mô-đun | Trách nhiệm |
|---|---|
| **Contracts** | Định dạng bot, Brain, kết quả, replay; JSON Schema và thông tin phiên bản dùng chung |
| **Geometry** | Lưới tam giác, liên kết cạnh, giới hạn kích thước, kiểm tra hình dạng |
| **Brain** | Kiểm tra và thực thi bộ lệnh chiến thuật trong giới hạn cho phép |
| **Battle Engine** | Di chuyển, va chạm, sát thương, phá hủy và quyết định thắng thua |
| **Replay** | Ghi dữ liệu trận, tạo checkpoint, đọc và kiểm chứng replay |
| **Application** | Quản lý bot, validation, simulation, ghép trận, quyền truy cập và lưu trữ |
| **UI** | Battle Viewer, Replay Viewer, Bot Editor và Bot Inspector |
| **Adapters** | Web API, MCP, CLI; chuyển yêu cầu vào các mô-đun dùng chung |

Geometry, Brain, Battle Engine và Replay nằm trong một package lõi, tách thành các mô-đun bên trong. Contracts và UI là các package dùng chung riêng.

**Quy tắc phụ thuộc:**

- Engine nhận dữ liệu và trả kết quả; không truy cập database, mạng hay giao diện.
- Web API và MCP gọi chung Application, dùng cùng luật kiểm tra và quyền truy cập.
- CLI gọi trực tiếp lõi game để chạy được hoàn toàn offline.
- Web và MCP App dùng cùng Viewer; Viewer chỉ hiển thị dữ liệu trận.
- Mỗi mô-đun có đầu vào/đầu ra công khai; kiểm tra import để ngăn phụ thuộc vòng và truy cập xuyên vào phần nội bộ.

Khi cần tăng công suất, mở rộng nhóm tiến trình chạy trận. Chỉ tách thành dịch vụ riêng khi đo được nhu cầu thực tế.

## 2. Chốt thiết kế lõi game và dữ liệu

### Luật khởi đầu

Các giá trị dưới đây nằm tập trung trong `ruleset`, được điều chỉnh bằng thử nghiệm ở M1.

> 📌 **Nguồn sự thật đầy đủ về cân bằng là [can_bang.md](H:/AI/prompt-battle-cty/Docs/can_bang.md).** Bảng dưới chỉ tóm tắt những giá trị engine cần dùng; khi hai tài liệu lệch nhau thì `can_bang.md` thắng. Cơ chế tải trọng Motor nằm ở [gameplay.md](H:/AI/prompt-battle-cty/Docs/gameplay.md) mục 3.4.1.

| Thành phần | Mặc định |
|---|---|
| Ngân sách | Tối đa 60 tam giác/bot |
| Core | Một dấu Core đặt trên một tam giác **chiến đấu** (Búa/Kéo/Bao) — **không được trên Motor**; không tiêu thêm ô |
| Hình dạng | Liên thông qua cạnh; kích thước tối đa 12 × 12 đơn vị cạnh |
| Arena | Một sân trắng, 40 × 40 đơn vị |
| Nhịp mô phỏng | 30 tick/giây; tối đa 120 giây/trận |
| HP mỗi tam giác | Búa **70** · Kéo **105** · Bao **168** · Motor **80**; Core dùng HP của tam giác mang nó |
| Sát thương nền | Búa **24** · Kéo **16** · Bao **10** · Motor **0** |
| Hệ số khắc chế | Lợi thế **×2.0** · cùng loại **×1.0** · bất lợi **×0.5** — lưu dạng số nguyên 1/1000: `2000` / `1000` / `500` |
| Đánh vào Motor | **×1.0** (`1000`) với mọi tam giác chiến đấu — Motor không nằm trong vòng khắc chế |
| Hệ số va chạm | **0.85 → 1.00** (`850 → 1000`) theo vận tốc riêng của bên tấn công; `IMPACT_REF_SPEED = 4000`, M1 đã đo r = 1.00 ở ca chuẩn |
| Hệ số hướng | **0.85 → 1.00** (`850 → 1000`) theo góc giữa hướng mặt tam giác tấn công và hướng đâm; tra bảng 64 hướng, không tính `cos` lúc chạy |
| Cộng hưởng đa dạng | **+12% máu TỐI ĐA** cho mỗi **loại chiến đấu** khác trong vòng 1 hàng xóm giáp cạnh, tối đa **+24%**. Motor **nhận** thưởng nhưng **không được đếm** là một loại. Tính lại **khi cấu trúc thay đổi** (có tam giác chết), không tính mỗi tick, không tính một lần rồi thôi |
| Trần thuần chủng | Một loại chiếm **>65%** → cảnh báo; **>80%** → chặn (công tắc, mặc định chỉ cảnh báo) |
| Tải trọng Motor | Mỗi Motor kéo được **4 tam giác**; hệ số tải = tải thân ÷ sức kéo. **Hệ số tải hiệu dụng = max(hệ số hiện tại, hệ số lúc khóa gói)** — bot không bao giờ nhanh lên nhờ bị đánh gãy |
| Bảng tốc độ theo tải | ≤0.50 → **115%** · 0.50–1.00 → **100%** · 1.00–1.50 → 70% · 1.50–2.00 → 40% · >2.00 → 15% hoặc đứng yên |
| Nhịp đánh | **Mỗi tam giác phòng thủ** nhận tối đa 1 hit mỗi **18 tick** — không tính theo cặp; tăng từ 6 sau đo M1 |
| Chống đứng yên | Nguồn tấn công hồi phục thêm `ceil(30 × (1000 − power di chuyển) / 1000)` tick; đứng yên/hết Motor dùng power 0, đi power 1000 không thêm hồi phục. M1 đo sát thương đứng yên còn 71,49% bên lao vào |
| Mảnh tách rời | Loại khỏi mô phỏng ngay; Viewer cho tan biến ngắn |
| Vùng thu hẹp | Từ giây thứ **60**, bán kính thu từ 28.3 về 4.0; lõi nằm ngoài vòng mất **1.5% máu tối đa mỗi nhịp** (đổi từ "2 máu cố định" để mọi loại lõi có cùng ~2,2 giây ân hạn) |

**Quy tắc đơn vị — bắt buộc:** mọi hệ số trong `ruleset` là **số nguyên đơn vị 1/1000**. Không có số thực trên đường tính sát thương. Trộn số thực vào sẽ khiến công thức chia nguyên cho ra sát thương bằng 0 ở mọi cú đánh — lỗi rất khó tìm vì nhìn công thức thấy đúng. Chi tiết: `can_bang.md` mục 3.6.

Công thức sát thương:

```text
sát thương = floor( sát thương nền × hệ số khắc chế × hệ số va chạm × hệ số hướng ÷ 10^9 )
```

Cả bốn thừa số đều là **số nguyên đơn vị 1/1000** (`2000` / `1000` / `500` cho khắc chế; `850…1000` cho hai hệ số còn lại), nên đây là phép chia số nguyên và `floor` là miễn phí. Xem `can_bang.md` mục 3.6.

Ba loại chiến đấu được cân sức bằng tích số — `máu × sát thương nền = 1680` cho cả Búa, Kéo và Bao — nên không loại nào mạnh hơn loại nào nếu chỉ nhìn chỉ số thô. Bảng sát thương ở `can_bang.md` mục 3.7 là **cú đâm hoàn hảo**; mọi cú đâm thật đều yếu hơn hoặc bằng, nên sát thương trung bình trong trận thấp hơn bảng khoảng 10–20%.

**Lưu ý về hai bảng số nhát ở `can_bang.md` mục 4:** bảng chính tính trên **máu nền** (bot thuần chủng), bảng phụ tính khi **cả hai bên đều có cộng hưởng +24%**. Trong thực chiến gần như luôn dùng bảng phụ. Và khi cả hai bên đều trộn, cộng hưởng **triệt tiêu lẫn nhau** — nó chỉ trừng phạt ai không trộn, chứ không tạo lợi thế cho ai biết trộn.

**Bất biến bắt buộc phải kiểm tra tự động:** cú đâm hời hợt nhất của bên có lợi thế vẫn phải mạnh hơn cú đâm hoàn hảo nhất của bên bất lợi. Vỡ bất biến này là luật Búa–Bao–Kéo mất hết sức nặng (`can_bang.md` mục 3.8).

### Mô phỏng có thể tái hiện chính xác

- Dùng số nguyên theo đơn vị cố định, quy tắc làm tròn rõ ràng và bảng góc quay cố định. Không dùng giờ hệ thống hoặc `Math.random()` trong lõi.
- Mỗi tick thực hiện đúng các bước trong đặc tả; hai Brain đọc cùng trạng thái đầu tick, rồi engine áp dụng hành động và sát thương đồng thời.
- Kiểm tra va chạm bằng hộp bao, sau đó kiểm tra từng tam giác. Chia bước di chuyển và giới hạn tốc độ để ngăn bot xuyên qua nhau.
- Sau phá hủy, tìm lại phần nối với Core và tính lại lực Motor, tốc độ, khả năng xoay. **Cộng hưởng đa dạng cũng tính lại ở đây** — chỉ khi cấu trúc thay đổi, không tính mỗi tick. Vị trí Motor lệch phải tạo ảnh hưởng tương ứng đến chuyển động.
- Hệ số tải hiệu dụng lấy `max()` với hệ số lúc khóa gói, để bot **không bao giờ chạy nhanh hơn** nhờ bị đánh gãy thân (`can_bang.md` mục 6.7).
- Hai Core chết cùng tick tính hòa. Mất toàn bộ Motor hoặc toàn bộ tam giác chiến đấu liên tục 10 giây tính mất khả năng chiến đấu; nếu cả hai cùng đạt ngưỡng thì hòa.
- Hết thời gian, tính điểm bằng **công thức có trọng số** công khai: sát thương đã gây **0.35**, máu lõi còn lại **0.30**, tam giác chiến đấu còn lại **0.20**, Motor còn lại **0.15**. Bằng điểm thì hòa. Không dùng thứ tự ưu tiên kiểu "so lần lượt" — cách đó để bot trâu câu giờ thắng oan, xem [can_bang.md](H:/AI/prompt-battle-cty/Docs/can_bang.md) mục 8.1.
- **Sát thương đã gây chuẩn hóa bằng cách so trực tiếp với đối thủ:** `sát thương mình ÷ max(sát thương mình, sát thương địch)`. Bên gây nhiều hơn được 1.0, bên kia được tỉ lệ của mình; cả hai cùng gây 0 thì cả hai được 0. Không dùng hằng số cố định — nó luôn nằm trong `[0, 1]` và không bao giờ chia cho 0. Ba số còn lại tính theo phần trăm còn lại của chính mình.

### Brain theo bộ lệnh game

Brain là JSON mô tả **trạng thái → điều kiện → hành động**, hỗ trợ tìm địch, tiếp cận, vòng sườn, rút lui và phản công.

- Mỗi tick xét luật theo thứ tự; luật đầu tiên phù hợp tạo một hành động di chuyển và một hành động xoay.
- Cho phép đọc trạng thái bản thân và thông tin đối thủ được engine công bố; không đọc Brain đối thủ.
- Mặc định tối đa 256 nút lệnh, độ sâu 16, 32 biến số nguyên và 1.000 bước xử lý/tick.
- Vượt ngân sách thì bỏ hành động tick đó; vi phạm 30 tick liên tiếp tính thua theo luật công khai.
- Chạy simulation trong tiến trình riêng, giới hạn bộ nhớ và thời gian. Lỗi hoặc timeout của hạ tầng làm job thất bại để chạy lại, không dùng làm căn cứ xử thua.
- Web cung cấp chiến thuật mẫu và thông số dễ chỉnh; AI vẫn có thể tạo Brain mới trong bộ lệnh cho phép.

### Hợp đồng dữ liệu và replay

Công bố các kiểu dữ liệu chính: `BotDefinition`, `BotPackage`, `ValidationReport`, `SimulationJob`, `MatchResult`, `ReplayManifest`.

- Bản nháp có số revision. Sửa bot phải gửi revision đang chỉnh để tránh ghi đè thay đổi mới.
- Package khóa có SHA-256 từ dữ liệu chuẩn hóa; mọi lần sửa sau đó tạo phiên bản mới.
- Validation gắn với đúng hash và ruleset; sửa bot làm kết quả validation cũ hết hiệu lực.
- Trận lưu package của hai bot, seed, engine/ruleset và kết quả. Tách rõ trận thử với trận chính thức.
- Replay lưu chuyển động theo tick, sự kiện damage/phá hủy và checkpoint mỗi giây. Viewer seek từ checkpoint; CLI kiểm chứng bằng cách chạy lại từ đầu.
- Hash replay tính trên dữ liệu mô phỏng, loại các ID và thời gian vận hành để hai lần chạy giống nhau có thể đối chiếu trực tiếp.
- Version độc lập cho engine, ruleset, schema bot, Brain API, replay và MCP API; giữ dữ liệu và bản engine tương ứng để kiểm chứng trận cũ.

## 3. Web, MCP và quyền truy cập

### Luồng sản phẩm

Người chơi tạo hoặc nhập bot → chỉnh hình dạng/chọn chiến thuật → validate → simulate → xem replay → sửa → submit.

`submit` khóa phiên bản đã qua kiểm tra và đưa vào hàng ghép trận FIFO. Ghép hai người khác nhau, cùng engine/ruleset; mỗi người có tối đa một lượt chờ hoặc trận đang chạy.

Trận chính thức chạy trên server theo thời gian thực. Web nhận cập nhật qua SSE riêng của game và làm mượt hình ảnh; mất kết nối thì lấy lại snapshot hoặc replay. Simulation thử và CLI chạy nhanh nhất có thể.

### Tám MCP tools

| Tool | Hành vi |
|---|---|
| `get_rules` | Trả luật, giới hạn, phiên bản, hướng dẫn Brain và ví dụ |
| `create_bot` | Tạo bản nháp thuộc tài khoản đã xác thực |
| `get_bot` | Đọc bot, phiên bản và trạng thái validation/submit |
| `edit_bot` | Cập nhật bản nháp theo revision |
| `validate_bot` | Kiểm tra schema, geometry, Brain và chạy bộ sandbox bắt buộc |
| `simulate_bot` | Chạy thử với bot mẫu hoặc phiên bản đối thủ được phép truy cập |
| `get_replay` | Đọc tiến độ, kết quả, damage map, trang sự kiện và link xem |
| `submit_bot` | Khóa đúng bản đã đạt validation và vào hàng ghép trận |

Công việc dài trả ID và trạng thái `queued/running/completed/failed`. `get_bot` theo dõi validation, `get_replay` theo dõi simulation. Các thao tác ghi có khóa chống lặp để việc gửi lại yêu cầu không tạo bot, job hoặc lượt ghép trận trùng.

### MCP 2026-07-28

- Endpoint chính dùng Streamable HTTP, SDK v2 `createMcpHandler`.
- Hỗ trợ `server/discover`, metadata từng yêu cầu, `resultType` và các trường cache theo chuẩn.
- Nhánh 2026 không phụ thuộc `initialize` hoặc `Mcp-Session-Id`. Bật cơ chế tương thích 2025 có sẵn của SDK cho client cần nó; không đổi phiên bản lõi game theo client. [Thay đổi chuẩn](https://modelcontextprotocol.io/specification/2026-07-28/changelog), [Tương thích SDK](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions)
- Kiểm tra các header giao thức và `Origin`; trả lỗi đúng chuẩn khi header không khớp nội dung. [Quy định HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- Tool trả dữ liệu có cấu trúc, mô tả lỗi có thể sửa và annotations đúng hành vi.
- Công bố `/agent.md`, `/rules`, `/schema/bot.json`, `/schema/replay.json`.
- MCP chỉ hỗ trợ thiết kế, thử nghiệm, submit và phân tích; không có thao tác thay hành động trong trận chính thức.

### Tài khoản và MCP App

- Dùng **Better Auth**, tài khoản thử nghiệm do quản trị tạo, đăng nhập email/mật khẩu và tắt đăng ký công khai.
- MCP dùng OAuth 2.1 với PKCE, CIMD và metadata khám phá; dùng plugin MCP chính thức của Better Auth để chia sẻ tài khoản với web. [Better Auth MCP](https://better-auth.com/docs/plugins/mcp)
- Kiểm tra chủ sở hữu tại Application cho mọi yêu cầu. Bản nháp chỉ chủ sở hữu đọc/sửa; package đã submit và replay chính thức được chia sẻ trong nhóm thử nghiệm.
- Kiểm chứng đăng nhập thực tế trên cả ChatGPT và Claude. [OpenAI Authentication](https://developers.openai.com/apps-sdk/build/auth), [Claude Authentication](https://claude.com/docs/connectors/building/authentication)
- M4 dùng `@modelcontextprotocol/ext-apps` v2, tái sử dụng Viewer để mở replay ngay trong chat. Host không hỗ trợ UI vẫn nhận kết quả và link web. [MCP Apps trong ChatGPT](https://developers.openai.com/apps-sdk/build/chatgpt-ui)

## 4. Triển khai hosted M3

Địa chỉ dự kiến:

- Web: [play.kythuatvang.com](https://play.kythuatvang.com).
- Web API: `/api/v1`.
- MCP: `/mcp`.
- Trang xem lại: `/replays/{replay_id}`.
- Đăng nhập và OAuth dùng cùng tên miền con.

M3 hiện triển khai web tĩnh bằng **Vercel** và API bằng **Cloudflare Worker**. D1 lưu tài khoản, bot, version, submission, OAuth và replay; Durable Object giữ hàng chờ FIFO.

- Public registration bị khóa nếu không đặt secret `INVITE_CODE`; `WEB_ORIGIN` giới hạn CORS. Local Worker dùng D1 local của Wrangler để smoke test trước khi deploy.

- Thêm DNS `play` tại Cloudflare, trỏ về VPS; cấu hình HTTPS và Cloudflare Full (strict).
- API, OAuth và MCP không cache; proxy giữ nguyên header và luồng SSE.
- Package và kết quả lưu trong D1 dưới dạng JSON có giới hạn body 4 MiB; replay hiện lưu JSON để demo, nén/object storage là bước tối ưu sau khi đo dung lượng.
- Giới hạn khởi đầu: 20 tài khoản thử nghiệm, một simulation đang chạy/người, tối đa 10 yêu cầu simulation/phút/người.
- Theo dõi lỗi, thời gian tick, hàng chờ, CPU/RAM và dung lượng replay. Có lệnh sao lưu/khôi phục và quay lại bản triển khai trước.

**Giả định hạ tầng:** VPS Ubuntu/Debian, tham chiếu 2 vCPU/4 GB RAM; cấu hình thật sẽ được kiểm tra trước triển khai. Các con số công suất phải qua benchmark, không coi là khả năng đã được xác nhận.

## 5. Các mốc thực hiện và điều kiện nghiệm thu

**Chỉ sang mốc tiếp theo khi Gate hiện tại đạt và có bằng chứng kiểm tra.**

**Trạng thái 2026-09-22:** M0 đã đạt. M1 có đủ lõi, CLI, 5 bot và bản vẽ gỡ lỗi; **Gate kỹ thuật M1 đạt**: 14/14 nhóm kiểm tra, cùng hash trên Windows/Linux với 100 seed cố định. Bộ vòng tròn 1.000 trận có trung vị 42,27 giây. **Cân bằng chưa đạt toàn bộ tiêu chí** (bot cánh, bot nghiêng 70/30 và tốc độ di chuyển thực); các phép đo và giới hạn ghi ở [M1.md](M1.md). Chưa triển khai M2.

| Mốc | Kết quả bàn giao | Gate |
|---|---|---|
| **M0 — Nền móng** | Workspace, ranh giới mô-đun, schema, ruleset ban đầu, bộ lệnh Brain, lệnh kiểm tra | Schema đọc được, ví dụ hợp lệ, kiểm tra phụ thuộc mô-đun đạt |
| **M1 — Hai bot tự đánh** | Geometry, Brain, engine, phá hủy, replay dữ liệu, CLI và 5 bot mẫu trong spec | Hai bot đánh hết trận; chạy lại cùng kết quả; Windows/Linux cho cùng hash với 100 seed cố định |
| **M2 — Local web lab** | Editor, Inspector, Viewer, replay controls, lưu version và hàng FIFO local | Người không biết code tạo bot, validate, simulate, chỉnh sửa, submit và xem replay hoàn chỉnh trên browser local |
| **M3 — Demo dùng AI** | Account/auth, D1 database, Durable Object matchmaking, tám MCP tools, OAuth, tài liệu agent, Vercel + Cloudflare deployment | ChatGPT và Claude đều thực hiện được tạo → validate → thử → sửa → submit; tải thử đạt trước khi mời người dùng |
| **M4 — Replay trong chat** | Viewer dùng chung qua MCP Apps | Render thật trên host hỗ trợ; play/pause/seek hoạt động; fallback link hoạt động trên client chỉ có tools |

M2 cố ý là web lab local-first: draft, version và queue dùng `localStorage`, còn account, database, auth và matchmaking chính thức là phạm vi M3. Gate M2 không coi các năng lực hosted đó là đã hoàn tất.

Bộ kiểm tra trọng tâm dùng `node:test`, kèm kiểm tra giao diện và hai AI client thực tế:

- Geometry vượt budget, trùng ô, chỉ chạm đỉnh, mất liên thông, Motor không hợp lệ, và **Core đặt trên Motor phải bị từ chối**.
- RPS, cooldown va chạm, hai Core chết đồng thời, tách mảnh, mất Motor và timeout.
- **Cooldown theo tam giác phòng thủ:** một tam giác bị 3 tam giác địch kẹp cùng tick chỉ được nhận **1** hit, không phải 3.
- **Đơn vị hằng số:** mọi hệ số trong `ruleset` phải là số nguyên; chạy một ca chuẩn và đối chiếu ra đúng 48 sát thương cho Búa đánh Kéo hoàn hảo (nếu ra 0 thì đơn vị đang lẫn số thực).
- Cân bằng theo [can_bang.md](H:/AI/prompt-battle-cty/Docs/can_bang.md) mục 10: Búa thuần vs Bao thuần; bot trộn 3 loại vs từng bot thuần; Bao thuần vs Bao thuần; thưởng đa dạng ở mức 8/12/16%; ngưỡng trần thuần chủng; bot 70% Búa + 30% xen kẽ vẫn phải sống được.
- **Tám bài test bổ sung ở `can_bang.md` mục 10 số 12–19:** thời lượng trận (trung vị 40–80 giây); đòn bẩy săn Motor; thủ có được thưởng miễn phí không; vòng sườn còn sống không; thuế hình học; cộng hưởng có thật sự cần không (chạy lại với `DIVERSITY_BONUS_PER_TYPE = 0`); hiệu chuẩn `IMPACT_REF_SPEED` (r trong 0.8–1.2); bị đánh nặng không được nhanh lên.
- Tải trọng: mất một cụm Motor giữa trận phải làm bot rơi hẳn một bậc tốc độ ở nhịp kế tiếp. Và ngược lại — bot quá tải mất 40 tam giác chiến đấu **không được** chạy nhanh hơn lúc đầu (luật `max()`).
- Vùng thu hẹp: lõi ngoài vòng mất máu đúng nhịp bắt đầu, mọi loại lõi có cùng ~2,2 giây ân hạn, và bot phải quay được vào trước khi chết.
- Brain sai lệnh, quá sâu, vượt ngân sách, đứng yên hoặc tránh giao chiến trong bộ sandbox nhiều vị trí/seed.
- Determinism, tính công bằng khi đổi thứ tự xử lý, replay seek và kiểm tra hash.
- Sửa bot trong lúc validate, gọi submit lặp, truy cập bot người khác, token hết hạn và job bị gián đoạn.
- Trên VPS tham chiếu: hai trận đồng thời giữ thời gian xử lý tick p95 dưới 33 ms; nếu chưa đạt thì tối ưu tại mốc hiện tại trước khi mở nhóm thử nghiệm.

Bản demo lõi được nghiệm thu khi **M3 đạt**, đồng thời chứng minh được sáu tiêu chí gameplay ở mục 37 của đặc tả. M4 là bước nâng trải nghiệm tiếp theo.
