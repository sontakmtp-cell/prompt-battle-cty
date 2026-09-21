# Ví dụ M0

- `bot-basic.json`: bot 8 tam giác, đủ Búa/Kéo/Bao, 2 Motor, một Core trên Bao. Brain tiếp cận địch và xoay mặt.
- `brain-flanker.json`: Brain có 3 trạng thái và một biến, biết tiếp cận, vòng sườn, rút ngắn rồi phản công. Có thể gắn vào cùng thân bot bằng cách thay trường `brain`.
- `catalog.mjs`: tạo ví dụ cho toàn bộ hợp đồng công khai. Chạy `pnpm examples` để xuất JSON.

Các mẫu dùng để kiểm tra **định dạng và bộ lệnh**, chưa được chạy sandbox hoặc cân bằng bằng trận đấu. `packageHash`/`dataHash` toàn số 0 là chỗ giữ chỗ minh họa. Replay chỉ là mẫu cấu trúc rút gọn, thiếu chuỗi nhịp đầy đủ; không đưa vào Viewer hay dùng làm bằng chứng tái hiện trận.

`ValidationReport.valid` của mẫu là `false`, `geometry` và `sandbox` vẫn `pending`. Năm bot đối kháng Spear/Shield/Flanker/Spinner/Glass Cannon và replay thật thuộc M1.
