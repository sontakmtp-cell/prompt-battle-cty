# Luồng hiển thị panel trong ChatGPT Web

Tham khảo: [Codex-app-tunnel `luna-max`](https://github.com/sontakmtp-cell/Codex-app-tunnel/tree/luna-max).

## Luồng ngắn gọn

```text
Người dùng yêu cầu mở panel
        ↓
ChatGPT gọi tool mở panel
        ↓
Tool trả metadata trỏ tới ui://...
        ↓
ChatGPT đọc resource HTML MCP App
        ↓
Panel xuất hiện trong chat như một iframe/widget
```

## Backend tối thiểu

1. Tạo một file HTML cho panel và đăng ký nó thành resource với MIME:

   `text/html;profile=mcp-app`

2. Tool mở panel phải trỏ tới cùng resource:

   ```json
   {
     "ui": { "resourceUri": "ui://promptchien/game/v6.html" },
     "ui/resourceUri": "ui://promptchien/game/v6.html",
     "openai/outputTemplate": "ui://promptchien/game/v6.html"
   }
   ```

3. MCP server phải trả resource đó trong `resources/list` và nội dung HTML trong `resources/read`.

4. Khi panel cần gọi tool, bật `openai/widgetAccessible: true`; HTML dùng MCP Apps bridge/`window.openai` để gọi.

## Áp dụng trong project này

- `open_game` → `ui://promptchien/game/v6.html`.
- Template tải trực tiếp frontend từ `https://api.kythuatvang.com/panel/`; không lồng thêm iframe bên trong iframe của ChatGPT.
- `render_replay` → `ui://promptchien/replay-viewer/v1.html`.
- Muốn mở panel: nói trong ChatGPT **“mở game”** hoặc gọi `render_replay` sau khi có `replayId`.

## Khi sửa panel

Restart/deploy MCP server, sau đó vào **Settings → Apps → app → Làm mới** trong ChatGPT Web. Nếu vẫn thấy giao diện cũ, gỡ và cài lại app để xoá cache resource.
