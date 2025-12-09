# 📊 Data Scraper Tool

Extension Chrome để scrape và export dữ liệu từ các trang web.

## ✨ Tính năng

### 🌐 General (Dùng cho mọi trang web)
- **Scrape nhanh**: Table, Links, Images
- **Scrape tùy chỉnh**: Sử dụng CSS selector để scrape dữ liệu
- **Highlight elements**: Xem trước các elements sẽ được scrape
- **Auto-detect selector**: Tự động tìm CSS selector phù hợp

### 🏥 Long Châu (Tối ưu cho nhathuoclongchau.com.vn)
- **Scrape sản phẩm**: Danh sách sản phẩm với pagination/scroll
- **Scrape chi tiết**: Thông tin chi tiết sản phẩm (tên, giá, mô tả, thông số)
- **API scraping**: Scrape trực tiếp từ API Long Châu (nhanh và chính xác)
- **Batch scraping**: Scrape chi tiết nhiều sản phẩm tự động

### 💾 Export & Utilities
- **Export dữ liệu**: Export sang JSON hoặc CSV
- **UI đẹp**: Giao diện hiện đại, 2 tabs rõ ràng (General & Long Châu)

## 🚀 Cài đặt

1. Mở Chrome và vào `chrome://extensions/`
2. Bật "Developer mode" (góc trên bên phải)
3. Click "Load unpacked"
4. Chọn thư mục `product_scraper_tool`
5. Extension đã sẵn sàng sử dụng!

## 📖 Hướng dẫn sử dụng

> 📘 **Xem hướng dẫn chi tiết**: [GUIDE.md](./GUIDE.md) - Hướng dẫn từng bước với ví dụ cụ thể và troubleshooting

### 🌐 Tab General - Dùng cho mọi trang web

#### Scrape nhanh
1. Mở trang web cần scrape
2. Click vào icon extension → Tab **🌐 General**
3. Chọn một trong các tùy chọn:
   - **📊 Scrape Table**: Lấy dữ liệu từ bảng
   - **🔗 Scrape Links**: Lấy tất cả links trên trang
   - **🖼️ Scrape Images**: Lấy tất cả hình ảnh

#### Scrape tùy chỉnh
1. Vào tab **🌐 General** → Phần "🎯 Scrape tùy chỉnh"
2. Nhập CSS selector (ví dụ: `.product`, `#content`, `h1`)
3. (Tùy chọn) Nhập attribute cần lấy (ví dụ: `href`, `src`, `data-id`)
4. Click "🎯 Scrape"
5. Hoặc click "🔍 Highlight Elements" để xem trước

### 🏥 Tab Long Châu - Tối ưu cho nhathuoclongchau.com.vn

#### Scrape danh sách sản phẩm
1. Mở trang danh sách sản phẩm (ví dụ: `https://nhathuoclongchau.com.vn/thuc-pham-chuc-nang`)
2. Click vào icon extension → Tab **🏥 Long Châu**
3. Nhập số lượng sản phẩm cần scrape (mặc định: 100)
4. (Tùy chọn) Nhập CSS selector nếu extension không tự động tìm được
5. Chọn phương thức:
   - **📊 Scrape (Scroll + "Xem thêm")**: Tự động scroll và click "Xem thêm"
   - **📄 Scrape (Pagination)**: Tự động chuyển trang
6. Extension sẽ tự động scrape cho đến khi đủ số lượng yêu cầu

**Lưu ý**: 
- Quá trình có thể mất vài phút tùy vào số lượng sản phẩm
- Extension sẽ tự động dừng khi không còn sản phẩm mới hoặc đã đủ số lượng

#### Scrape chi tiết sản phẩm
1. Mở trang chi tiết sản phẩm (ví dụ: `https://nhathuoclongchau.com.vn/thuc-pham-chuc-nang/...`)
2. Click vào icon extension → Tab **🏥 Long Châu**
3. Click **🔍 Scrape Chi Tiết (Trang hiện tại)**
4. Extension sẽ lấy tất cả thông tin chi tiết: tên, giá, hình ảnh, mô tả, thông số kỹ thuật, v.v.

