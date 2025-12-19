# Merge Log: dev → main

**Ngày merge**: $(date +%Y-%m-%d)  
**Từ branch**: dev  
**Vào branch**: main  
**Version hiện tại (main)**: 1.1  
**Version sau merge**: 1.2

---

## 📊 Tổng quan thay đổi

- **Số commits**: 3
- **Files thay đổi**: 15 files
- **Dòng code thêm**: +1,806
- **Dòng code xóa**: -448
- **Net change**: +1,358 dòng

---

## 📝 Danh sách Commits

### Commit 1: f41ff5e (2025-12-17)
**feat: Add auto-export feature for CSV, implement data validation, and enhance storage management**

- Thêm tính năng auto-export CSV sau khi scrape
- Implement data validation trước khi export
- Cải thiện storage management với auto-cleanup

### Commit 2: dc273c2 (2025-12-18)
**refactor: Enhance message handling and state management for scraper functionality**

- Refactor message handling
- Cải thiện state management cho scraper

### Commit 3: 0472ca4 (2025-12-19)
**feat: Add support for web-accessible resources, enhance load more button detection, and implement emoji/icon removal in text extraction**

- Thêm support cho web-accessible resources
- Cải thiện phát hiện load more button
- Implement xóa emoji/icon trong text extraction

---

## 📁 Files Changed

### Modified Files (13 files)

1. **background.js** (68 changes)
   - Cập nhật background service

2. **content.js** (22 changes)
   - Cải thiện content script

3. **core/pagination-handler.js** (231 changes)
   - Refactor pagination handling logic
   - Cải thiện skip logic
   - Fix slice products sớm

4. **handlers/ecommerce-handlers.js** (109 changes)
   - Enhance ecommerce handlers

5. **handlers/export-handler.js** (1,114 changes - MAJOR REFACTOR)
   - Complete refactor export handler
   - Thêm auto-export feature
   - Implement file splitting (>200 items)
   - Data validation
   - Batch processing
   - Memory optimization

6. **manifest.json** (8 changes)
   - Cập nhật manifest (có thể thêm web_accessible_resources)

7. **popup-main.js** (15 changes)
   - Thêm auto-export logic
   - UI updates

8. **popup.html** (6 changes)
   - Thêm checkbox auto-export

9. **services/dom-utils.js** (132 changes)
   - Enhance DOM utilities
   - Cải thiện load more button detection

10. **services/extraction-utils.js** (54 changes)
    - Implement emoji/icon removal
    - Cải thiện text extraction

11. **services/selector-utils.js** (106 changes)
    - Enhance selector utilities

12. **ui/popup-state.js** (200 changes)
    - Cải thiện state management
    - Storage cleanup logic
    - Fix state reset issues

13. **utils.js** (10 changes)
    - Minor utility updates

### Added Files (2 files)

1. **test/export-real-data.js** (111 lines)
   - Test file cho export functionality

2. **version-logs/v1.2.md** (68 lines)
   - Changelog cho version 1.2

---

## ✨ Tính năng mới

### 1. Auto-Export CSV
- Checkbox "Tự động export CSV sau khi scrape xong"
- Tự động chia file nếu >200 items (100 items/file)
- Tự động download sau khi scrape xong

### 2. Data Validation
- Validate data trước khi export
- Cảnh báo dataset lớn (>1000 items)
- Error handling tốt hơn

### 3. Storage Management
- Auto-cleanup data >24h
- Check quota trước khi save
- Save vào storage TRƯỚC khi send message

### 4. Web-Accessible Resources
- Support cho web-accessible resources trong manifest

### 5. Enhanced Load More Detection
- Cải thiện phát hiện load more button

### 6. Emoji/Icon Removal
- Tự động xóa emoji và icon trong text extraction

---

## 🐛 Bug Fixes

### 1. State không Reset sau khi Clear + Routing
**Vấn đề**: Sau khi xóa kết quả và routing sang category khác, phải F5 mới scrape được "1 click"

**Fix**:
- Clear storage state (`scrapeDetailsState`, `paginationState`) trước khi bắt đầu scrape mới
- Validate và cleanup state trong `handleScrapeListAndDetails`
- Đảm bảo requestId unique mỗi lần scrape

**Files affected**: `ui/popup-state.js`, `content.js`

### 2. Skip Logic không hoạt động đúng
**Vấn đề**: Khi skip=100, limit=100 → nên scrape items 101-200 nhưng lại scrape 1-100

**Fix**:
- Không slice products sớm trong pagination/scroll handlers
- Trả về tất cả products scraped, để caller xử lý skip logic
- Apply skip sau khi extract links: `.slice(skipProducts, skipProducts + maxDetails)`
- Validate: đảm bảo có đủ items trước khi apply skip
- Scrape đủ số lượng: `totalToScrape = skipProducts + maxProducts`

**Files affected**: `core/pagination-handler.js`

