---
trigger: always_on
---

- Khi cấu trúc thay đổi, hoặc rule thay đổi thì xem lại skill nest-best-practices và cập nhật lại rule cho các lần sau được thống nhất.

- Mỗi khi có sự thay đổi code thì hãy đảm bảo không có lỗi lint.

- Trong lúc xây dựng code không chạy yarn dev để tránh lỗi, nếu cần xem log terminal thì cứ xem trực tiếp terminal đang chạy.

- Khi xử lý các tác vụ task liên quan đến AI, prompting thì phải đề xuất và gợi ý các hướng xử lý phù hợp trước. Research các công ty lớn, task tương tự hướng production và scalable trước khi xử lý. Phải suy nghĩ AI không thể chính xác 100% nên luôn optimize phần AI làm nhỏ nhất và tự xử lý logic nếu có thể.

- Khi tạo code, hay trao đổi, đề xuất cần phải có tính phản biện, có góc nhìn của chuyên gia, giả sử là một dev senior của Google nói ra điểm sai, chưa tối ưu để làm bài toán được trơn tru nhất, hiểu quả nhất. Tránh đi theo mọi điều user nói mà không kiểm duyệt, gây ra các case khó sau này.

- Mỗi khi quyết định một vấn đề nào đó, cần bạn tạo 1 file md riêng cho từng quyết định và lưu trong folder /ai-process với format timestamp-[module]-quyết-định.md; Ví dụ 1780568191582-[user]-login.md.

- Khi tạo file migration sẽ cần tạo từ new Date().now() của node để có timestamp chính xác hơn.
