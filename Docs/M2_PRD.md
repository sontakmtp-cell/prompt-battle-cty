# PRD delta — Mốc 2: hàng chờ và trận official bền vững

**Phạm vi:** kế hoạch phát hành Mốc 2, bổ sung trên M0/M1. Nguồn yêu cầu: [kế hoạch phát hành](KE_HOACH_DUA_PROMPT_CHIEN_VAO_SU_DUNG.md#user-content-mốc-2--hàng-chờ-và-kết-quả-trận-chính-thức-bền-vững) và các quyết định đã chốt tại [M0 Release, mục 4–6](M0_RELEASE.md). Dùng Node + SQLite trên VPS, web Vercel và engine xác định hiện có; không đổi nhà cung cấp hoặc nâng VPS.

## Vấn đề

- Nộp từ Web Lab vẫn ghi hàng chờ vào `localStorage`; người đã đăng nhập còn nhận thông báo hàng chờ official chưa nối tài khoản. API có submit server nhưng chưa có API đọc trạng thái hoặc hủy cho người chơi.
- SQLite có hàng `submissions` và `waiting_submissions`, nhưng chưa ghép chúng cùng trạng thái trận trong một luồng giao dịch/phục hồi. Ghép cặp xóa hàng chờ trước khi trận và replay được lưu; restart có thể để lượt kẹt hoặc mất dấu tiến trình.
- Chặn trùng hiện tập trung vào trạng thái `queued`, chưa bao phủ `matched/running`. Client còn gửi `mode=official` cho API mô phỏng thử, còn replay official đọc được bởi mọi tài khoản đã đăng nhập.

## Mục tiêu và người dùng

Người chơi Google có thể nộp một version bot đã validate, xem cùng một trạng thái và kết quả từ web/API/MCP, hủy khi còn chờ, và mở lại replay sau khi tải lại trang hoặc backend khởi động lại. Server là nguồn duy nhất tạo trận official; hàng thử local vẫn được ghi rõ là thử trên thiết bị.

**Câu chuyện người dùng:**

1. Là người chơi, tao chọn bot đã validate và nộp; nếu mất mạng rồi gửi lại cùng yêu cầu thì vẫn nhận đúng `submissionId`.
2. Là một trong hai người được ghép, tao xem được trạng thái, `matchId`, kết quả và replay của trận từ tài khoản của tao.
3. Là người đang chờ, tao hủy được lượt chưa ghép; sau khi ghép/chạy, giao diện báo rõ không thể hủy.
4. Là người chơi sau lỗi hoặc restart, tao thấy kết quả phục hồi hoặc trạng thái `failed` có lý do và có thể nộp lượt mới.
5. Là người ngoài trận, tao không đọc được dữ liệu official bằng cách đoán ID; chỉ link chia sẻ có chữ ký và hạn dùng mới cho phép xem replay được chia sẻ.

## Yêu cầu theo mức ưu tiên

### P0 — bắt buộc để phát hành M2

- **Submit official:** yêu cầu phiên đăng nhập và bot/version thuộc chính tài khoản, validate đúng revision/hash. Chỉ server được đánh dấu official. `POST /api/v1/bots/{id}/submit` nhận `Idempotency-Key`; cùng key trả cùng `submissionId`. Mỗi user chỉ có một lượt `queued|matched|running`, bất kể bot/version; yêu cầu khác trong lúc bận trả `409`. FIFO chỉ ghép hai user khác nhau.
- **Trạng thái bền vững:** dùng một nguồn dữ liệu SQLite cho submission, hàng chờ, match/job và kết quả. Luồng là `queued → matched → running → completed|failed`, hoặc `queued → cancelled`. Trận lưu bất biến hai user, hai submission/version và package hash, seed, engine/ruleset version, thời điểm, kết quả và replay. Lưu cặp/trạng thái trước khi chạy mô phỏng.
- **Đọc và hủy:** có `GET /api/v1/submissions?cursor=&limit=`, `GET /api/v1/submissions/{id}` và `POST /api/v1/submissions/{id}/cancel`. Người chơi chỉ đọc submission của mình; chỉ hủy được `queued`. Hủy lặp là idempotent; tranh chấp giữa hủy và ghép chỉ có một kết quả hợp lệ. `GET /api/v1/matches/{id}` và replay chỉ cho người tham gia.
- **Phục hồi/lỗi:** sau restart, lượt `queued` giữ nguyên ID và tiếp tục đủ điều kiện ghép; `matched/running` được phục hồi bằng đúng snapshot và seed, không tạo trận/replay official trùng. Thử lại tự động tối đa một lần; nếu vẫn lỗi, cả hai submission thành `failed` có lý do và được giải phóng để nộp lại. Không để trạng thái active treo vô hạn.
- **Quyền replay:** replay official chỉ đọc trực tiếp bởi hai người tham gia. Người tham gia có thể tạo link chia sẻ ký số, hết hạn sau 24 giờ; link chỉ cấp quyền xem replay được chọn, không cấp quyền bot nháp, tài khoản, phiên hay token. Tài khoản thứ ba không có link bị từ chối. Không công khai danh sách trận.
- **Test/official tách biệt:** `/api/simulate` luôn trả trận `test`, bất kể client gửi `mode`; endpoint này không tạo hoặc ghi kết quả official. Official chỉ phát sinh từ submit đã xác thực và ghép trên server.
- **Tương thích dữ liệu:** migration mới, không giả định DB rỗng và không xóa lịch sử M0/M1. Trước unique constraint mới, kiểm kê và ánh xạ các lượt `queued/matched` cũ; hàng không thể khôi phục được giữ lại và kết thúc `failed` với lý do thay vì bị bỏ mất.
- **Web:** nút nộp của người đăng nhập gửi version cloud đã validate, không gọi `submitOwn/takePair` local cho official. Khi tải/mở lại trang, lấy trạng thái từ API. Web và MCP dùng chung user, submission và match trong SQLite; không có queue official riêng theo client.

### P1 — cần cho trải nghiệm và vận hành

- Trên tab **Hàng chờ**, tách rõ khu **Official trên tài khoản** và **Thử trên thiết bị này**. Mỗi lượt official hiển thị trạng thái tiếng Việt, thời điểm nộp, `submissionId`/`matchId`, lỗi có hướng dẫn; `queued` có nút Hủy, `completed` có nút Xem replay, `matched/running` không hiện nút hủy.
- Khi trang đang mở và hiện ra trước mắt, polling trạng thái mỗi 2–3 giây; tăng khoảng chờ khi lỗi mạng, dừng khi tab ẩn và tải lại ngay khi người dùng quay lại. Mục tiêu: 95% thay đổi trạng thái hiện trên UI trong 5 giây khi mạng/API hoạt động. Không dùng SSE trong M2.
- Hiển thị phản hồi dễ hiểu cho đăng nhập hết hạn (`401`), quyền sai (`403/404`), lượt/revision xung đột (`409`), bot không đạt (`422`) và lỗi hệ thống. Lỗi mạng khi POST phải gửi lại cùng idempotency key, không tự tạo lượt mới.
- Giữ quyền admin chỉ để xem metadata vận hành và hủy lượt chờ theo quyền hiện có; không cho sửa kết quả official. Các thay đổi admin vẫn có xác nhận và audit.

### P2 — hoãn, chỉ làm khi có bằng chứng cần thiết

- SSE/tiến trình live chỉ xem xét nếu đo được polling không đạt mục tiêu 5 giây hoặc tạo tải API đáng kể. M2 phát replay đã tính xong; hoạt ảnh viewer không được gọi là trận live.

## Bố cục và trạng thái giao diện

Tận dụng trang Hàng chờ và viewer hiện có, không thêm thư viện UI. Khu official ưu tiên khi đăng nhập; người chưa đăng nhập thấy lời mời đăng nhập, còn queue local luôn có nhãn phạm vi thiết bị. Một thẻ mỗi submission có trạng thái, hành động hợp lệ và nội dung kết thúc. Khi `completed`, cùng thẻ mở kết quả và replay; khi `failed/cancelled`, nêu lý do/trạng thái cuối và đường nộp lại. Không trộn lượt local với ID hoặc kết quả official.

## Tiêu chí nghiệm thu

1. Hai tài khoản khác nhau submit version hợp lệ: mỗi POST trả ID ổn định; cả hai GET thấy cùng `matchId`, trạng thái cuối, kết quả và replay. User thứ ba không đọc match/replay trực tiếp.
2. Gửi song song 20 lần cùng idempotency key tạo đúng một submission. Cùng user gửi bot/version khác trong lúc active nhận `409`; sau `completed/failed/cancelled`, user nộp lượt mới được.
3. Submit của người thứ hai đồng thời với cancel của người đầu cho đúng một nhánh: hoặc cả lượt bị hủy trước khi ghép, hoặc cả hai được ghép; không có match mồ côi hay một phía bị kẹt.
4. Integration test restart trước ghép, sau ghép, trong lúc chạy và sau khi replay lưu: trong 60 giây mỗi lượt active tiếp tục được xử lý hoặc thành `failed` có lý do; ID/seed/hash không đổi, không có replay official trùng, không có lượt active treo. Lỗi mô phỏng/lưu replay ảnh hưởng cả hai phía và giải phóng họ sau retry giới hạn.
5. Replay API từ người ngoài trả `404`; link hợp lệ xem được đúng replay trong 24 giờ; link sai/hết hạn bị từ chối. Nội dung/link không để lộ email Google, session, token hay quyền truy cập bot khác.
6. Gửi `mode=official` tới `/api/simulate` vẫn chỉ ra `test` hoặc bị từ chối; không tạo match/replay official.
7. Tải lại trang không mất trạng thái server; UI đạt mục tiêu polling; queue local không được trình bày như trận official.
8. Chạy migration trên bản sao SQLite có dữ liệu cũ: giữ nguyên user/bot/replay/submission lịch sử, không còn hàng mồ côi, `PRAGMA integrity_check` trả `ok`; có backup và đường rollback trước migration production. `pnpm check` và integration tests M2 đều pass.

## Giả định và câu hỏi mở

- Đóng thử nghiệm theo chính sách M0: chỉ người trong trận xem replay trực tiếp; chia sẻ là hành động riêng, link ký số 24 giờ. Trận được tính trước và phục hồi bằng engine/version đã khóa.
- Không có hệ thống credit/lệ phí; `failed` không mất lượt trả phí. Hết trạng thái active là người chơi có thể nộp lại.
- M1 giữ nguyên Node + SQLite, Vercel, bot cloud và đăng nhập Google; không chuyển dữ liệu D1, không tắt Worker trong M2, không nâng VPS.
- Không còn câu hỏi sản phẩm chặn triển khai. Cần preflight vận hành cho các hàng active cũ trước khi áp migration; đây là gate bảo toàn dữ liệu, không phải quyết định sản phẩm mới.
