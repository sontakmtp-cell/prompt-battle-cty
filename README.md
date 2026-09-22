# PROMPT CHIẾN

**M1 đã có lõi mô phỏng, CLI, 5 bot mẫu và bản vẽ gỡ lỗi.** Tình trạng Gate và các tiêu chí cân bằng còn chưa đạt nằm trong [báo cáo M1](Docs/M1.md). Giao diện sản phẩm thuộc M2.

## Chạy kiểm tra

Cần **Node.js 22.23.1** và **pnpm 10.33.0** (đã ghim phiên bản trong dự án).

```powershell
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` kiểm tra kiểu dữ liệu TypeScript, độ cập nhật của schema, ranh giới mô-đun và chạy 14 nhóm kiểm tra M0/M1. Có lỗi thì lệnh trả mã thoát khác 0.

## Chạy một trận

```powershell
pnpm cli validate examples/bots/spear.json --out artifacts/validation.json
pnpm cli simulate examples/bots/spear.json examples/bots/flanker.json --seed 42 --out artifacts/match.json
pnpm cli replay artifacts/match.json
pnpm cli replay artifacts/match.json --at 450
pnpm debug:replay artifacts/match.json --serve
```

Lệnh cuối xuất HTML tự chứa dữ liệu và mở máy chủ tại `http://127.0.0.1:4173`. Mở địa chỉ đó trong trình duyệt, nhấn **Phát** hoặc kéo thanh thời gian. Bỏ `--serve` nếu chỉ cần tệp HTML để mở offline.

CLI trả mã `0` khi thành công, `1` khi bot không đạt validation, `2` khi yêu cầu/job bị lỗi. Mỗi job chạy trong tiến trình riêng, tối đa 60 giây thực và 256 MiB V8 old heap. Đây không phải giới hạn tổng RAM của hệ điều hành; Brain JSON chỉ có các lệnh game, không chạy mã JavaScript tùy ý.

| Lệnh | Dùng để làm gì |
|---|---|
| `pnpm build` | Biên dịch và kiểm tra kiểu dữ liệu |
| `pnpm schema` | Xuất lại các tệp JSON Schema sau khi sửa nguồn |
| `pnpm check:boundaries` | Tìm import sai tầng, truy cập nội bộ, vòng phụ thuộc và nguồn không tất định trong lõi |
| `pnpm test` | Build rồi chạy các kiểm tra bằng `node:test` |
| `pnpm examples` | In các ví dụ định dạng dữ liệu ra JSON |
| `pnpm check` | Kiểm tra tự động M0/M1 trên máy hiện tại |
| `pnpm bots` | Xuất lại 5 bot tham chiếu |
| `pnpm gate:m1` | Chạy 100 seed; kiểm chứng chạy lại và đổi thứ tự cập nhật A/B |
| `pnpm balance` | 1.000 trận vòng tròn: 100 seed cho mỗi cặp bot |

## Các phần của dự án

| Thư mục | Vai trò |
|---|---|
| `packages/contracts` | Kiểu dữ liệu, phiên bản, ruleset, schema và kiểm tra schema |
| `packages/core` | Geometry, trình thực thi Brain, mô phỏng chiến đấu và replay |
| `packages/application` | Kiểm tra bản thiết kế dùng chung cho các đầu vào web/MCP/CLI sau này |
| `packages/ui` | Định dạng dữ liệu đưa vào Viewer M2; bản vẽ gỡ lỗi M1 nằm ở `scripts/debug-replay.mjs` |
| `schemas` | JSON Schema tiêu chuẩn, có thể đọc bằng công cụ ngoài TypeScript |
| `examples` | Bot mẫu, Brain mẫu và ví dụ các gói dữ liệu |
| `tests`, `scripts` | Kiểm tra tự động và lệnh Gate |

Không sửa trực tiếp `schemas/*.json`: nguồn nằm ở `packages/contracts/src/schema.ts`, xuất bằng `pnpm schema`.

## Tài liệu

- [Kế hoạch và các Gate](Docs/PLAN.md)
- [Đặc tả demo](Docs/spec_demo.md)
- [Bàn giao M0, ranh giới mô-đun và các quyết định](Docs/M0.md)
- [Bàn giao kỹ thuật, lệnh nghiệm thu và kết quả cân bằng M1](Docs/M1.md)
- [Cú pháp và cách hoạt động của Brain](Docs/BRAIN.md)
- [Giới hạn của ví dụ dữ liệu](examples/README.md)
- [Gameplay](Docs/gameplay.md), [cân bằng](Docs/can_bang.md), [kỹ thuật mỹ thuật](Docs/ky_thuat_my_thuat.md)
