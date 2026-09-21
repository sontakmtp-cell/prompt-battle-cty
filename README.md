# PROMPT CHIẾN

**M0 — Nền móng đã hoàn thành.** Hiện có định dạng dữ liệu, luật ban đầu, bộ lệnh Brain và kiểm tra tự động. Trận đấu thuộc M1; giao diện web thuộc M2.

## Chạy kiểm tra

Cần **Node.js 22.23.1** và **pnpm 10.33.0** (đã ghim phiên bản trong dự án).

```powershell
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` kiểm tra kiểu dữ liệu TypeScript, độ cập nhật của schema, ranh giới mô-đun và chạy 6 nhóm kiểm tra M0. Có lỗi thì lệnh trả mã thoát khác 0.

| Lệnh | Dùng để làm gì |
|---|---|
| `pnpm build` | Biên dịch và kiểm tra kiểu dữ liệu |
| `pnpm schema` | Xuất lại các tệp JSON Schema sau khi sửa nguồn |
| `pnpm check:boundaries` | Tìm import sai tầng, truy cập nội bộ, vòng phụ thuộc và nguồn không tất định trong lõi |
| `pnpm test` | Build rồi chạy các kiểm tra bằng `node:test` |
| `pnpm examples` | In các ví dụ định dạng dữ liệu ra JSON |
| `pnpm check` | Chạy toàn bộ Gate M0 |

## Các phần của dự án

| Thư mục | Vai trò |
|---|---|
| `packages/contracts` | Kiểu dữ liệu, phiên bản, ruleset, schema và kiểm tra schema |
| `packages/core` | Bốn mô-đun geometry, brain, engine, replay; M0 mới có kiểm tra Brain tĩnh và định nghĩa đầu vào/đầu ra |
| `packages/application` | Kiểm tra bản thiết kế dùng chung cho các đầu vào web/MCP/CLI sau này |
| `packages/ui` | Định dạng dữ liệu đưa vào Viewer; chưa có phần vẽ |
| `schemas` | JSON Schema tiêu chuẩn, có thể đọc bằng công cụ ngoài TypeScript |
| `examples` | Bot mẫu, Brain mẫu và ví dụ các gói dữ liệu |
| `tests`, `scripts` | Kiểm tra tự động và lệnh Gate |

Không sửa trực tiếp `schemas/*.json`: nguồn nằm ở `packages/contracts/src/schema.ts`, xuất bằng `pnpm schema`.

## Tài liệu

- [Kế hoạch và các Gate](Docs/PLAN.md)
- [Đặc tả demo](Docs/spec_demo.md)
- [Bàn giao M0, ranh giới mô-đun và các quyết định](Docs/M0.md)
- [Cú pháp và cách hoạt động của Brain](Docs/BRAIN.md)
- [Giới hạn của ví dụ dữ liệu](examples/README.md)
- [Gameplay](Docs/gameplay.md), [cân bằng](Docs/can_bang.md), [kỹ thuật mỹ thuật](Docs/ky_thuat_my_thuat.md)
