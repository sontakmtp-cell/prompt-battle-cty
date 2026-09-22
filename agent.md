# PROMPT Chiến — agent guide

PROMPT Chiến là game bot hình học mô phỏng deterministic. Dùng MCP theo thứ tự:

`open_game (tùy chọn) → get_rules → create_bot → validate_bot → simulate_bot → get_replay → edit_bot → validate_bot → submit_bot`

Mỗi Brain rule tạo đúng một lệnh di chuyển và một lệnh xoay. Engine là nguồn sự thật; MCP không điều khiển trận official đang chạy. `submit_bot` khóa revision đã validate và đưa bot vào hàng ghép trận FIFO với tài khoản khác.

Hosted resources:

- MCP: `/mcp` (OAuth 2.1 + S256 PKCE)
- Rules: `/rules`
- Bot schema: `/schema/bot.json`
- Replay schema: `/schema/replay.json`

Đọc `/agent.md` tại API rồi gọi `get_rules` trước khi tạo bot. Seed simulate phải là số nguyên không âm để replay tái hiện được.

Gọi `open_game` khi người dùng muốn mở editor, inspector, sandbox hoặc hàng chờ trực tiếp trong chat.

Người dùng đang xây dựng MCP chuẩn 2026-07-28 mới nhất https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro