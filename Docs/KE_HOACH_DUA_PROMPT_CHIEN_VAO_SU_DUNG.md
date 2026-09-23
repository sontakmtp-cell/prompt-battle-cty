# PROMPT CHIẾN — Kế hoạch đưa vào sử dụng thực tế

**Phạm vi:** thư mục đã clone trên máy Khầy: `D:\AI\prompt-battle-cty` (repo `sontakmtp-cell/prompt-battle-cty`). Bản kiểm tra ban đầu ở nhánh `feature/web-ui-redesign`, commit `6a9eccbb057e2ab3fa624d2e2706d8ef8607e5f8` (23/09/2026). Codex đã được trỏ vào thư mục này; trước khi làm hãy kiểm tra branch, HEAD, thay đổi chưa commit và tài liệu hiện tại. Không tự clone lại repo hoặc chuyển nhánh làm mất việc đang làm.

**Đích phát hành:** người chơi có thể tự đăng ký/đăng nhập bằng tài khoản Google trên web hoặc kết nối AI qua MCP, tạo/chỉnh bot, thử, nộp bản hợp lệ, được ghép với **tài khoản khác trên máy khác**, xem trạng thái và replay của cùng một trận. Kết quả chính thức chỉ do server tạo. Trước khi mở rộng, cần có giới hạn tải, khả năng phục hồi, sao lưu và bằng chứng thử nghiệm trên môi trường thật.

**Quyết định của chủ dự án:** Chỉ **VPS Node + SQLite** giữ dữ liệu tài khoản, bot, hàng chờ, trận và replay; web và MCP cùng gọi API VPS qua HTTPS. **Ngừng dùng Cloudflare Worker/D1/Durable Object** sau khi xác minh không còn client hoặc dữ liệu cần chuyển. Cloudflare vẫn có thể làm DNS/proxy, nhưng không là kho dữ liệu hay nơi chạy API. Đăng ký **mở bằng Google, không dùng mã mời**. Admin có tài khoản với quyền riêng, quản lý qua trang quản trị. **Giữ VPS hiện tại** trong giai đoạn đầu; chỉ xem xét nâng cấp khi có nhiều người chơi và số đo cho thấy cần thiết.

## Chỉ dẫn chung cho agent

- Làm tuần tự các mốc dưới đây; mỗi mốc có PR riêng hoặc commit riêng dễ hoàn nguyên. Không tự merge/deploy production. Báo rõ tệp đổi, migration, lệnh chạy, kết quả, rủi ro còn lại.
- Giữ engine deterministic, ruleset và định dạng replay tương thích; không viết lại engine/UI nếu chỉ cần nối thêm. Không biến `mode=official` từ client thành kết quả đáng tin.
- Dữ liệu M2 trong `localStorage` là phòng thử cá nhân. Server là nguồn duy nhất cho danh tính, bot đã nộp, hàng chờ, trận chính thức và replay chính thức. Cần đường chuyển bản nháp cũ sang tài khoản mới, có xác nhận người dùng trước khi nhập.
- Các thay đổi SQLite phải có migration tăng số, đường triển khai và phương án khôi phục; không sửa migration `0001_m3.sql` trên database đã tồn tại. Loại bỏ tuyến Worker/D1 sau khi kiểm kê đường truy cập và dữ liệu hiện hữu. Không yêu cầu duy trì hai backend song song.
- Google dùng để xác thực danh tính người chơi; OAuth của chính game cho ChatGPT/Claude vẫn hoạt động. Cả web và trang cấp quyền MCP phải dùng được cùng một tài khoản Google và cùng dữ liệu SQLite. Không tự gộp tài khoản cũ với tài khoản Google chỉ vì trùng email.
- Test ở lớp phù hợp với lỗi: integration cho API/hàng chờ, trình duyệt cho hành trình người chơi, benchmark cho tải. Không lấy smoke test cũ làm bằng chứng cho code mới.

