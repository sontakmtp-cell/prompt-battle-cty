# M0 phát hành — hiện trạng và hợp đồng (2026-09-23)

## 1. Baseline trước khi sửa

- Repo `D:\AI\prompt-battle-cty`; branch `feature/web-ui-redesign`; HEAD `6a9eccbb057e2ab3fa624d2e2706d8ef8607e5f8`.
- `git status --short` chỉ có `?? Docs/KE_HOACH_DUA_PROMPT_CHIEN_VAO_SU_DUNG.md` (tệp kế hoạch người dùng đưa, giữ nguyên).
- Shell mặc định là Node v24.18.0/pnpm 11.25.0, không khớp repo. Baseline chạy bằng Node v22.23.1 và pnpm 10.33.0 từ cache máy, qua shim tạm ngoài repo.
- `pnpm check`: 18 pass, 0 fail; `pnpm m3:smoke`: pass; `pnpm m4:smoke`: pass. Hai smoke chạy trên Node API cục bộ, SQLite tạm ở `%TEMP%`, cổng 18787. Chúng tạo tài khoản bằng invite code cũ, **không** chứng minh Google, admin, phục hồi queue hay client production.
- Đọc kiểm tra không ghi production: `https://api.kythuatvang.com/healthz` và `https://promptchien-api.sontakmtp.workers.dev/healthz` đều 200 (`mcpApi: 1.0.0`); `https://prompt-battle-cty.vercel.app/runtime-config.js` trỏ API về `https://api.kythuatvang.com`. Qua SSH chỉ đọc: service `promptchien-api` đang `active`, chạy `/usr/bin/node /opt/promptchien/apps/api/src/node.mjs`, Node v22.23.2, DB tại `/opt/promptchien/data/promptchien.sqlite`; `PRAGMA integrity_check` trả `ok`. Bản ghi M3 về 1 vCPU/1,9 GiB chưa đo lại.

## 2. Sai khác giữa kế hoạch cũ và thực tế

- `PLAN.md`/M3 còn mô tả Worker+D1+DO và đăng ký bằng mã mời. `apps/api/wrangler.jsonc` vẫn khai báo D1/DO; Worker URL vẫn trả health 200. Vercel production hiện trỏ API tới VPS; widget M4 cũng nhúng URL VPS. `apps/web/src/main.ts` vẫn giữ bot/queue trong trình duyệt và gọi `/api/simulate` với `mode=official`; `scripts/web.mjs` và `apps/api/src/index.mjs` hiện nhận mode đó. Vì vậy nhãn official do client đưa **chưa đáng tin**.
- Node API dùng cùng handler Worker và SQLite (`apps/api/src/node.mjs`), nhưng queue nằm ở bảng `waiting_submissions` tạo khi khởi động, tách khỏi trạng thái `submissions`. `submitBot` xóa cặp khỏi hàng chờ trước khi tính/lưu replay; nếu lỗi, chỉ submission của người nộp sau thành `failed`, người trước có thể kẹt `queued`. Chỉ người nộp sau nhận `matchId` ngay; không có API liệt kê trạng thái submission cho người trước.
- `getReplay` hiện cho mọi tài khoản đã đăng nhập đọc replay `official=1`; đây chưa phải chính sách phát hành được chốt dưới đây. `PLAN.md` từng hứa xem live qua SSE, nhưng handler hiện tính xong trận rồi mới lưu replay; không có stream trận live.

## 3. Kiểm kê dữ liệu trước khi bỏ Worker/D1

| Nguồn | Bằng chứng | Việc còn phải xác nhận |
|---|---|---|
| Vercel web | `runtime-config.js` public trỏ VPS | Kiểm tra cấu hình build của lần deploy kế tiếp và client cache cũ. |
| Worker public | `workers.dev/healthz` vẫn 200 | Kiểm tra access log/traffic, MCP connector và link cũ; chưa tắt. |
| D1 local Wrangler | File SQLite local đọc read-only: 8 users, 14 bots, 12 bot_versions, 6 submissions, 8 replays, 5 oauth_clients | Đây là dữ liệu **local**, không suy ra D1 remote; giữ nguyên file. |
| DO local Wrangler | File queue SQLite local đọc read-only: 0 `waiting_submissions` | Không suy ra DO remote rỗng. |
| D1 remote/DO | Repo có database ID D1; Worker URL vẫn hoạt động | Chủ dự án xác nhận đây là dữ liệu thử **không cần chuyển**; không cần đọc/nhập D1 để xây backend VPS mới. Chỉ kiểm tra client/traffic trước khi tắt tuyến cũ. |
| VPS SQLite | SSH chỉ đọc: DB 34 users, 49 bots, 42 bot_versions, 20 submissions, 61 replays, 1 waiting; integrity `ok`. 18 `matched`, 1 `queued`, 1 `failed`; không có queued thiếu waiting, waiting mồ côi, matched thiếu replay, duplicate queued user hay match chỉ có một phía. API `index.mjs` và Node adapter khớp repo; `0001_m3.sql` chỉ khác xuống dòng CRLF/LF. | Chủ dự án xác nhận toàn bộ dữ liệu VPS là dữ liệu thử có thể bỏ. Chưa xóa DB hoặc kiểm tra Nginx/backup/restore. |