#### Scrape chi tiết từ danh sách
1. Sau khi đã scrape danh sách sản phẩm
2. Click **📋 Scrape Chi Tiết Từ List (Đã scrape)**
3. Extension sẽ tự động mở từng trang sản phẩm và scrape chi tiết
4. Quá trình có thể mất vài phút tùy vào số lượng sản phẩm

#### Scrape từ API (Khuyến nghị)
1. Mở trang danh sách sản phẩm Long Châu
2. Click vào icon extension → Tab **🏥 Long Châu**
3. (Tùy chọn) Nhập category (ví dụ: `thuc-pham-chuc-nang`)
4. Click **🏥 Scrape từ Long Châu API**
5. Extension sẽ scrape trực tiếp từ API (nhanh và chính xác 100%)

**Ưu điểm API scraping:**
- ✅ Dữ liệu chính xác 100%
- ✅ Nhanh hơn DOM scraping
- ✅ Đầy đủ thông tin từ API

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
├── popup.html         # Giao diện popup
├── content.js         # Main entry point (content script)
├── popup-main.js      # Main entry point (popup script)
├── background.js      # Service worker
├── config.js          # Cấu hình chung
├── utils.js           # Backward compatibility layer
│
├── core/              # Core scraping logic
│   ├── base-scraper.js        # Scraping cơ bản (table, links, images)
│   ├── product-scraper.js     # Product list scraping
│   ├── detail-scraper.js      # Product detail scraping (placeholder)
│   ├── pagination-handler.js  # Pagination & scroll logic
│   └── api-scraper.js         # API scraping
│
├── services/          # Utilities & services
│   ├── dom-utils.js           # DOM manipulation utilities
│   ├── selector-utils.js      # Selector helpers
│   ├── extraction-utils.js     # Product info extraction
│   └── state-manager.js        # State management (chrome.storage)
│
├── handlers/          # Event & message handlers
│   ├── message-handler.js     # Message routing (content script)
│   ├── highlight-manager.js   # Element highlighting
│   ├── export-handler.js      # Data export (JSON, CSV)
│   ├── generic-handlers.js    # Generic handlers (mọi trang)
│   └── ecommerce-handlers.js  # E-commerce handlers (Long Châu)
│
├── ui/                # UI logic (popup)
│   ├── popup-state.js         # State management
│   ├── popup-display.js       # Display functions
│   └── popup-scrape.js        # Common scraping logic
│
└── icons/             # Icons extension
```

### 📝 Mô tả modules:

- **core/**: Logic scraping chính (base, product, detail, pagination, API)
- **services/**: Utilities và services dùng chung (DOM, selector, extraction, state)
- **handlers/**: Xử lý messages và events (message routing, highlight, export, UI handlers)
- **ui/**: Logic UI cho popup (state, display, scraping helpers)

### 🎯 Kiến trúc:

Extension được refactor thành cấu trúc modular:
- **Single Responsibility**: Mỗi module có một nhiệm vụ rõ ràng
- **Separation of Concerns**: Tách biệt logic scraping, UI, và utilities
- **Backward Compatibility**: `utils.js` giữ lại để tương thích với code cũ
- **Easy Maintenance**: Dễ dàng thêm/sửa/xóa features

## ⚡ Tối ưu hiệu năng

Extension đã được tối ưu để cải thiện hiệu năng:

- **DOM Query Caching**: Cache kết quả query để giảm số lần truy vấn DOM
- **Category Extraction Cache**: Cache category data để tránh extract lại nhiều lần
- **Optimized Loops**: Sử dụng `for...of` thay vì `forEach` cho hiệu năng tốt hơn
- **State Management**: Tự động cleanup các states cũ để tránh memory leaks
- **Smart Validation**: Tối ưu validation logic để giảm tính toán không cần thiết

## 📄 License

MIT