## Mốc 0 — Chốt hiện trạng và hợp đồng sản phẩm

**Việc làm**

1. Tại `D:\AI\prompt-battle-cty`, kiểm tra `git status`, branch, HEAD rồi chạy `pnpm check`, `m3:smoke`, `m4:smoke` bằng Node/pnpm đúng phiên bản repo; ghi kết quả baseline. Không ghi đè thay đổi của người đang làm. Kiểm tra cấu hình VPS, Vercel, SQLite đang chạy trước khi chạm production. Xác định các endpoint `workers.dev`/D1 còn được dùng ở đâu; nếu D1 có dữ liệu thật, lập phương án chuyển có kiểm đếm sang SQLite trước khi tắt.
2. Vẽ một hành trình người dùng từ web và từ MCP, xác nhận các trạng thái `draft → validated → queued → matched → running → completed/failed/cancelled`, và định nghĩa ai được xem replay chính thức. Ghi hợp đồng API và hành vi khi tải lại trang/mất mạng.
3. Quyết định hình thức quan sát: demo có thể tính trận nhanh trên server rồi phát replay với nhãn rõ ràng; nếu giữ lời hứa **xem trận chính thức trực tiếp** trong `Docs/PLAN.md`, cần job nền + sự kiện/snapshot hoặc SSE. Không gọi replay đã tính xong là trận live.

**Nghiệm thu:** bản ghi hiện trạng có branch/HEAD và các thay đổi chưa commit, sơ đồ trạng thái, API dự định thêm, chính sách xem replay, kiểm kê D1 và kế hoạch migration. Xác nhận một địa chỉ API/MCP production trên VPS trước khi sửa code.

## Mốc 1 — Một tài khoản và một nguồn dữ liệu cho Web/MCP

**Việc làm**