Không nhập dữ liệu D1/DO vào VPS theo quyết định của chủ dự án. Chủ dự án cũng xác nhận dữ liệu SQLite VPS hiện tại là dữ liệu thử, có thể khởi tạo lại khi triển khai bản mới. **Chưa xóa DB VPS trong M0** vì thay đổi code chưa deploy; trước khi reset vẫn lưu snapshot để quay lại nếu phát hiện sai môi trường. Chỉ bỏ binding/deploy Worker sau khi các client đã chuyển tuyến và smoke VPS đạt.

## 4. Hành trình và trạng thái đã chốt

Web: Google → phiên game → tạo/nhập nháp có xác nhận → lưu bot theo `revision` → validate đúng revision/hash → simulate **test** → submit version đã khóa → đọc trạng thái → xem replay đã tính. MCP: Google trên trang cấp quyền → OAuth/PKCE của game → cùng `user_id` SQLite → `get_rules/create_bot/edit_bot/validate_bot/simulate_bot/submit_bot/get_replay` → cùng submission/replay. Admin dùng Google và quyền `admin` do lệnh quản trị phía server cấp; không nhận role từ client.

```text
bot:        draft --validate đúng revision/hash--> validated --sửa--> draft mới
submission: validated --submit--> queued --ghép transaction--> matched
                                      | cancel                 | job bắt đầu
                                      v                        v
                                  cancelled                  running
                                                               | thành công / lỗi có lưu trạng thái
                                                               v
                                                       completed / failed
```

Mỗi tài khoản tối đa một submission `queued|matched|running`. Hai version/package hash, seed, engine/ruleset và hai user bất biến từ lúc `matched`. Không client nào được đặt `official`; server mới tạo kết quả chính thức. Simulation thử luôn `test`. Reload hoặc mất mạng: đọc lại `GET /api/v1/submissions` và `GET /api/v1/matches/{id}` từ SQLite; polling có backoff, không tạo lượt mới. Nếu mạng mất trong lúc POST, gửi lại cùng `Idempotency-Key`; server trả cùng `submissionId`. `failed/cancelled` có lý do và trạng thái kết thúc, không để lượt kẹt.

**Quyền replay:** người tham gia trận xem được official bằng phiên web/MCP. Người khác chỉ xem qua link chia sẻ có chữ ký, hạn 24 giờ do người tham gia tạo; link không cấp quyền xem nháp, token hay dữ liệu riêng khác. Admin đọc metadata để vận hành; mọi thao tác admin thay đổi có audit. Hành vi hiện tại `official=1` cho mọi tài khoản đọc là lỗ hổng cần sửa ở M2.

**Hình thức quan sát:** bản phát hành đầu tính trận trên server rồi phát replay có nhãn “trận đã tính”; Viewer có thể phát theo nhịp 30 tick/giây nhưng không được gọi là live. Trận live chỉ đưa vào phạm vi sau khi có job nền, snapshot/sự kiện hoặc SSE và thử nối lại sau mất mạng.

## 5. Hợp đồng API dự định

Base production **xác nhận địa chỉ**: `https://api.kythuatvang.com`; MCP `https://api.kythuatvang.com/mcp`. Đây là quyết định địa chỉ, chưa xác nhận đủ auth/DB production.

