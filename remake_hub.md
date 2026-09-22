# Tối ưu giao diện `apps/web` cho khung ChatGPT

## Tóm tắt

- Chỉ sửa giao diện hiện tại trong [`apps/web/index.html`](<D:/AI/prompt-battle-cty/apps/web/index.html>), [`lab.css`](<D:/AI/prompt-battle-cty/apps/web/lab.css>) và cần ít thay đổi ở [`main.ts`](<D:/AI/prompt-battle-cty/apps/web/src/main.ts>).
- Bỏ qua hoàn toàn `prompt_battle_ui_mockup`.
- Dùng bố cục gọn, sân chơi xuất hiện trước ở viewport `360–1199px`; giữ bố cục desktop hiện tại từ `1200px` trở lên.

## Thay đổi chính

- Header responsive: không tràn ngang; navigation cuộn ngang riêng; ẩn metadata phụ ở màn hẹp; giữ tên người chơi và trạng thái MCP.
- Editor:
  - Đưa canvas lên đầu ở màn hẹp.
  - Giữ tên bot, công cụ, ngân sách và nút `Kiểm tra/Chạy thử` luôn thấy.
  - Đưa JSON, seed, bot đối thủ, lỗi kiểm tra vào `<details>` native.
  - Cho phép thu gọn phần `Chiến thuật AI`.
- Replay:
  - Đưa canvas thành phần chính trong luồng dọc, không dùng panel nổi chồng lên canvas ở màn hẹp.
  - HUD đội A/B và đồng hồ chuyển thành cụm gọn.
  - Inspector và sự kiện trận đấu thành hai panel có thể mở/đóng.
  - Timeline tự xuống dòng; danh sách replay chỉ cuộn trong vùng riêng.
- Inspector, queue và modal JSON chuyển sang cuộn dọc, card một cột ở viewport nhỏ.
- Thêm `min-width: 0`, giới hạn canvas theo chiều rộng thực tế, chống `scrollWidth` vượt viewport, giữ focus ring và tăng vùng bấm ở màn cảm ứng.
- Tôn trọng `prefers-reduced-motion`.
- Giữ nguyên toàn bộ ID DOM mà `main.ts` đang dùng; không đổi engine, schema, API hay logic trận đấu.
- Chạy generator hiện có để cập nhật `apps/api/src/m4-game-widget.mjs`, không sửa tay file sinh.

## Kiểm thử

- Dùng Node `22.23.1` và pnpm `10.33.0` theo `.node-version`.
- Chạy `pnpm build` và `pnpm check`.
- Mở `?selftest=1`, xác nhận `SELFTEST PASS`.
- Kiểm tra Playwright ở `360×800`, `390×844`, `768×900`, `1024×900`, `1200×900`, `1440×900`:
  - không còn cuộn ngang;
  - canvas editor/replay nhìn thấy và nằm trong viewport;
  - mở/đóng được các panel phụ;
  - chuyển đủ bốn màn hình;
  - modal JSON không vượt chiều cao khung;
  - bố cục desktop vẫn giữ ba vùng chính.

## Giả định

- `360–600px` là kích thước ưu tiên cho panel ChatGPT.
- Panel phụ mặc định đóng ở màn hẹp và mở ở desktop rộng.
- Không chỉnh sửa mockup, game engine hoặc giao diện ngoài `apps/web`.
