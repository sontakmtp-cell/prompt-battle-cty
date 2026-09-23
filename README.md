# PROMPT CHIẾN

**Bản phát hành mới chọn VPS Node + SQLite.** M0 và M1 đã hoàn tất; API chạy trên VPS, web chạy trên Vercel. Web gọi API VPS qua proxy cùng tên miền để đăng nhập hoạt động khi trình duyệt chặn cookie bên thứ ba; MCP gọi API VPS trực tiếp. M1 đã thử hai tài khoản Google thật, bot qua hai phiên trình duyệt, quyền admin và cùng dữ liệu API/MCP. M3/M4 cũ là demo lịch sử. Xem [bàn giao M1 phát hành](Docs/M1_RELEASE.md).

## Chạy kiểm tra

Cần **Node.js 22.23.1** và **pnpm 10.33.0** (đã ghim phiên bản trong dự án).

```powershell
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` kiểm tra kiểu dữ liệu TypeScript, schema, ranh giới mô-đun và chạy 20 nhóm kiểm tra, gồm migration và tài khoản M1 trên SQLite tạm. Có lỗi thì lệnh trả mã thoát khác 0.

## Chạy một trận

```powershell
pnpm cli validate examples/bots/spear.json --out artifacts/validation.json
pnpm cli simulate examples/bots/spear.json examples/bots/flanker.json --seed 42 --out artifacts/match.json
pnpm cli replay artifacts/match.json
pnpm cli replay artifacts/match.json --at 450
pnpm debug:replay artifacts/match.json --serve
```

Lệnh cuối xuất HTML tự chứa dữ liệu và mở máy chủ tại `http://127.0.0.1:4173`. Mở địa chỉ đó trong trình duyệt, nhấn **Phát** hoặc kéo thanh thời gian. Bỏ `--serve` nếu chỉ cần tệp HTML để mở offline.

## Phòng thử trên trình duyệt

```powershell
pnpm web
```

Mở `http://127.0.0.1:4174`. Trang này để tạo bot bằng lưới tam giác, chọn chiến thuật mẫu, kiểm tra, chạy thử và xem lại trận. Bản nháp/queue thử cũ vẫn nằm trong trình duyệt. Khi đăng nhập Google, bot được lưu trên SQLite qua Node API; nộp trận chính thức trên web thuộc M2.

CLI trả mã `0` khi thành công, `1` khi bot không đạt validation, `2` khi yêu cầu/job bị lỗi. Mỗi job chạy trong tiến trình riêng, tối đa 60 giây thực và 256 MiB V8 old heap. Đây không phải giới hạn tổng RAM của hệ điều hành; Brain JSON chỉ có các lệnh game, không chạy mã JavaScript tùy ý.

| Lệnh | Dùng để làm gì |
|---|---|
| `pnpm build` | Biên dịch và kiểm tra kiểu dữ liệu |
| `pnpm schema` | Xuất lại các tệp JSON Schema sau khi sửa nguồn |
| `pnpm check:boundaries` | Tìm import sai tầng, truy cập nội bộ, vòng phụ thuộc và nguồn không tất định trong lõi |
| `pnpm test` | Build rồi chạy các kiểm tra bằng `node:test` |
| `pnpm examples` | In các ví dụ định dạng dữ liệu ra JSON |
| `pnpm check` | Kiểm tra tự động M0–M2 trên máy hiện tại |
| `pnpm bots` | Xuất lại 5 bot tham chiếu |
| `pnpm gate:m1` | Chạy 100 seed; kiểm chứng chạy lại và đổi thứ tự cập nhật A/B |
| `pnpm balance` | 1.000 trận vòng tròn: 100 seed cho mỗi cặp bot |
| `pnpm m3:smoke` | Kiểm tra local Node, OAuth, MCP, CRUD và matchmaking |
| `pnpm m3:load` | Tải thử 10 simulation đồng thời |

## Các phần của dự án

| Thư mục | Vai trò |
|---|---|
| `packages/contracts` | Kiểu dữ liệu, phiên bản, ruleset, schema và kiểm tra schema |
| `packages/core` | Geometry, trình thực thi Brain, mô phỏng chiến đấu và replay |
| `packages/application` | Kiểm tra bản thiết kế, bản nháp, phiên bản và hàng chờ local |
| `packages/ui` | Viewer, lưới editor và màu dùng chung |
| `apps/web` | Phòng thử M2: editor, inspector, hàng chờ, replay |
| `apps/api` | Node API phát hành: OAuth, MCP, SQLite và hàng chờ; Worker/D1 là demo cũ chưa tắt |
| `schemas` | JSON Schema tiêu chuẩn, có thể đọc bằng công cụ ngoài TypeScript |
| `examples` | Bot mẫu, Brain mẫu và ví dụ các gói dữ liệu |
| `tests`, `scripts` | Kiểm tra tự động và lệnh Gate |

Không sửa trực tiếp `schemas/*.json`: nguồn nằm ở `packages/contracts/src/schema.ts`, xuất bằng `pnpm schema`.

## Tài liệu

- [Kế hoạch và các Gate](Docs/PLAN.md)
- [Đặc tả demo](Docs/spec_demo.md)
- [Bàn giao M0, ranh giới mô-đun và các quyết định](Docs/M0.md)
- [Bàn giao kỹ thuật, lệnh nghiệm thu và kết quả cân bằng M1](Docs/M1.md)
- [Bàn giao M3, smoke/load gate và trạng thái hosted](Docs/M3.md)
- [Cú pháp và cách hoạt động của Brain](Docs/BRAIN.md)
- [Giới hạn của ví dụ dữ liệu](examples/README.md)
- [Gameplay](Docs/gameplay.md), [cân bằng](Docs/can_bang.md), [kỹ thuật mỹ thuật](Docs/ky_thuat_my_thuat.md)
