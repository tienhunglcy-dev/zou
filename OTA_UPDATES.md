# Cập nhật Zou không cần cài lại IPA

Bản IPA được tạo sau commit này đã bật Expo Updates và nhận cập nhật từ kênh `preview`.

## Khi thay đổi giao diện hoặc JavaScript

Sau khi kiểm tra thay đổi trên máy, chạy lệnh sau tại thư mục dự án:

```powershell
npx eas-cli@latest update --channel preview --message "Mô tả ngắn thay đổi" --environment preview
```

Người dùng cần đóng hẳn rồi mở lại ứng dụng. Lần mở đầu ứng dụng tải bản cập nhật trong nền; lần mở tiếp theo dùng giao diện mới. Trong ứng dụng, họ cũng có thể vào **Tôi → Kiểm tra bản cập nhật** để tải và mở ngay bản mới.

## Khi nào cần tạo IPA mới

Phải build IPA mới nếu cập nhật Expo/React Native, thêm thư viện native, đổi quyền iOS, bundle ID, biểu tượng hoặc cấu hình native. Với các thay đổi giao diện, JavaScript và ảnh tĩnh, chỉ cần chạy lệnh `eas update` ở trên.