| Đường | Hợp đồng |
|---|---|
| `POST /api/auth/google`, `GET /api/auth/me`, `POST /api/auth/logout` | Server xác minh Google ID token (`sig/aud/iss/exp`), liên kết theo `sub`, tạo phiên cookie an toàn; lần đầu tạo `player`; `me` trả id/role/trạng thái. |
| `GET /api/v1/bots?cursor=&limit=`, `POST /api/v1/bots`, `GET /api/v1/bots/{id}`, `POST /api/v1/bots/{id}/edit` | Danh sách của chính chủ, phân trang; edit yêu cầu revision, sai trả 409; nhập nháp local có xem trước/xác nhận và idempotency. |
| `POST /api/v1/bots/{id}/validate`, `POST /api/v1/bots/{id}/simulate` | Validation gắn revision/hash/ruleset; simulate chỉ test, trả job hoặc replay test; quyền chủ sở hữu. |
| `POST /api/v1/bots/{id}/submit` | Nhận revision và `Idempotency-Key`; 201/200 trả `submissionId`, `status`, `matchId` nếu đã ghép; 409 khi đang có lượt hoặc revision cũ. |
| `GET /api/v1/submissions?cursor=&limit=`, `GET /api/v1/submissions/{id}`, `POST /api/v1/submissions/{id}/cancel` | Cả hai người đọc được lượt của mình, trạng thái, `matchId`, lý do lỗi; chỉ hủy khi `queued`, phản hồi idempotent. |
| `GET /api/v1/matches/{id}`, `GET /api/v1/replays/{id}`, `POST /api/v1/replays/{id}/share` | Người tham gia đọc kết quả/replay cùng một match; chia sẻ qua link ký 24 giờ, kiểm tra quyền trước khi phát link. |
| `/oauth/*`, `/mcp` | Giữ OAuth Authorization Code + PKCE của game; trang cấp quyền dùng cùng phiên Google/user_id SQLite. |
| `/api/admin/*` | Yêu cầu role admin phía server; danh sách phân trang, khóa/mở tài khoản, thu hồi phiên, hủy queue kẹt; ghi audit, không sửa result official. |

Lỗi JSON có `error` và mã HTTP: 401 chưa đăng nhập/phiên hết hạn, 403 không đủ quyền, 404 tài nguyên không thuộc quyền, 409 revision/lượt xung đột, 422 bot không hợp lệ, 429 quá tải. CORS/cookie chỉ cho origin web được cấu hình; request ghi bằng cookie cần kiểm tra Origin/CSRF.

## 6. Migration và test cần làm theo mốc sau

- M0 đã thêm `apps/api/node-migrations/0002_queue.sql` cho Node: chuyển bảng queue vốn được tạo ngầm lúc khởi động sang migration có số, chặn một user có hai lượt `queued` và hai hàng waiting. Handler đánh dấu **cả hai** submission `failed` nếu tính/lưu trận lỗi sau ghép. `tests/api-queue.test.mjs` khởi động API trên DB cũ có tài khoản sẵn, kiểm tra migration giữ dữ liệu, unique index và lỗi sau ghép giải phóng cả hai. `pnpm check`: 19/19; `pnpm m3:smoke` và `pnpm m4:smoke`: pass trên DB tạm sau sửa. Không áp dụng migration này trên VPS trong M0.
- M1: migration `0003_*.sql` **mới**, không sửa `0001_m3.sql`; thêm Google `sub` duy nhất, role/status và audit; cho phép tài khoản cũ không có Google link đến khi chuyển chủ động nếu cần giữ. Test integration mở DB cũ có users/bots/replays, chạy migration, xác nhận dữ liệu/hashes không đổi; Google A đăng nhập lại giữ id, B khác id, trùng email không tự gộp, token sai bị từ chối.
- M2: migration kế tiếp đưa queue, match và job vào cùng SQLite với ràng buộc một lượt active/user, hai submission/match và trạng thái có thể phục hồi. Test integration hai tài khoản/submit lặp, lỗi tính/lưu replay, restart trước/sau ghép, cả hai nhìn cùng match, bên thứ ba bị chặn. Phải giải quyết dữ liệu `queued/matched` cũ bằng kiểm kê và mapping trước khi thêm unique index; không viết migration phá dữ liệu theo giả định DB rỗng.
- M3: tắt đường Worker/D1 sau khi client/traffic cũ hết, có backup và smoke VPS; không chuyển dữ liệu D1; đo tải VPS hiện tại trước mọi đề nghị nâng.

Đường triển khai migration: sao lưu SQLite nhất quán, thử khôi phục bản sao, chạy migration tăng số trên DB staging sao chép từ production rồi kiểm đếm/test; chỉ sau đó chạy trên VPS trong cửa sổ bảo trì. Nếu lỗi, dừng app ghi dữ liệu và khôi phục snapshot trước migration; không sửa ngược dữ liệu bằng tay. Đổi app về bản cũ chỉ khi schema mới còn tương thích, nếu không phải khôi phục cặp app+DB cùng thời điểm.

**Gate M0:** đạt baseline, hợp đồng hành trình/API, chính sách replay, hình thức quan sát, quyết định bỏ dữ liệu thử, xác nhận API production và kiểm tra SQLite VPS chỉ đọc. Worker cũ vẫn hoạt động; chưa chứng minh mọi connector/client đã chuyển tuyến, nên **chưa tắt Worker**. Migration và lỗi queue đã được sửa/test cục bộ, **chưa deploy**, không thay đổi DB hay service VPS. Việc phát hành Google/admin, job có phục hồi sau restart và quyền replay mới thuộc mốc sau. Không gọi lỗi queue là đã sửa trên production.
