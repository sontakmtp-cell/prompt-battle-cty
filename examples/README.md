# Ví dụ M0

- `bot-basic.json`: bot 8 tam giác, đủ Búa/Kéo/Bao, 2 Motor, một Core trên Bao. Brain tiếp cận địch và xoay mặt.
- `brain-flanker.json`: Brain có 3 trạng thái và một biến, biết tiếp cận, vòng sườn, rút ngắn rồi phản công. Có thể gắn vào cùng thân bot bằng cách thay trường `brain`.
- `catalog.mjs`: tạo ví dụ cho toàn bộ hợp đồng công khai. Chạy `pnpm examples` để xuất JSON.

Các mẫu dùng để kiểm tra **định dạng và bộ lệnh**, chưa được chạy sandbox hoặc cân bằng bằng trận đấu. `packageHash`/`dataHash` toàn số 0 là chỗ giữ chỗ minh họa. Replay chỉ là mẫu cấu trúc rút gọn, thiếu chuỗi nhịp đầy đủ; không đưa vào Viewer hay dùng làm bằng chứng tái hiện trận.

`ValidationReport.valid` của catalog là `false`, `geometry` và `sandbox` vẫn `pending`.

## Bot thực thi M1

`bots/` chứa Spear, Shield, Flanker, Spinner và Glass Cannon. Đây là bản thiết kế có thể validate/simulate bằng CLI; `pnpm bots` tạo lại từ `scripts/reference-bots.mjs`. Mỗi bot có 60 tam giác. Spinner tiếp cận trong 5 giây đầu, sau đó mới xoay khi gần địch.

Replay thực của lần nghiệm thu nằm trong `artifacts/m1/reference-match.json`; xem cách chạy và giới hạn cân bằng trong `Docs/M1.md`. Đừng dùng hash giữ chỗ của catalog để thay thế package khóa thật.
