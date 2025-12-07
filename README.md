# 📊 Data Scraper Tool

Extension Chrome để scrape và export dữ liệu từ các trang web.

## ✨ Tính năng

- **Scrape nhanh**: Table, Links, Images, Products
- **Scrape tùy chỉnh**: Sử dụng CSS selector để scrape dữ liệu
- **Highlight elements**: Xem trước các elements sẽ được scrape
- **Export dữ liệu**: Export sang JSON hoặc CSV
- **UI đẹp**: Giao diện hiện đại, dễ sử dụng

## 🚀 Cài đặt

1. Mở Chrome và vào `chrome://extensions/`
2. Bật "Developer mode" (góc trên bên phải)
3. Click "Load unpacked"
4. Chọn thư mục `product_scraper_tool`
5. Extension đã sẵn sàng sử dụng!

## 📖 Hướng dẫn sử dụng

### Scrape nhanh

1. Mở trang web cần scrape
2. Click vào icon extension
3. Chọn một trong các tùy chọn:
   - **📊 Scrape Table**: Lấy dữ liệu từ bảng
   - **🔗 Scrape Links**: Lấy tất cả links trên trang
   - **🖼️ Scrape Images**: Lấy tất cả hình ảnh
   - **🛍️ Scrape Products**: Lấy thông tin sản phẩm (e-commerce)

### Scrape E-commerce (Nhiều sản phẩm)

1. Mở trang danh sách sản phẩm (ví dụ: `https://nhathuoclongchau.com.vn/thuc-pham-chuc-nang`)
2. Click vào icon extension → Tab **🛍️ E-commerce**
3. Nhập số lượng sản phẩm cần scrape (mặc định: 100)
4. (Tùy chọn) Nhập CSS selector nếu extension không tự động tìm được
5. Click **📊 Scrape Nhiều Sản Phẩm (Auto-scroll)**
6. Extension sẽ tự động scroll trang để tải thêm sản phẩm cho đến khi đủ số lượng yêu cầu

**Lưu ý**: 
- Quá trình có thể mất vài phút tùy vào số lượng sản phẩm
- Extension sẽ tự động dừng khi không còn sản phẩm mới hoặc đã đủ số lượng

### Scrape chi tiết sản phẩm

1. Mở trang chi tiết sản phẩm (ví dụ: `https://nhathuoclongchau.com.vn/thuc-pham-chuc-nang/...`)
2. Click vào icon extension → Tab **🛍️ E-commerce**
3. Click **🔍 Scrape Chi Tiết Sản Phẩm**
4. Extension sẽ lấy tất cả thông tin chi tiết: tên, giá, hình ảnh, mô tả, thông số kỹ thuật, v.v.

### Scrape tùy chỉnh

1. Vào tab "⚙️ Tùy chỉnh"
2. Nhập CSS selector (ví dụ: `.product`, `#content`, `h1`)
3. (Tùy chọn) Nhập attribute cần lấy (ví dụ: `href`, `src`, `data-id`)
4. Click "🎯 Scrape"
5. Hoặc click "🔍 Highlight Elements" để xem trước

### Export dữ liệu

Sau khi scrape thành công:
- Click "💾 Export JSON" để export sang file JSON
- Click "📄 Export CSV" để export sang file CSV

## 🎯 Ví dụ CSS Selectors

- `.product` - Tất cả elements có class "product"
- `#header` - Element có id "header"
- `h1, h2, h3` - Tất cả thẻ heading
- `.product .price` - Element có class "price" trong ".product"
- `a[href]` - Tất cả links
- `img[src]` - Tất cả hình ảnh

## 📝 Lưu ý

- Extension cần quyền truy cập vào tất cả các trang web
- Dữ liệu được scrape từ DOM hiện tại của trang
- Một số trang có thể chặn scraping (CORS, CSP)

## 🔧 Cấu trúc file

```
product_scraper_tool/
├── manifest.json      # Cấu hình extension
├── content.js         # Script chạy trên trang web
├── popup.html         # Giao diện popup
├── popup.js           # Logic popup
├── background.js      # Service worker
└── icons/             # Icons extension
```

## 📄 License

MIT