### 3. Browser Crash khi Export Large Datasets
**Vấn đề**: Crash khi export >200 items CSV

**Fix**:
- Chia thành nhiều files (100 items/file)
- Batch processing
- Truncation limits
- Depth limit (5)
- Memory optimization

**Files affected**: `handlers/export-handler.js`

### 4. Files không Download được
**Vấn đề**: Logs hiển thị nhưng files không xuất hiện

**Fix**:
- Tăng delay revoke URL (3000ms)
- Delay giữa downloads (2500ms)
- Double requestAnimationFrame

**Files affected**: `handlers/export-handler.js`

### 5. Crash khi xử lý Item thứ 50
**Vấn đề**: Crash ở item 50/100 trong chunk đầu tiên

**Fix**:
- Cải thiện error handling
- Giới hạn keys/object (1000)
- Skip items lỗi thay vì crash

**Files affected**: `handlers/export-handler.js`

### 6. Storage Overflow & Data Loss
**Fix**:
- Check quota trước khi save
- Auto-cleanup
- Save vào storage TRƯỚC khi send message

**Files affected**: `ui/popup-state.js`, `handlers/export-handler.js`

---

## 🔧 Cải thiện Performance

- **Memory**: Chia files nhỏ, batch processing, truncation limits
  - String: 50k chars
  - Row: 1M chars
  - Array: 500 items
- **Export**: Collect headers từ 5 items đầu, batch join rows, direct download cho files >2MB
- **Code**: Refactor từ 982 → 739 dòng trong export-handler.js, loại bỏ code trùng lặp

---

## ⚠️ Breaking Changes

**KHÔNG CÓ** - Tất cả changes đều backward compatible

---

## 🧪 Testing Checklist

Sau khi merge, cần test các scenarios sau:

### 1. Basic Scraping
- [ ] Scrape trang `thuc-phamchuc-nang/...` - phải hoạt động như version 1.1
- [ ] Scrape trang `duoc-my-pham/...` - phải hoạt động như version 1.1
- [ ] Scrape với skip/limit - verify skip logic hoạt động đúng

### 2. State Management
- [ ] Clear results → Routing sang category khác → Scrape "1 click" - phải hoạt động ngay không cần F5
- [ ] Scrape detail sau khi scrape list - phải hoạt động ở lần click đầu tiên

### 3. Auto-Export
- [ ] Enable auto-export checkbox
- [ ] Scrape <200 items → Verify 1 file CSV được download
- [ ] Scrape >200 items → Verify nhiều files được download (100 items/file)
- [ ] Disable auto-export → Verify không tự động export

### 4. Export Functionality
- [ ] Manual export <200 items
- [ ] Manual export >200 items (verify file splitting)
- [ ] Export >1000 items (verify warning message)
- [ ] Verify files download được (không bị lỗi)

### 5. Storage Management
- [ ] Verify auto-cleanup data >24h
- [ ] Verify quota check trước khi save
- [ ] Test với dataset lớn (verify không bị overflow)

### 6. Text Extraction
- [ ] Verify emoji/icon được xóa trong extracted text
- [ ] Verify load more button được detect đúng

---

## 📋 Workflow Changes

**Trước (v1.1)**:
```
User scrape → Save → User manually export → Download
```

**Sau (v1.2)**:
```
User scrape → Save → Auto-export (nếu enabled) → Auto-split → Download
```

---

## 🔍 Files cần chú ý khi Debug

### High Priority
1. **handlers/export-handler.js** - Major refactor, nhiều logic mới
2. **core/pagination-handler.js** - Fix skip logic, có thể ảnh hưởng scraping
3. **ui/popup-state.js** - State management changes, có thể ảnh hưởng workflow

### Medium Priority
4. **services/dom-utils.js** - Load more button detection
5. **services/extraction-utils.js** - Emoji/icon removal
6. **content.js** - Message handling changes

---

## ⚠️ Potential Issues to Monitor

1. **Memory issues** với datasets >500 items (đã có split files nhưng cần monitor)
2. **Download failures** với >10 files (đã có delays nhưng cần verify)
3. **Circular references** trong data (đã có WeakSet detection)
4. **State conflicts** khi user navigate nhanh giữa các categories
5. **Storage quota** với datasets rất lớn (>5000 items)

---

## 📚 Related Documentation

- Xem chi tiết trong `version-logs/v1.2.md`
- Test file: `test/export-real-data.js`

---

## ✅ Merge Steps

1. ✅ Tạo merge log file (file này)
2. ⏳ Merge dev vào main: `git merge dev`
3. ⏳ Resolve conflicts (nếu có)
4. ⏳ Test các scenarios trong checklist
5. ⏳ Commit merge (nếu cần)
6. ⏳ Push lên origin/main

---

**Lưu ý**: File log này được tạo tự động trước khi merge. Nếu có issues sau khi merge, tham khảo phần "Files cần chú ý khi Debug" và "Potential Issues to Monitor" ở trên.

