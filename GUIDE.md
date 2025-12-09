# 📖 Hướng dẫn sử dụng chi tiết - Data Scraper Tool

Hướng dẫn từng bước để sử dụng extension một cách hiệu quả nhất.

## 📋 Mục lục

1. [Cài đặt và thiết lập ban đầu](#cài-đặt-và-thiết-lập-ban-đầu)
2. [Tab General - Scrape cho mọi trang web](#tab-general---scrape-cho-mọi-trang-web)
3. [Tab Long Châu - Scrape sản phẩm](#tab-long-châu---scrape-sản-phẩm)
4. [Export dữ liệu](#export-dữ-liệu)
5. [Tips & Tricks](#tips--tricks)
6. [Troubleshooting](#troubleshooting)

---

## 🚀 Cài đặt và thiết lập ban đầu

### Bước 1: Cài đặt Extension

1. Mở Google Chrome
2. Vào `chrome://extensions/` (hoặc `Menu > More tools > Extensions`)
3. Bật **Developer mode** (góc trên bên phải)
4. Click **Load unpacked**
5. Chọn thư mục `product_scraper_tool`
6. Extension sẽ xuất hiện trong danh sách extensions

### Bước 2: Kiểm tra Extension

1. Click vào icon extension trên thanh toolbar
2. Popup sẽ hiển thị với 2 tabs: **🌐 General** và **🏥 Long Châu**
3. Nếu popup không hiển thị, reload trang web và thử lại

---

## 🌐 Tab General - Scrape cho mọi trang web

Tab này dùng được cho **mọi trang web**, không chỉ Long Châu.

### 1. Scrape nhanh (Quick Scrape)

Các chức năng scrape nhanh không cần cấu hình:

#### 📊 Scrape Table
- **Khi nào dùng**: Khi trang có bảng dữ liệu (table)
- **Cách dùng**: 
  1. Mở trang có bảng
  2. Click icon extension → Tab **🌐 General**
  3. Click **📊 Scrape Table**
  4. Kết quả sẽ hiển thị dưới dạng JSON/CSV

**Ví dụ**: Scrape bảng giá, bảng sản phẩm, bảng thông tin...

#### 🔗 Scrape Links
- **Khi nào dùng**: Cần lấy tất cả links trên trang
- **Cách dùng**: Click **🔗 Scrape Links**
- **Kết quả**: Danh sách tất cả links với text và href

**Ví dụ**: Lấy danh sách links sản phẩm, links bài viết...

#### 🖼️ Scrape Images
- **Khi nào dùng**: Cần lấy tất cả hình ảnh trên trang
- **Cách dùng**: Click **🖼️ Scrape Images**
- **Kết quả**: Danh sách images với src, alt, width, height

**Ví dụ**: Lấy gallery ảnh, ảnh sản phẩm...

### 2. Scrape tùy chỉnh (Custom Scrape)

Khi cần scrape dữ liệu cụ thể với CSS selector:

#### Bước 1: Tìm CSS Selector

**Cách 1: Tự động detect (Khuyến nghị)**
1. Click **🔍 Auto-detect Selector**
2. Extension sẽ tự động tìm selector phù hợp
3. Selector sẽ được điền vào ô input

**Cách 2: Tự nhập selector**
- Sử dụng DevTools (F12) để inspect element
- Copy CSS selector từ Elements tab
- Paste vào ô "CSS Selector"

**Ví dụ selectors phổ biến:**
```
.product-item        → Tất cả elements có class "product-item"
#product-list        → Element có id "product-list"
.product .title       → Element có class "title" trong ".product"
a[href*="product"]   → Tất cả links chứa "product" trong href
```

#### Bước 2: Test Selector (Tùy chọn)

1. Nhập selector vào ô input
2. Click **🔍 Test Selector**
3. Xem kết quả:
   - Số lượng elements tìm thấy
   - Mẫu dữ liệu (sample) của 5 elements đầu tiên

#### Bước 3: Highlight Elements (Tùy chọn)

1. Nhập selector
2. Click **🔍 Highlight Elements**
3. Các elements sẽ được highlight trên trang
4. Kiểm tra xem có đúng elements cần scrape không

#### Bước 4: Scrape

1. Nhập CSS selector
2. (Tùy chọn) Nhập attribute nếu cần lấy attribute thay vì text:
   - `href` → Lấy link
   - `src` → Lấy image source
   - `data-id` → Lấy data attribute
3. Click **🎯 Scrape**
4. Kết quả sẽ hiển thị trong modal

---

## 🏥 Tab Long Châu - Scrape sản phẩm

Tab này được tối ưu đặc biệt cho **nhathuoclongchau.com.vn**.

### 1. Scrape danh sách sản phẩm

#### Phương thức 1: Scroll + "Xem thêm" (Khuyến nghị)

**Khi nào dùng**: Trang có nút "Xem thêm" để load thêm sản phẩm

**Cách dùng**:
1. Mở trang danh sách sản phẩm (ví dụ: `https://nhathuoclongchau.com.vn/thuc-pham-chuc-nang`)
2. Click icon extension → Tab **🏥 Long Châu**
3. Nhập số lượng sản phẩm cần scrape (mặc định: 100)
4. (Tùy chọn) Nhập CSS selector nếu extension không tự detect được
5. Click **📊 Scrape (Scroll + "Xem thêm")**
6. Extension sẽ:
   - Tự động scroll trang
   - Click nút "Xem thêm" khi cần
   - Scrape sản phẩm cho đến khi đủ số lượng

**Lưu ý**:
- Quá trình có thể mất 2-5 phút tùy số lượng
- Đừng đóng popup hoặc tab trong khi đang scrape
- Extension sẽ tự dừng khi đủ số lượng hoặc hết sản phẩm

#### Phương thức 2: Pagination

**Khi nào dùng**: Trang có phân trang (1, 2, 3...)

**Cách dùng**:
1. Mở trang danh sách sản phẩm
2. Nhập số lượng sản phẩm cần scrape
3. Click **📄 Scrape (Pagination)**
4. Extension sẽ tự động chuyển trang và scrape

**Lưu ý**:
- Extension sẽ tự động tìm nút "Trang sau" hoặc "Next"
- Nếu không tìm thấy nút, có thể nhập selector tùy chỉnh

### 2. Scrape chi tiết sản phẩm

#### Scrape chi tiết trang hiện tại

**Khi nào dùng**: Đang ở trang chi tiết sản phẩm

**Cách dùng**:
1. Mở trang chi tiết sản phẩm (URL có `.html`)
2. Click icon extension → Tab **🏥 Long Châu**
3. (Tùy chọn) Bật **Force API** nếu muốn ưu tiên lấy từ API
4. Click **🔍 Scrape Chi Tiết (Trang hiện tại)**
5. Extension sẽ lấy:
   - Tên sản phẩm
   - Giá
   - Hình ảnh
   - Mô tả
   - Thành phần
   - Công dụng
   - Cách dùng
   - Thông số kỹ thuật
   - Và nhiều thông tin khác

**Force API là gì?**
- Extension sẽ ưu tiên lấy dữ liệu từ API Long Châu
- Dữ liệu chính xác 100% và đầy đủ hơn
- Nếu API không có, sẽ fallback về DOM scraping

#### Scrape chi tiết từ danh sách đã scrape

**Khi nào dùng**: Đã scrape danh sách sản phẩm, muốn lấy chi tiết cho tất cả

**Cách dùng**:
1. Trước tiên, scrape danh sách sản phẩm (xem mục 1)
2. Sau khi có danh sách, click **📋 Scrape Chi Tiết Từ List (Đã scrape)**
3. (Tùy chọn) Nhập số sản phẩm muốn skip (bỏ qua) ở đầu danh sách
4. (Tùy chọn) Bật **Force API**
5. Click **Scrape**
6. Extension sẽ:
   - Tự động mở từng trang sản phẩm
   - Scrape chi tiết
   - Chuyển sang sản phẩm tiếp theo
   - Hiển thị progress bar

**Lưu ý**:
- Quá trình có thể mất 5-15 phút tùy số lượng
- **Đừng đóng popup hoặc tab** trong khi đang scrape
- Extension sẽ tự động navigate giữa các trang
- Dữ liệu sẽ được lưu tự động, kể cả khi đóng popup

### 3. Scrape từ API Long Châu (Khuyến nghị)

**Ưu điểm**:
- ✅ Nhanh nhất (không cần scroll/pagination)
- ✅ Dữ liệu chính xác 100%
- ✅ Đầy đủ thông tin từ API
- ✅ Không cần navigate giữa các trang

**Cách dùng**:
1. Mở trang danh sách sản phẩm Long Châu
2. Click icon extension → Tab **🏥 Long Châu**
3. Nhập số lượng sản phẩm cần scrape
4. (Tùy chọn) Nhập category slug (ví dụ: `thuc-pham-chuc-nang`)
   - Nếu không nhập, extension sẽ tự detect từ URL
5. Click **🏥 Scrape từ Long Châu API**
6. Extension sẽ gọi API trực tiếp và lấy dữ liệu

**Ví dụ categories**:
- `thuc-pham-chuc-nang` - Thực phẩm chức năng
- `thuoc` - Thuốc
- `my-pham` - Mỹ phẩm
- `cham-soc-suc-khoe` - Chăm sóc sức khỏe

### 4. Scrape List + Detail (1 click)

**Tính năng mới**: Scrape cả danh sách và chi tiết trong 1 lần click!

**Cách dùng**:
1. Mở trang danh sách sản phẩm
2. Nhập số lượng sản phẩm
3. Click **🚀 Scrape List + Detail (1 click)**
4. Chọn phương thức scrape list:
   - **Scroll**: Scroll + "Xem thêm"
   - **Pagination**: Chuyển trang
5. Extension sẽ:
   - **Bước 1**: Scrape danh sách sản phẩm
   - **Bước 2**: Tự động scrape chi tiết cho tất cả sản phẩm trong danh sách

**Lưu ý**:
- Quá trình có thể mất 10-20 phút
- Đảm bảo có đủ thời gian và không đóng tab

---

## 💾 Export dữ liệu

Sau khi scrape thành công, bạn có thể export dữ liệu:

### Export JSON

1. Click **💾 Export JSON**
2. File sẽ được tải xuống với tên `scraped-data-[timestamp].json`
3. Có thể mở bằng text editor hoặc import vào database

**Cấu trúc JSON**:
```json
[
  {
    "name": "Tên sản phẩm",
    "price": "100.000đ",
    "link": "https://...",
    "image": "https://...",
    ...
  }
]
```

### Export CSV

1. Click **📄 Export CSV**
2. File sẽ được tải xuống với tên `scraped-data-[timestamp].csv`
3. Có thể mở bằng Excel, Google Sheets, hoặc bất kỳ tool nào hỗ trợ CSV

**Lưu ý**:
- CSV sẽ tự động escape các ký tự đặc biệt
- Encoding: UTF-8 với BOM để hiển thị tiếng Việt đúng trong Excel

### Xóa dữ liệu

- Click **🗑️ Clear Results** để xóa dữ liệu đã scrape
- Dữ liệu trong storage cũng sẽ bị xóa

---

## 💡 Tips & Tricks

### 1. Tối ưu hiệu năng

- **Dùng API scraping** khi có thể (nhanh nhất)
- **Scrape từng phần**: Nếu cần nhiều sản phẩm, chia nhỏ ra
- **Dùng Force API** cho chi tiết sản phẩm (chính xác hơn)

### 2. Tìm CSS Selector hiệu quả

**Cách 1: Dùng DevTools**
1. F12 → Elements tab
2. Right-click element → Copy → Copy selector
3. Paste vào extension

**Cách 2: Dùng Auto-detect**
- Click **Auto-detect Selector** trong extension
- Extension sẽ tự tìm selector phù hợp

**Cách 3: Tự viết selector**
- Học CSS selectors cơ bản
- Test bằng **Test Selector** trước khi scrape

### 3. Xử lý dữ liệu lớn

- **Chia nhỏ**: Scrape 50-100 sản phẩm/lần
- **Export thường xuyên**: Export sau mỗi lần scrape
- **Dùng API**: API scraping nhanh hơn và ít lỗi hơn

### 4. Scrape nhiều trang

1. Scrape danh sách từ trang 1
2. Export dữ liệu
3. Chuyển sang trang 2
4. Scrape tiếp và merge dữ liệu

### 5. Lưu selector yêu thích

- Ghi lại các selector hiệu quả
- Dùng lại cho các trang tương tự

---

## 🔧 Troubleshooting

### Vấn đề: Extension không hoạt động

**Giải pháp**:
1. Reload trang web (F5)
2. Kiểm tra xem extension đã được enable chưa
3. Mở DevTools (F12) → Console → Xem có lỗi không
4. Thử reload extension trong `chrome://extensions/`

### Vấn đề: Không tìm thấy selector

**Giải pháp**:
1. Dùng **Auto-detect Selector**
2. Kiểm tra xem trang đã load xong chưa (đợi vài giây)
3. Thử selector đơn giản hơn (ví dụ: `.product` thay vì `.product-item .title`)
4. Dùng **Highlight Elements** để kiểm tra

### Vấn đề: Scrape không đủ sản phẩm

**Giải pháp**:
1. Tăng `maxScrolls` hoặc `maxPages` trong code (nếu có quyền)
2. Kiểm tra xem trang có đủ sản phẩm không
3. Thử phương thức khác (Scroll thay vì Pagination)
4. Dùng API scraping (nếu có)

### Vấn đề: Scrape chi tiết bị lỗi

**Giải pháp**:
1. Bật **Force API** để lấy từ API
2. Kiểm tra xem trang có phải trang chi tiết không (URL có `.html`)
3. Đợi trang load xong trước khi scrape
4. Thử reload trang và scrape lại

### Vấn đề: Export CSV bị lỗi encoding

**Giải pháp**:
1. Mở CSV bằng Excel
2. Chọn **Data > From Text/CSV**
3. Chọn encoding: **UTF-8**
4. Import lại

### Vấn đề: Popup đóng khi đang scrape

**Giải pháp**:
- **Không sao!** Extension sẽ tiếp tục scrape
- Dữ liệu sẽ được lưu vào storage
- Mở lại popup sau khi scrape xong để xem kết quả
- Hoặc check storage trong DevTools → Application → Local Storage

### Vấn đề: Scrape quá chậm

**Giải pháp**:
1. Dùng **API scraping** thay vì DOM scraping
2. Giảm số lượng sản phẩm mỗi lần scrape
3. Tắt các extension khác có thể làm chậm browser
4. Kiểm tra kết nối internet

### Vấn đề: Dữ liệu bị thiếu hoặc sai

**Giải pháp**:
1. Dùng **Force API** cho chi tiết sản phẩm
2. Kiểm tra selector có đúng không
3. Dùng **Test Selector** để xem mẫu dữ liệu
4. Thử scrape lại với selector khác

---

## 📞 Hỗ trợ

Nếu gặp vấn đề không giải quyết được:

1. Kiểm tra Console (F12) để xem lỗi
2. Thử các giải pháp trong phần Troubleshooting
3. Kiểm tra README.md để xem cấu trúc code
4. Xem lại hướng dẫn này

---

## 🎉 Chúc bạn scrape thành công!

Extension này được thiết kế để giúp bạn scrape dữ liệu một cách dễ dàng và hiệu quả. Hãy thử nghiệm và tìm ra cách sử dụng phù hợp nhất với nhu cầu của bạn!

**Lưu ý quan trọng**:
- Chỉ scrape dữ liệu công khai
- Tuân thủ Terms of Service của website
- Không scrape quá nhiều để tránh làm quá tải server
- Sử dụng có trách nhiệm

