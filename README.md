<div align="center">

<img src="assets/logo.jpg" width="160" alt="BYPASS KING">

# ♛ BYPASS KING ULTIMATE VIP

Userscript hỗ trợ làm nhiệm vụ GTraffic **thủ công nhanh hơn**: nhận diện nhiệm vụ, OCR ảnh bạn chọn, phát hiện mã đang hiển thị, đồng hồ đếm, lịch sử link.

[![Cài đặt](https://img.shields.io/badge/%E2%99%9B%20C%C3%80I%20%C4%90%E1%BA%B6T-v2.0.0-f5c542?style=for-the-badge&labelColor=0b1730)](https://raw.githubusercontent.com/__GH_USER__/__GH_REPO__/main/BYPASS_KING.user.js)
[![Trang giao diện](https://img.shields.io/badge/TRANG%20GIAO%20DI%E1%BB%86N-m%E1%BB%9F-38bdf8?style=for-the-badge&labelColor=0b1730)](https://__GH_USER__.github.io/__GH_REPO__/)
[![CI](https://github.com/__GH_USER__/__GH_REPO__/actions/workflows/ci.yml/badge.svg)](https://github.com/__GH_USER__/__GH_REPO__/actions/workflows/ci.yml)

</div>

## Cài trong 3 bước

1. Cài **Violentmonkey** (Kiwi Browser trên Android hoặc Chrome trên PC).
2. Bấm nút **CÀI ĐẶT** ở trên → Violentmonkey hiện màn hình xác nhận → **Confirm installation**.
3. Mở `gtraffic.io` → bảng **♛ BYPASS KING** hiện ở góc dưới-phải. Script tự cập nhật khi repo có bản mới.

> Lần cài đầu cần mạng để tải thư viện OCR `tesseract.js@5.1.1` (đã ghim phiên bản).

## Giao diện

<img src="assets/screenshot-compact.jpg" alt="Chế độ Compact" width="520">

Ba chế độ: **Đầy đủ**, **Compact**, **biểu tượng nổi ♛** (chạm để mở, kéo để di chuyển, vị trí được nhớ).

## Nó làm gì, không làm gì

| Có | Không |
|---|---|
| Đọc nhiệm vụ trên trang, độ tin cậy % | Không giải CAPTCHA |
| OCR ảnh bạn chọn (gợi ý, luôn là "Nghi ngờ") | Không click quảng cáo |
| Liệt kê mã đang hiển thị, nút COPY CODE | Không tạo lượt xem/tương tác giả |
| Đồng hồ Start/Pause/Resume, lịch sử 200 link | Không tự gửi yêu cầu khi hết giờ |
| Mọi bước mở Google / xác nhận đích do bạn bấm | Không đọc cookie, token, tài khoản |

Chi tiết cách dùng: [docs/HUONG_DAN.md](docs/HUONG_DAN.md) · Lịch sử bản: [CHANGELOG.md](CHANGELOG.md)

## Phát hành bản mới

Sửa `BYPASS_KING.user.js`, tăng `@version`, commit rồi push lên `main`. Violentmonkey của người dùng sẽ tự nhận bản mới.

## Giấy phép

MIT, xem [LICENSE](LICENSE).