1. Thêm nút **Tiếp tục với Google** trên web: người chơi xác thực Google lần đầu thì tự tạo tài khoản `player` trong SQLite, lần sau đăng nhập đúng tài khoản cũ; không có trường mã mời. Backend phải xác minh Google ID token ở server (chữ ký, `aud`, `iss`, hạn dùng), lưu Google `sub` làm định danh liên kết, không dùng email làm khóa đăng nhập duy nhất. Sau xác thực, game tạo phiên của chính mình; hỗ trợ đăng xuất/phiên hết hạn, `/api/auth/me`, API bot/version và CORS/cookie đúng origin. Chặn thao tác cần tài khoản khi chưa đăng nhập. [Hướng dẫn Google về kiểm tra ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
2. Sửa trang cấp quyền MCP: người chơi đăng nhập bằng Google trước khi chấp thuận cho ChatGPT/Claude kết nối. Giữ luồng OAuth/PKCE của game dành cho MCP; xác minh web và MCP nhận đúng một `user_id` trong SQLite. Đừng yêu cầu người chơi tạo mật khẩu riêng chỉ để dùng MCP.
3. Kiểm kê tài khoản email/mật khẩu đã có. Nếu cần giữ dữ liệu cũ, thêm thao tác liên kết Google sau khi chủ tài khoản đăng nhập được theo cách cũ hoặc quy trình chuyển do admin xác nhận; tuyệt đối không tự nhận tài khoản theo email Google trùng. Tắt **đăng ký mới** bằng mã mời/email-mật khẩu và gỡ `INVITE_CODE` khỏi luồng tạo tài khoản; chỉ bỏ hẳn đăng nhập cũ sau khi chuyển xong người dùng cần giữ dữ liệu.
4. Editor tải/lưu bản nháp qua API với `revision`, xử lý xung đột khi mở hai tab. Validate và simulate bản nháp qua đúng API của cùng người dùng; phân biệt bản đã lưu, bản đã validate và bản đang sửa.
5. Làm màn hình “Nhập bot từ bản nháp trên máy này” để chuyển dữ liệu M2 lên tài khoản, xem trước và tránh ghi đè/trùng. Giữ các trận thử local ở đúng phạm vi sandbox.
6. Tạo endpoint liệt kê bot/phiên bản của chính người dùng (hiện web chưa có đường truy xuất danh sách sau khi chuyển máy); phân trang nếu dữ liệu có thể tăng.
7. Thêm quyền `admin`/`player` ở SQLite; chỉ nâng quyền tài khoản Google của chủ dự án bằng lệnh quản trị chạy trên VPS sau khi xác minh `sub`, tuyệt đối không cho client tự gửi `role=admin`. Làm trang admin có đăng nhập: tìm/xem tài khoản và trạng thái, số bot, trận, replay, lượt trong queue; khóa/mở tài khoản, thu hồi phiên và hủy lượt chờ kẹt. Không hiển thị mật khẩu/hash/token, không cho sửa kết quả official. Mọi thao tác thay đổi phải có xác nhận và audit log (admin, đối tượng, hành động, thời gian, kết quả). Giới hạn và phân trang dữ liệu; export chỉ khi thực sự cần.

**Nghiệm thu:** Google A đăng nhập lần đầu tự tạo đúng một tài khoản `player`, lần sau giữ nguyên bot; Google B tạo tài khoản khác dù tên/email hiển thị thay đổi; token giả/sai `aud`/hết hạn bị từ chối; không còn mã mời ở giao diện/đăng ký; A tạo bot trên trình duyệt 1, đăng nhập trình duyệt 2 thấy đúng bot và dùng MCP thấy cùng bot; B không xem/sửa được bot A; admin xem và khóa được A, player không vào được trang/API admin; sau khóa, phiên web và MCP cũ của A bị vô hiệu; thao tác admin có audit log; sửa đồng thời báo conflict dễ hiểu.

## Mốc 2 — Hàng chờ và kết quả trận chính thức bền vững

**Việc làm**

1. Web `submit` gọi API server và trả `submissionId`, không gọi `submitOwn/takePair` trên `localStorage` cho trận chính thức. Chặn một tài khoản xếp nhiều lượt đồng thời kể cả khi dùng bot/version khác nhau.
2. Bổ sung `GET /api/v1/submissions` hoặc tương đương: người nộp trước và người nộp sau đều xem được `queued/matched/running/completed/failed`, `matchId`, kết quả/replay. Thêm cancel khi còn `queued`; tạo UI tự cập nhật bằng polling trước, sau đó SSE nếu thật sự cần xem tiến trình live.
3. Thiết kế trạng thái trận trong DB: hai submission, hai package hash cố định, seed, engine/ruleset version, người chơi, trạng thái, timestamp, replay/result. Chỉ server tạo/đánh dấu official. Sửa `/api/simulate` để luôn là trận **test**, bỏ quyền chọn official của caller.
4. Khắc phục sự cố mất đồng bộ: hàng chờ và trạng thái trận đều nằm trong **cùng SQLite trên VPS**, dùng transaction để ghép hai lượt trước khi chạy job. Khi simulation/lưu replay lỗi, cả hai lượt phải vào trạng thái có thể xử lý; retry có giới hạn hoặc hoàn trả lượt rõ ràng. Sau restart, đối chiếu queue và DB, xử lý job dở dang. Dùng khóa/idempotency/transaction phù hợp để hai yêu cầu đến đồng thời không tạo hai trận.
5. Quyền xem: người trong trận luôn lấy được kết quả; quy định rõ replay official công khai hay chỉ trong nhóm thử nghiệm, rồi kiểm tra endpoint đúng chính sách. Link chia sẻ có hạn và không lộ dữ liệu riêng ngoài ý định.

**Nghiệm thu:** hai tài khoản trên hai máy nộp bot và đều thấy cùng `matchId`/kết quả/replay; tài khoản thứ ba bị kiểm soát theo chính sách; submit lặp không nhân đôi; restart trước/sau lúc ghép và lỗi simulation không làm lượt chờ vĩnh viễn. Thêm integration test cho các ca này.

## Mốc 3 — Kiểm soát tải, bảo mật đầu vào và hiệu năng

**Việc làm**

1. Giới hạn `/api/inspect`, `/api/validate`, `/api/simulate`, khởi tạo phiên Google và OAuth registration theo IP/tài khoản; hạn chế số simulation đồng thời, timeout, kích thước phản hồi, số replay lưu. Với khách chưa đăng nhập, chọn hạn mức nhỏ hoặc chỉ cho thử mẫu định sẵn. Trả `429` kèm hướng dẫn thử lại.
2. Kiểm tra đường chạy nặng trên Node/VPS; không để trận dài chạy đồng bộ làm nghẽn các request khác. Nếu cần, chuyển simulation thành job có trạng thái và tiến trình xử lý riêng trên VPS; ghi quyết định kiến trúc bằng số đo.
3. Kiểm tra cookie, CSRF trên thao tác bằng cookie, CORS/Origin, kiểm soát redirect URI OAuth, fetch metadata CIMD, body lớn, ID không thuộc chủ sở hữu, replay share link và lỗi trả về. Không ghi Google ID token, phiên đăng nhập hoặc bí mật OAuth vào log/repo; gỡ các mã mời demo còn nằm trong tài liệu/cấu hình và tắt cách đăng ký cũ sau khi đã chuyển tài khoản cần giữ.
4. **Giữ nguyên VPS hiện có**; đo công suất thực và đặt số job mô phỏng chạy đồng thời thấp theo kết quả (có hàng đợi, giới hạn thời gian, chống quá tải, báo trạng thái chờ). Không lấy gate cũ “10 simulation đồng thời p95 <10 giây” làm lý do bắt buộc nâng VPS trước khi mở thử. Ghi p95 thời gian xử lý và thời gian chờ, CPU/RAM/SQLite, 5xx và queue; thiết lập ngưỡng cần xem xét nâng VPS sau khi có người chơi thật và máy thường xuyên đầy tải hoặc thời gian chờ vượt mức chấp nhận.
5. Dọn tuyến Cloudflare API: bỏ binding/config D1 và Durable Object, các lệnh deploy và tài liệu gây hiểu rằng Worker là production; chuyển mọi URL web/MCP/widget sang API VPS. Chỉ tắt Worker/D1 sau khi kiểm tra dữ liệu cần chuyển, người dùng không còn gọi endpoint cũ và smoke trên VPS đạt. Không xóa dữ liệu cũ trước khi có bản sao an toàn.

**Nghiệm thu:** thử vượt hạn mức nhận 429 hoặc trạng thái chờ rõ ràng, hệ thống vẫn phục vụ health và yêu cầu nhẹ; không có replay tự nhận official qua API public; đo tải trên VPS hiện tại không gây crash, mất job hoặc queue kẹt; ngưỡng đồng thời và điều kiện nâng cấp sau này được ghi trong tài liệu vận hành.

## Mốc 4 — MCP App và hành trình AI thực tế

**Việc làm**

1. Dùng hai tài khoản Google thử trên ChatGPT và Claude thật: màn hình cấp quyền MCP phải có nút Google; sau đăng nhập, game hoàn tất OAuth/PKCE rồi chạy `get_rules → create_bot → validate_bot → simulate_bot → get_replay → edit_bot → submit_bot`; kiểm tra việc làm mới connector và trường hợp token hết hạn.
2. Mở `open_game` và `render_replay` trong host thật; xác nhận panel hiện, nút play/pause/seek, xem trận đã ghép và fallback link hoạt động. Nếu host chặn iframe hoặc nội dung nhúng, sửa resource/widget theo thực tế và thử lại; không lấy `resources/read` pass làm bằng chứng UI đã chạy.
3. Đồng bộ trạng thái web với bot do AI tạo: mở web có thể tìm/sửa bot đó; AI xem được trận của bot web. Cập nhật `/agent.md`, ví dụ workflow và báo lỗi dễ sửa.

**Nghiệm thu:** video/ảnh hoặc checklist test hai host và hai tài khoản; cả luồng MCP tools-only lẫn MCP App UI đều có đường tới kết quả; cùng bot/trận hiển thị thống nhất giữa web và AI.

## Mốc 5 — Vận hành và phát hành nhóm thử nghiệm

**Việc làm**

1. CI trên PR: build/type/schema/boundaries/test, integration API Node, kiểm tra đóng gói web/widget; smoke staging sau deploy. Khóa phiên bản Node/pnpm đúng repo.
2. Sao lưu tự động SQLite bằng cách nhất quán khi DB đang hoạt động, lưu bản sao ngoài VPS và thử **khôi phục vào môi trường mới**; theo dõi dung lượng replay/DB, thiết lập lưu giữ và dọn dữ liệu hết hạn. Viết cách rollback app và migration tương thích hai chiều trong thời gian chuyển phiên bản.
3. Monitoring và cảnh báo cho 5xx, p95 simulation, độ dài queue, job `running` quá hạn, RAM/CPU, dung lượng DB. Có health/readiness cho SQLite và tiến trình xử lý trận, không chỉ trả `ok` tĩnh.
4. Chạy thử bằng ít nhất 2 tài khoản Google thật, hai máy/trình duyệt: tạo → thử → nộp → ghép → xem replay; thử reload, mất mạng, đăng xuất, session hết hạn, server restart. Mở đăng ký Google nhưng giới hạn tốc độ và số trận chạy song song theo sức VPS hiện có; quan sát trước khi tăng hạn mức, không nâng VPS ở mốc này.

**Nghiệm thu cuối:** các gate M1–M4 còn hiệu lực sau khi cập nhật cho tuyến VPS hiện có và Google Sign-In; mốc 1–4 đạt; đăng ký Google và trang admin hoạt động; không còn lượt chờ kẹt, dữ liệu SQLite khôi phục được, thử nghiệm hai AI host đạt, tải thử không làm VPS mất ổn định, mọi client production dùng API VPS, có đường rollback và người chịu trách nhiệm xử lý khi lỗi. Nâng VPS là quyết định về sau dựa trên số đo và số người chơi.

## Thứ tự giao việc gợi ý

Giao từng mốc theo thứ tự **0 → 1 → 2 → 3 → 4 → 5**. Mốc 1 và 2 là điều kiện để gọi đây là game nhiều người thật; mốc 3–5 là điều kiện để mở rộng ngoài nhóm thử nghiệm. Có thể tách Mốc 2 thành PR API/schema, PR queue/recovery và PR web/UI, nhưng chỉ nghiệm thu khi chạy được một trận hai người từ đầu đến cuối.

## Cơ sở kiểm tra

- Web M2 lưu queue và bot ở browser: `apps/web/src/main.ts`, `apps/web/src/store.ts`, `apps/web/src/api.ts`.
- Server có account, MCP, queue và replay nhưng thiếu luồng xem trạng thái cho cả hai phía: `apps/api/src/index.mjs`, `apps/api/src/match-queue.mjs`, `apps/api/src/node.mjs`.
- M3 ghi VPS hiện tại 1 vCPU đạt smoke nhưng chưa đạt gate tải cũ; chủ dự án đã chọn giữ VPS này và kiểm soát số job đồng thời. M4 ghi widget chưa thử host thật: `Docs/M3.md`, `Docs/M4.md`.
- `Docs/PLAN.md` nêu trận server/live, giới hạn tải, backup và thử hai host; đối chiếu khi triển khai để không nhầm mục tiêu với demo local.
