# Sửa lỗi Grok web không hiện trang đăng nhập MCP

Ngày ghi: 2026-09-22. Production đang chạy tại `https://api.kythuatvang.com`. File này mô tả lỗi đã đo trên host đó và các sửa trong `apps/api/src/index.mjs`.

## Triệu chứng

Connector trên [grok.com/connectors](https://grok.com/connectors) báo đã nối tới `https://api.kythuatvang.com/mcp`, nhưng trình duyệt không mở trang đăng nhập PROMPT Chiến. Không có phiên OAuth thì mọi tool (`get_rules`, `create_bot`, `open_game`, …) trả 401, nên không chơi được.

## Vì sao

Grok chỉ mở trang đăng nhập sau chuỗi sau:

1. Gọi `/mcp` không kèm bearer token.
2. Nhận **HTTP 401** và header  
   `WWW-Authenticate: Bearer realm="promptchien", resource_metadata="https://api.kythuatvang.com/.well-known/oauth-protected-resource"`.
3. Đọc protected-resource metadata, rồi authorization-server metadata.
4. `POST /oauth/register` (PKCE, không client secret).
5. Mở `GET /oauth/authorize` — đây mới là form email/mật khẩu.

Đo production ngày 2026-09-22:

| Request | Kết quả thực tế | Grok cần |
|---|---|---|
| `POST /mcp` method `initialize`, không token | `200`, không có `WWW-Authenticate` | `401` + `WWW-Authenticate` |
| `POST /mcp` method `tools/call`, không token | `401` đúng header | Đúng, nhưng bước này đến quá muộn |
| `GET /.well-known/oauth-authorization-server` | Thiếu `token_endpoint_auth_methods_supported` | Phải có `"none"` |
| `POST /oauth/register` với một redirect không phải HTTPS | `500`, body JSON, không có `cache-control` | `400` từ worker, và vẫn nhận các redirect HTTPS hợp lệ trong cùng mảng |

`initialize` trả 200 vì `handleMcp` cố ý để ChatGPT liệt kê tool trước khi có token:

```659:662:apps/api/src/index.mjs
  // ChatGPT Developer Mode discovers the app before it has an OAuth bearer token.
  // Keep discovery and static widget resources public; every tool call remains authenticated.
  const publicMethods = new Set(["initialize", "notifications/initialized", "server/discover", "tools/list", "resources/list", "resources/read"]);
```

Grok không gửi `Origin: https://chatgpt.com`. Nó thấy `200` nên coi server là public và không mở OAuth.

Lỗi 500 là lỗi riêng. Ba route OAuth được `return` mà không `await`:

```910:912:apps/api/src/index.mjs
      if (url.pathname === "/oauth/register" && request.method === "POST") return oauthRegister(env, request);
      if (url.pathname === "/oauth/authorize" && (request.method === "GET" || request.method === "POST")) return oauthAuthorize(env, request);
      if (url.pathname === "/oauth/token" && request.method === "POST") return oauthToken(env, request);
```

Promise bị reject thì thoát khỏi `try/catch` của `worker.fetch`. `apps/api/src/node.mjs` bắt lại và luôn trả 500. Response 500 của Node không có `cache-control: no-store`; response 400 của worker thì có. Grok gặp 500 ở bước đăng ký client thì dừng trước khi mở form.

`oauthRegister` còn hủy cả lần đăng ký khi **một** phần tử trong `redirect_uris` không phải HTTPS hoặc loopback. Client đôi khi gửi kèm scheme riêng bên cạnh callback `https://`.

## Việc cần sửa

Chỉ sửa `apps/api/src/index.mjs`, rồi cập nhật một request trong `tools/m3-smoke.mjs`. Giữ discovery công khai cho ChatGPT. Mọi client khác, gồm Grok, phải nhận 401 khi chưa có token.

### 1. Phân nhánh discovery

Thêm helper cạnh `isAllowedOrigin`:

```javascript
function allowsPublicDiscovery(request) {
  const origin = request.headers.get("origin");
  return origin === "https://chatgpt.com"
    || origin === "https://web-sandbox.oaiusercontent.com"
    || Boolean(origin?.endsWith(".web-sandbox.oaiusercontent.com"));
}

function oauthChallenge(request) {
  return {
    "www-authenticate": `Bearer realm="promptchien", resource_metadata="${originOf(request)}/.well-known/oauth-protected-resource"`,
  };
}
```

Trong `handleMcp`, sau khi parse JSON-RPC và trước khi dispatch:

- Nếu request không có bearer token và `allowsPublicDiscovery(request)` là false, trả ngay:

```javascript
return json(request, env, { error: "Authentication required." }, 401, oauthChallenge(request));
```

- Nếu là discovery của ChatGPT, giữ nhánh `publicMethods` như hiện tại.
- `GET /mcp` không token và không phải origin ChatGPT cũng trả `401` với cùng header, thay vì `405` không header. Grok có thể probe bằng GET.

`requireUser` cho `tools/call` giữ nguyên.

### 2. Metadata PKCE public client

Trong `oauthMetadata`, thêm:

```javascript
token_endpoint_auth_methods_supported: ["none"],
```

Không thêm client secret. Grok đăng ký bằng dynamic client registration và PKCE S256.

### 3. Await ba route OAuth

Đổi ba dòng `return` thành `return await`:

```javascript
if (url.pathname === "/oauth/register" && request.method === "POST") return await oauthRegister(env, request);
if (url.pathname === "/oauth/authorize" && (request.method === "GET" || request.method === "POST")) return await oauthAuthorize(env, request);
if (url.pathname === "/oauth/token" && request.method === "POST") return await oauthToken(env, request);
```

Sau sửa, lỗi `httpError(..., 400)` phải ra HTTP 400, có `cache-control: no-store`. Dùng lại header `oauthChallenge` trong nhánh `catch` khi status là 401, thay vì lắp chuỗi riêng.

### 4. Đăng ký redirect của Grok

Trong `oauthRegister`, tách URI hợp lệ ra khỏi URI bị từ chối:

- Giữ URI mà `validRedirectUri` chấp nhận (HTTPS, hoặc HTTP loopback).
- Bỏ URI scheme riêng và URI có hash.
- Nếu còn ít nhất một URI hợp lệ, lưu đúng danh sách đó và trả `201`.
- Nếu không còn URI nào, `throw httpError("redirect_uris must use HTTPS or a loopback HTTP address.", 400)`.

Không hard-code callback của Grok. Lần kết nối đầu, log `client_name` và `redirect_uris` gốc để biết host thật (`grok.com` hoặc `x.ai`). `checkOAuthClient` vẫn so khớp đúng chuỗi đã lưu.

### 5. Trang authorize là document HTML

`GET /oauth/authorize` hiện trả một mảnh `<main>`. Đổi thành document đầy đủ để webview của Grok vẽ được form:

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PROMPT Chiến</title>
</head>
<body>
  <!-- form POST hiện tại, giữ các input hidden -->
</body>
</html>
```

Giữ field `email`, `password`, và các hidden `client_id`, `redirect_uri`, `response_type`, `scope`, `state`, `code_challenge`, `code_challenge_method`. Vẫn escape bằng `escapeHtml`.

### 6. Smoke ChatGPT

`tools/m3-smoke.mjs` có một batch `initialize` + `tools/list` không gửi `Origin`. Thêm header đó để batch tiếp tục đại diện cho discovery của ChatGPT:

```javascript
headers: {
  "content-type": "application/json",
  origin: "https://chatgpt.com",
  "MCP-Protocol-Version": "2025-06-18",
},
```

`publicMcp` trong cùng file đã gửi origin này. Assertion `tools/call` không token phải vẫn là 401.

Thêm một assert mới: `POST /mcp` method `initialize`, không token và không origin ChatGPT, trả 401 và `www-authenticate` chứa `oauth-protected-resource`.

## Kiểm tra local

```powershell
pnpm check
$env:M3_API_URL="http://127.0.0.1:8787"; $env:M3_INVITE_CODE="local-demo-invite"; node tools/m3-smoke.mjs
$env:M4_API_URL="http://127.0.0.1:8787"; $env:M4_INVITE_CODE="local-demo-invite"; node tools/m4-smoke.mjs
```

Probe tay, không token, không origin ChatGPT:

```powershell
curl.exe -sS -D - -o NUL -X POST http://127.0.0.1:8787/mcp -H "content-type: application/json" -H "accept: application/json, text/event-stream" --data-binary "@init.json"
```

`init.json` là một request `initialize`. Kỳ vọng status `401` và header `WWW-Authenticate`.

Đăng ký client có cả URI tốt và URI xấu phải trả `201` và chỉ echo các URI hợp lệ. Request authorize thiếu PKCE phải trả `400`, không phải `500`.

## Sau khi deploy VPS

Deploy lại service `promptchien-api` cùng cách đã đưa M4 lên `https://api.kythuatvang.com`. Lặp lại probe `initialize` không token trên host public. Khi probe đạt 401:

1. Vào grok.com → Connectors, gỡ connector cũ.
2. New Connector → Custom, URL `https://api.kythuatvang.com/mcp`.
3. Grok mở trang PROMPT Chiến. Đăng nhập bằng tài khoản đã tạo với invite code.
4. Trong chat mới, bật connector và gọi `get_rules`.

Grok web chạy tool MCP. Widget `ui://promptchien/game/v6.html` và replay viewer là MCP App dành cho ChatGPT/Claude. Trên Grok, trận đấu xem qua link fallback `/replays/{replay_id}?share=...` hoặc Web Lab, không phải panel nhúng trong cuộc chat.
