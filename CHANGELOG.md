# Changelog

## 2.0.0

### Mới
- Kiến trúc module: `StorageManager`, `SecurityManager`, `NotificationManager`, `PageWatcher`, `HistoryManager`, `TaskRecognitionEngine`, `CodeDetectionEngine`, `OCRManager`, `TrafficManager`, `TimerManager`, `UIManager`.
- Nhận diện nhiệm vụ: từ khóa, loại nhiệm vụ, URL hiển thị trên trang, độ tin cậy %, trạng thái Mới / Đang chạy / Đã hoàn thành; không tự suy đoán URL đích.
- Smart Traffic: phiên làm nhiệm vụ (mở Google bằng từ khóa, xác nhận website đích, ghi thời gian, thử lại tối đa 5 lần, chốt thành công/thất bại khi trang báo rõ ràng hoặc khi bạn xác nhận).
- Phát hiện mã: phân biệt "Đã xác nhận" / "Nghi ngờ", loại trùng, kiểm tra định dạng và ngữ cảnh, COPY CODE, thông báo khi có mã mới, đồng bộ mã từ tab trang đích sang tab nhiệm vụ.
- OCR: chọn file ảnh hoặc chạm vào ảnh trên trang; timeout 90 giây; worker được giải phóng sau mỗi lần để tiết kiệm RAM.
- Lịch sử: tìm kiếm, lọc thành công/thất bại, đánh dấu tay, mở lại, xóa; chống lưu trùng link; tối đa 200 mục.
- Timer: Start / Pause / Resume / Reset, tính theo mốc thời gian thực (không trôi khi tab nền), chỉ một interval, khôi phục sau khi tải lại, đồng bộ giữa các tab.
- Giao diện Dark Navy + Gold: 3 chế độ Expanded / Compact / Floating, kéo thả, nhớ vị trí và chế độ, giới hạn trong màn hình, Shadow DOM (không đụng CSS của website), tùy chỉnh màu nhấn / cỡ chữ / độ mờ.
- Cài đặt: thời gian, OCR, tự lưu link, nhận diện nhiệm vụ, theo dõi mã, thông báo, gợi ý đổi từ khóa; khôi phục mặc định; được lưu bằng `GM_setValue`.
- Nhập tự động lịch sử/cài đặt từ v1.x (một lần).

### Sửa lỗi gốc từ v1.x
- Regex dò từ khóa dùng `\\n` sai trong chuỗi template → mẫu "từ khóa:" khớp sai; viết lại.
- Bộ dò mã nhận cả chuỗi 6–12 ký tự ngẫu nhiên và có nhánh `/g` luôn trả `undefined` → bỏ; thay bằng quy tắc nhãn + ngữ cảnh + kiểm tra định dạng.
- Hai hàm dò mã trùng lặp → hợp nhất thành một engine.
- Timer đếm bằng `remaining--` trong `setInterval` (lệch khi tab nền) → tính theo mốc thời gian.
- Mỗi lần trang đổi đều ghi lại 12.000 ký tự `innerText` mỗi 700ms → một observer dùng chung, throttle 2 giây, tạm dừng khi tab ẩn.
- Dùng `innerHTML` dựng giao diện → dựng bằng `createElement/textContent`.
- Bảng nằm trong DOM trang (dễ xung đột CSS) → Shadow DOM.
- Observer và interval không được dọn khi rời trang → dọn ở `pagehide`.
- `@require tesseract.js@5` (phiên bản trôi) → ghim `5.1.1`.
- Trang ngoài GTraffic luôn bị chèn UI rồi mới gỡ → thoát sớm, không tạo gì khi không có phiên.

### Bảo mật
- Chỉ mở http/https, chặn URL chứa user:pass; làm sạch mọi chuỗi hiển thị; không dùng `eval`/`Function`/`innerHTML`/`GM_xmlhttpRequest`; không có `@connect`; không đọc cookie/token/tài khoản.
