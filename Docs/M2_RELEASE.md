# Bàn giao Mốc 2 — hàng chờ và trận official

## Phạm vi và hiện trạng ban đầu

- Branch `real-play`, HEAD trước khi sửa `50ccd6e4494042e0b4cf6e7868c78be0e833505d`; working tree ban đầu sạch. Không clone lại, không thay engine deterministic. M2 được đóng bằng commit `d5c9a84a9b949f0f9eb4865344e3af769d6201b6`, sau đó được phát hành theo ủy quyền riêng của Khầy; không merge.
- Runtime phát hành vẫn là VPS Node + SQLite; web Vercel gọi API VPS. Dữ liệu M1 trong SQLite được giữ. Worker/D1 là tuyến legacy để kiểm kê ở M3, không thuộc thay đổi M2.
- Kiểm kê VPS trước khi sửa (chỉ đọc): `PRAGMA integrity_check=ok`, 18 submission `matched`, 1 `queued`, 1 `failed`, 1 row `waiting_submissions`, không có `matched` thiếu replay. Migration được thử trên bản sao SQLite trước khi chạy trên VPS.

## Tệp thay đổi

| Nhóm | Tệp |
|---|---|
| Yêu cầu, thiết kế, bàn giao | `Docs/M2_PRD.md`, `Docs/M2_DESIGN.md`, `Docs/M2_RELEASE.md` |
| API và migration | `apps/api/node-migrations/0004_official_matches.sql`, `apps/api/src/node.mjs`, `apps/api/src/index.mjs`, `apps/api/src/m3-contract.mjs` |
| Web và widget sinh từ build | `apps/web/index.html`, `apps/web/src/api.ts`, `apps/web/src/main.ts`, `apps/api/src/m4-game-widget.mjs` |
| Kiểm thử/smoke | `tests/api-queue.test.mjs`, `tests/web-api.test.mjs`, `tools/m3-smoke.mjs` |

## Hợp đồng API và migration

- `POST /api/v1/bots/{id}/submit` cần phiên tài khoản, `{revision}` và header `Idempotency-Key`; trả `202` với `submissionId`, `status`, `createdAt`, `matchId` nếu đã ghép. Gửi lại cùng khóa và bot/revision trả cùng lượt; khóa dùng cho payload khác hoặc tài khoản đã có lượt active trả `409`.
- `GET /api/v1/submissions` và `GET /api/v1/submissions/{id}` chỉ trả lượt của chính tài khoản, gồm trạng thái, vị trí chờ, `matchId`, kết quả và `replayId`/`replayUrl` khi hoàn tất. `POST /api/v1/submissions/{id}/cancel` chỉ hủy `queued`, gọi lại sau khi đã hủy không tạo tác dụng phụ. `GET /api/v1/matches/{id}` và replay official chỉ cho hai người tham gia. Người tham gia có thể tạo link replay ký số 24 giờ bằng `POST /api/v1/replays/{id}/share`.
- `/api/simulate` luôn tạo trận `test` kể cả khi client gửi `mode=official`. MCP `submit_bot`, `list_submissions`, `get_submission`, `cancel_submission`, `get_replay` dùng cùng SQLite và quyền với REST.
- Khi worker nhận job, cả match và hai submission cùng chuyển `running`; khi lỗi còn lượt thử, chúng cùng trở lại `matched`. Giao dịch submit kiểm tra lại revision hiện tại sau bước đọc khóa idempotency, nên bot bị chỉnh đúng lúc nộp sẽ trả `409` nhưng lần gửi lại cùng khóa cũ vẫn nhận đúng lượt cũ.
- Migration `0004` tạo `official_matches`, dùng `submissions` làm hàng chờ, thêm ràng buộc một lượt `queued|matched|running` mỗi user và giữ bảng chờ cũ dưới tên `waiting_submissions_m1_legacy`. Bảng cũ có `migration_status`/`migration_error` cho từng hàng: hàng hợp lệ ghi `restored`; thiếu user/version, version thuộc user khác hoặc xung đột dữ liệu ghi `rejected` cùng lý do, không tự tạo version giả. Nó đối chiếu participant, version và hash replay cũ trước khi ghi nhận trận hoàn tất; submission `matched` cũ không khôi phục hợp lệ chuyển `failed` có mã lý do, lịch sử gốc vẫn còn. Tạo cặp, snapshot, hủy và chốt replay/result dùng giao dịch SQLite. Job dở dang phục hồi từ snapshot/seed bất biến, chạy tối đa hai lần rồi kết thúc `failed` cho cả hai.
- Trước khi áp lên VPS: lấy backup SQLite nhất quán (cả WAL), lưu bản code/env tương ứng, kiểm tra counts và `integrity_check`, chạy thử migration trên bản sao, rồi mới khởi động mã M2. Rollback bằng cách dừng service và khôi phục backup DB cùng code/env; không có down migration xóa dữ liệu.

## Kiểm tra đã chạy

Các lệnh dưới đây dùng Node 22.23.1 và pnpm 10.33.0 theo `package.json` (shim tại `%TEMP%\promptchien-m0-tools` trên PATH):

