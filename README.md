# BYPASS KING ULTIMATE VIP — v2.0.0

Userscript cho Violentmonkey (Android Kiwi Browser / Chrome PC) hỗ trợ bạn **làm nhiệm vụ GTraffic thủ công nhanh hơn**: đọc nhiệm vụ trên trang, OCR ảnh bạn chọn, phát hiện mã đang hiển thị, đồng hồ đếm, lưu lịch sử link.

> Công cụ **không** giải CAPTCHA, **không** click quảng cáo, **không** tạo lượt xem/tương tác giả, **không** tự gửi yêu cầu khi hết giờ, **không** tự đoán URL đích. Mọi bước mở Google / xác nhận đích / đổi từ khóa đều do bạn bấm.

## 1. Cài đặt

1. Cài **Violentmonkey** (Kiwi Browser hoặc Chrome → Chrome Web Store).
2. Mở file `BYPASS_KING.user.js` trong trình duyệt (hoặc Violentmonkey → `+` → *Install from file / New → dán nội dung*).
3. Bấm **Confirm installation**. Lần cài đầu cần mạng để Violentmonkey tải thư viện OCR (`tesseract.js@5.1.1`, ghim phiên bản).
4. Mở `gtraffic.io`, bảng **♛ BYPASS KING** xuất hiện góc dưới-phải.

## 2. Cách dùng nhanh

1. Vào trang nhiệm vụ GTraffic → mục **Nhận diện nhiệm vụ** hiện từ khóa + độ tin cậy. Nếu từ khóa nằm trong ảnh: dùng **Chọn ảnh trên trang** hoặc **OCR file ảnh**, rồi **Dùng làm từ khóa**.
2. **Smart Traffic** → kiểm tra từ khóa → **Mở Google**.
3. Từ kết quả Google, bạn tự chọn trang đúng nhiệm vụ. Ở trang đích bảng vẫn hiện: bấm **Đặt trang này** để xác nhận website đích.
4. Bấm **Start** (mặc định 68 giây, đổi ở Cài đặt). Hết giờ chỉ có thông báo.
5. Mã hiển thị trên trang đích được liệt kê trong **Phát hiện mã**; bấm **COPY CODE**, quay lại tab GTraffic để nhập.
6. Trang GTraffic báo thành công/thất bại → phiên được chốt; hoặc bạn tự bấm ✓ / ✗.

**3 chế độ:** `▭` Đầy đủ ⇄ Compact · `—` thu thành biểu tượng nổi ♛ (chạm để mở, kéo để di chuyển). Vị trí và chế độ được nhớ.
Menu Violentmonkey có: *hiện/ẩn bảng*, *đặt trang này làm trang đích* (dự phòng nếu bảng không hiện ở trang đích).

**Mã "Đã xác nhận" vs "Nghi ngờ":** chỉ mã có nhãn rõ ràng (`Mã: …`, `code: …`…), nhìn thấy được, đúng định dạng và nằm ở trang GTraffic hoặc trang đích bạn đã xác nhận mới được "Đã xác nhận". Mã từ OCR luôn là "Nghi ngờ" cho đến khi bạn bấm **Xác nhận**.

## 3. Cập nhật từ bản 1.x

1. Violentmonkey → mở script cũ **BYPASS KING - Traffic Assistant** → thay toàn bộ nội dung bằng file 2.0.0 (cùng `@namespace` nên dữ liệu cũ được giữ) hoặc cài mới rồi tắt bản cũ (**không bật cả hai**).
2. Lần chạy đầu, lịch sử link và thời gian cũ được **nhập tự động một lần** (các link không phải http/https bị bỏ). Dữ liệu v1 không bị xóa.
3. Khác biệt cần biết:
   - Trang ngoài GTraffic chỉ hiện bảng khi có **phiên đang chạy** và bạn đang ở Google/trang đích (thay cho công tắc "Theo dõi mã ở trang đích" cũ).
   - Nút `×` cũ → nay thu thành biểu tượng nổi (không còn xóa bảng khỏi trang).
   - Tự lưu link: lưu khi nhận diện được nhiệm vụ hoặc khi bắt đầu phiên (không lưu mọi trang GTraffic).
   - Bộ dò mã cũ nhận cả chuỗi 6–12 ký tự ngẫu nhiên; bản mới **đã bỏ** để không nhận nhầm.

