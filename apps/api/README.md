# PROMPT Chiến Node API

Backend phát hành dùng Node + SQLite trên VPS cho web, OAuth/MCP, bot và replay. Worker/D1 là tuyến demo cũ, chưa tắt vì còn phải kiểm tra client ở M3. Hợp đồng và gate M1: [Docs/M1_RELEASE.md](../../Docs/M1_RELEASE.md).

Chạy local bằng Node 22.23.1 và pnpm 10.33.0:

```powershell
pnpm build
$env:WEB_ORIGIN = 'http://127.0.0.1:4174'
$env:REPLAY_SHARE_SECRET = 'a separate random secret'
pnpm api:node
```

`PROMPTCHIEN_DB_PATH` mặc định là `data/promptchien.sqlite`; Node tự chạy migration `0001`, `0002`, `0003` khi khởi động. Node có Client ID công khai mặc định từ file chủ dự án cung cấp; có thể ghi đè bằng `GOOGLE_CLIENT_ID`. Không cần Client Secret và không đặt `INVITE_CODE`. Google chỉ hoạt động ở JavaScript origin đã đăng ký. Admin được cấp bằng `node scripts/promote-admin.mjs --sub GOOGLE_SUB` sau lần đăng nhập Google đầu tiên và sau khi chọn đúng DB.