| Lệnh | Kết quả |
|---|---|
| `pnpm.cmd check` | Đạt: build, 10 schema, module boundaries, 22/22 test; lặp lại 3 lần liên tiếp sau khi sửa đồng bộ test |
| `pnpm.cmd m3:smoke` | Đạt: tài khoản, MCP, CRUD, replay và ghép hai người |
| `pnpm.cmd m4:smoke` | Đạt: widget MCP, viewer, tools-only fallback |
| `node --test tests/api-queue.test.mjs tests/web-api.test.mjs` | Đạt: 3/3 test tập trung |
| `git diff --check` | Đạt: không có lỗi khoảng trắng |

Integration test bao gồm migration M1→M2 trên DB có dữ liệu, `integrity_check`, 20 submit song song cùng khóa, gửi lại sau khi bot đổi, tranh chấp hủy/ghép, phục hồi sau restart ở `matched/running`, seed/snapshot không đổi, lỗi mô phỏng hai lần, replay riêng tư, link chia sẻ sai/hết hạn và `/api/simulate` chỉ tạo `test`. QA lượt đầu thử trên browser local với hai tài khoản giả lập: submit→queued→completed, tải lại giữ trạng thái, xem bot/replay, chia sẻ, hủy và phân biệt hàng local.

QA lượt hai cố ý gây lỗi giữa migration trên DB v3 tạm: Node thoát với lỗi nhưng `user_version` vẫn là 3, không có cột/bảng M2, tên bảng chờ và submission nguồn giữ nguyên. Đây là bằng chứng transaction rollback; không thử lỗi trên VPS. QA cũng kiểm tra hai tài khoản A/B local nhận cùng `matchId`/kết quả sau polling và mở được replay.

## Phát hành production ngày 25/09/2026

- Đã push commit `d5c9a84` lên `origin/real-play`. Vercel tự build preview `3FxzAkb7E6BAW1kAzMmpiwCrtBVN` từ đúng commit; sau khi VPS khỏe, promote preview thành production `67H64o4GmMhSFTLjq1qNwg3ybhSA` tại `https://prompt-battle-cty.vercel.app/`. Dự án là `sontaks-projects/prompt-battle-cty`.
- Trên VPS, backup code/env trước cutover tại `/opt/promptchien-backups/m2-code-before-20260925T140052Z.tar.gz` và `m2-env-before-20260925T140052Z`; backup SQLite ngay sau khi dừng service tại `/opt/promptchien-backups/m2-cutover-20260925T142435Z.sqlite`. Bản sao DB chạy migration thử: schema 3→4, `integrity_check=ok`, giữ 36 users, 50 bots, 20 submissions, 61 replays, tạo 9 official matches từ lịch sử, còn 1 lượt queued legacy.
- Mã M2 triển khai tại `/opt/promptchien`; `pnpm build`, `GET /healthz`, `node /tmp/promptchien-m2-inspect.mjs /opt/promptchien/data/promptchien.sqlite` và `systemctl is-active promptchien-api` đều đạt. Sau phép thử thật: schema 4, `integrity_check=ok`, 37 users, 51 bots, 23 submissions, 64 replays, 11 official matches; 22 lượt completed, 1 failed cũ, không có lượt active trùng hoặc submission mồ côi. Service active, log không có lỗi mới.
- Web chính có giao diện hàng chờ M2; `curl.exe -fsS https://api.kythuatvang.com/healthz` trả `ok`, `curl.exe -sS -o NUL -w '%{http_code}' https://prompt-battle-cty.vercel.app/api/auth/google-config` trả `200`, `/api/v1/submissions` khi chưa đăng nhập trả `401`. Khầy kiểm tra bằng hai tài khoản Google trên hai thiết bị thật: cùng `matchId`, cả hai xem được replay.

## Nghiệm thu và rủi ro còn lại

- **Đạt:** API/Web/MCP cùng một queue SQLite; một tài khoản chỉ có một lượt active; ghép hai user; kết quả/replay cùng `matchId`; tài khoản thứ ba bị chặn trong integration test; submit lặp không nhân đôi; cancel và restart không tạo lượt kẹt; trận test không tự nhận official; dữ liệu cũ được giữ hoặc đóng có lý do. Production đã có trận hai tài khoản Google trên hai thiết bị với cùng `matchId` và replay.
- **Giới hạn xác minh:** từ xa đã đối chiếu trạng thái DB sau phép thử và nhận kết quả trực tiếp từ Khầy; không tự điều khiển cả hai thiết bị. Kiểm tra tài khoản thứ ba, mất mạng và restart giữa trận vẫn là integration test local, chưa cố ý gây gián đoạn production.
- **Rủi ro:** VPS hiện tại 1 vCPU; worker tuần tự một trận để bảo vệ API, nên hàng chờ có thể tăng khi nhiều người cùng nộp. M3 sẽ đo tải, giới hạn đầu vào và quyết định nâng VPS bằng số liệu; M3 cũng kiểm kê rồi mới dọn Worker/D1. M4 tiếp tục xác nhận đường dùng trên hai AI host.
- Backup cutover nằm trên cùng VPS. Nếu khôi phục nguyên DB từ backup sau khi đã có trận M2 mới, các lượt mới sẽ mất; khi cần rollback phải dừng ghi và xử lý dữ liệu phát sinh sau cutover. M5 sẽ bổ sung backup ngoài VPS và diễn tập khôi phục.