## 4. Báo cáo kiểm thử

**Đã kiểm thử thật (Node 22, 53 kiểm tra tự động, đều đạt):**
- Cú pháp JavaScript (`node --check`); metadata; mọi `GM_*` được dùng đều có `@grant`; không có `eval`, `new Function`, `innerHTML` (chỉ còn trong chú thích), `GM_xmlhttpRequest`, `@connect`, `document.cookie`.
- SecurityManager: chặn `javascript:`, `data:`, `ftp:`, URL chứa user:pass; chuẩn hóa URL chống trùng; so khớp host (không bị lừa kiểu `evilexample.com`); lọc định dạng mã.
- StorageManager: migrate từ v1.x (chỉ chạy một lần, lọc link xấu).
- HistoryManager: chống trùng link (kể cả khác `#hash`), tìm kiếm, lọc thành công/thất bại, xóa, giới hạn 200.
- TimerManager: Start nhiều lần không chồng timer, Pause không trôi giờ, Resume, hết giờ chỉ thông báo **một** lần, interval được dọn, khôi phục sau khi tải lại.
- CodeDetection: nhãn Việt/Anh, không nhận nhầm "code of conduct"/"Code: example"/mã quá ngắn, loại trùng, mã ngoài trang đích = nghi ngờ, OCR không bao giờ tự xác nhận.
- TrafficManager: từ khóa rỗng bị từ chối, URL Google được mã hóa đúng, đích không hợp lệ bị từ chối, giới hạn thử lại 5 lần.

**CHƯA kiểm thử (môi trường của mình không có trình duyệt/DOM):**
- Giao diện thực tế: Compact, Floating, kéo thả, ghi nhớ vị trí, hiển thị trên màn hình điện thoại, Shadow DOM trên các website thật.
- OCR thật (tải Tesseract, worker, ngôn ngữ) và việc trang chặn bằng CSP.
- **Nhận diện nhiệm vụ trên DOM thật của GTraffic.** Mình chỉ có 3 ảnh chụp màn hình, không có HTML trang, nên bộ nhận diện dựa trên suy đoán từ ảnh ("Bước 01 – Vào Google và gõ từ…", khung từ khóa ngay phía dưới). Nếu trang đổi cấu trúc, nhận diện có thể trượt; khi đó bảng báo "chưa nhận diện được" và bạn nhập tay.
- Phát hiện mã trên các trang đích thật; thông báo hệ thống (`GM_notification`) và rung trên Android.

Nếu bạn gặp lỗi, gửi lại: trình duyệt + phiên bản, ảnh chụp, và (nếu được) phần HTML của khung nhiệm vụ để mình chỉnh bộ nhận diện cho khớp.

## 5. Giới hạn đã biết

- Từ khóa trên GTraffic có vẻ hiển thị kèm chữ nhiễu mờ. Mình lọc chữ mờ/quá nhỏ và ưu tiên từ xuất hiện ở 2 vùng, nhưng **không đảm bảo** đúng 100%; luôn kiểm tra trước khi mở Google (hiển thị độ tin cậy để bạn cân nhắc).
- OCR chạy trên ảnh bạn chọn; ảnh bị chặn CORS thì phải chụp màn hình rồi chọn file. OCR chỉ "gợi ý", kết quả có thể sai.
- `@require tesseract.js` được nạp ở mọi trang khớp `@match` (Violentmonkey không cho nạp có điều kiện), dù script thoát ngay khi không cần. Muốn nhẹ hơn: đổi `@match` chỉ còn `gtraffic.io` (đổi lại thì trang đích sẽ không có bảng).
- Tesseract tự tải worker/core/dữ liệu ngôn ngữ từ CDN (jsDelivr) khi chạy OCR; nên tự thêm hash SRI vào `@require` nếu muốn khóa chặt (`...min.js#sha256=<hash>`).
- Nút **Đổi từ khóa mới** chỉ bấm nút có sẵn của trang khi bạn bấm xác nhận; tối đa 3 lần/phiên, cách nhau 10 giây. Tùy chọn "gợi ý đổi từ khóa" chỉ hiện lời nhắc, không tự bấm.
- Đồng bộ giữa các tab dùng `GM_addValueChangeListener`; hai tab cùng ghi một lúc thì lần ghi sau thắng.
- Mỗi phiên tự hết hạn sau 45 phút.
