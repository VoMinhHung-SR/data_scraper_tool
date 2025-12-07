# 🔧 REFACTOR PLAN - Product Scraper Tool

## 📊 Phân tích hiện tại

### Vấn đề:
1. ❌ `content.js` quá lớn (2032 dòng) - chứa quá nhiều logic
2. ❌ Logic trùng lặp giữa pagination và scroll scraping
3. ❌ State management rối (chrome.storage.local không có namespace)
4. ❌ Naming không nhất quán
5. ❌ Khó test và maintain

### Files hiện tại (After Phase 1 & 2):
```
├── content.js         (1830 dòng) ⚠️ Đang refactor → Target: ~200 lines
├── utils.js           (100 dòng)  ✅ Đã refactor (backward compatibility layer)
├── api-scraper.js     (223 dòng)  ✅ OK → Will move to core/
├── popup.js           (835 dòng)  ⏳ Chưa refactor → Target: ~100 lines
├── background.js      (154 dòng)  ✅ OK
├── config.js          (18 dòng)   ✅ OK
│
├── services/          ✅ NEW (Phase 1)
│   ├── dom-utils.js           (102 lines)
│   ├── selector-utils.js      (183 lines)
│   └── extraction-utils.js   (283 lines)
│
└── handlers/          ✅ NEW (Phase 2)
    ├── highlight-manager.js   (60 lines)
    └── message-handler.js    (293 lines)
```

---

## 📈 PROGRESS SUMMARY

### ✅ **Phase 1: Extract Utilities** - COMPLETED
- ✅ Created `services/dom-utils.js` (102 lines)
- ✅ Created `services/selector-utils.js` (183 lines)
- ✅ Created `services/extraction-utils.js` (283 lines)
- ✅ Updated `utils.js` as backward compatibility layer (100 lines)
- ✅ **Result:** Extracted 568 lines to services/, reduced utils.js by 122 lines

### ✅ **Phase 2: Extract Handlers** - COMPLETED
- ✅ Created `handlers/highlight-manager.js` (60 lines)
- ✅ Created `handlers/message-handler.js` (293 lines)
- ✅ Updated `content.js` to use new handlers
- ✅ **Result:** Reduced content.js by 202 lines (2032 → 1830)

### ⏳ **Phase 3: Extract Core Scrapers** - IN PROGRESS (Next)
- ⏳ Need to extract ~1600 lines from content.js to core/
- ⏳ Expected: content.js → ~200 lines (main entry point only)

### ⏳ **Phase 4: Refactor UI** - TODO
- ⏳ Need to extract ~700 lines from popup.js to ui/

### ⏳ **Phase 5: Cleanup** - TODO

**Overall Progress:** 2/5 phases completed (40%) 🎯

---

## 🎯 Cấu trúc mới (Optimized)

```
product_scraper_tool/
├── manifest.json
├── popup.html
├── config.js                  ✅ GIỮ NGUYÊN
│
├── core/                      🆕 LOGIC CHÍNH
│   ├── base-scraper.js        # Scraping cơ bản (table, links, images)
│   ├── product-scraper.js     # Product list scraping
│   ├── detail-scraper.js      # Product detail scraping
│   ├── pagination-handler.js  # Pagination & scroll logic
│   └── api-scraper.js         # API scraping (move từ root)
│
├── services/                  🆕 UTILITIES
│   ├── state-manager.js       # Quản lý state (chrome.storage)
│   ├── dom-utils.js           # DOM utilities
│   ├── selector-utils.js      # Selector helpers
│   └── extraction-utils.js    # Extract product info
│
├── handlers/                  🆕 HANDLERS
│   ├── message-handler.js     # Message routing
│   ├── highlight-manager.js   # Highlight elements
│   └── export-handler.js      # Export logic
│
├── ui/                        🆕 UI LOGIC
│   ├── popup-main.js          # Main UI logic
│   └── popup-handlers.js      # Event handlers
│
└── background.js              ✅ GIỬ NGUYÊN
```

---

## 📋 Chi tiết từng module

### 1️⃣ **core/base-scraper.js** (~150 dòng)
**Nhiệm vụ:** Scraping cơ bản
```javascript
window.DataScraperBaseScraper = {
  scrapeBySelector(selector, options),
  scrapeTable(tableSelector),
  scrapeLinks(containerSelector),
  scrapeImages(containerSelector),
  scrapeCustom(config)
}
```

**Extract từ:** `content.js` lines 19-163, 509-543

---

### 2️⃣ **core/product-scraper.js** (~200 dòng)
**Nhiệm vụ:** Scraping danh sách sản phẩm
```javascript
window.DataScraperProductScraper = {
  scrapeProducts(),                    # Simple product scraping
  scrapeProductsWithScroll(options),   # Scroll-based scraping
  scrapeProductsWithPagination(options) # Pagination-based scraping
}
```

**Extract từ:** `content.js` lines 132-163, 166-399, 402-613

**Tối ưu:**
- Gộp logic chung của scroll và pagination
- Extract ra helper functions
- Dùng Strategy Pattern cho pagination/scroll

---

### 3️⃣ **core/detail-scraper.js** (~400 dòng)
**Nhiệm vụ:** Scraping chi tiết sản phẩm
```javascript
window.DataScraperDetailScraper = {
  scrapeProductDetail(),              # Main entry point (API + DOM)
  scrapeProductDetailFromDOM(),       # DOM scraping
  scrapeProductDetailsFromList(links), # Batch scraping
  extractDetailSection(sectionId),    # Helper: extract section content
  
  // Private helpers
  _extractName(),
  _extractPrice(),
  _extractImages(),
  _extractSections()  # Extract description, ingredient, usage, etc.
}
```

**Extract từ:** `content.js` lines 616-1359, 1362-1405

**Tối ưu:**
- Chia nhỏ `scrapeProductDetailFromDOM` (hiện tại 500+ dòng!)
- Extract các helper functions riêng
- Cải thiện section detection logic

---

### 4️⃣ **core/pagination-handler.js** (~300 dòng)
**Nhiệm vụ:** Xử lý pagination và scroll
```javascript
window.DataScraperPaginationHandler = {
  // Public methods
  scrapeWithPagination(options),
  scrapeWithScroll(options),
  
  // State management
  savePaginationState(state),
  restorePaginationState(),
  clearPaginationState(),
  
  // Navigation
  navigateToNextPage(button),
  handleAjaxPagination(button),
  
  // Detection
  findNextPageButton(selector),
  findLoadMoreButton(selector)
}
```

**Extract từ:** 
- `content.js` lines 166-399, 402-613, 1893-2028
- `utils.js` lines 68-124

**Tối ưu:**
- Gộp logic pagination và scroll (nhiều code trùng)
- Extract state management riêng
- Cải thiện error handling

---

### 5️⃣ **services/state-manager.js** (~100 dòng)
**Nhiệm vụ:** Quản lý state với chrome.storage.local
```javascript
window.DataScraperStateManager = {
  // Pagination state
  savePaginationState(state),
  getPaginationState(),
  clearPaginationState(),
  
  // Detail scraping state
  saveDetailState(state),
  getDetailState(),
  clearDetailState(),
  
  // Last API response cache
  saveLastAPIResponse(data),
  getLastAPIResponse(),
  
  // Generic state
  set(key, value),
  get(key),
  remove(key)
}
```

**Extract từ:** Logic scattered trong `content.js`

**Tối ưu:**
- Centralized state management
- Namespace cho từng loại state
- TTL (Time To Live) cho cached data

---

### 6️⃣ **services/dom-utils.js** (~80 dòng)
**Nhiệm vụ:** DOM utilities
```javascript
window.DataScraperDOMUtils = {
  // Query
  safeQuery(selector, context),
  safeQueryAll(selector, context),
  
  // Text
  getText(element, maxLength),
  
  // Container
  findContainer(containerSelector),
  findBestContainer(),
  
  // Validation
  isVisible(element),
  isInViewport(element)
}
```

**Extract từ:** `utils.js` lines 9-30, 53-65

---

### 7️⃣ **services/selector-utils.js** (~80 dòng)
**Nhiệm vụ:** Selector helpers
```javascript
window.DataScraperSelectorUtils = {
  findBestSelector(selectors, minCount),
  testSelector(selector),
  autoDetectProductSelector(),
  autoDetectContainerSelector(),
  
  // Pagination
  findNextPageButton(selector),
  findLoadMoreButton(selector)
}
```

**Extract từ:** `utils.js` lines 32-51, 68-124

---

### 8️⃣ **services/extraction-utils.js** (~150 dòng)
**Nhiệm vụ:** Extract product info từ DOM
```javascript
window.DataScraperExtractionUtils = {
  // Product list
  extractProductInfo(item, link),
  extractName(element),
  extractPrice(element),
  extractImage(element),
  extractPackage(element),
  
  // Product detail
  extractDetailField(container, selectors),
  extractSKU(container),
  extractBrand(container),
  extractSpecs(container),
  
  // Sections
  extractSectionContent(section),
  cleanSectionText(text)
}
```

**Extract từ:** `utils.js` lines 126-219, và logic trong `content.js`

---

### 9️⃣ **handlers/message-handler.js** (~200 dòng)
**Nhiệm vụ:** Routing messages
```javascript
window.DataScraperMessageHandler = {
  handleScrape(request, sendResponse),
  handleGetPageInfo(sendResponse),
  handleTestSelector(request, sendResponse),
  handleAutoDetect(sendResponse),
  handleHighlight(request, sendResponse),
  handleClearHighlight(sendResponse)
}
```

**Extract từ:** `content.js` lines 1549-1721

**Tối ưu:**
- Đơn giản hóa routing logic
- Centralized error handling

---

### 🔟 **handlers/highlight-manager.js** (~50 dòng)
**Nhiệm vụ:** Highlight elements
```javascript
window.DataScraperHighlightManager = {
  highlight(element),
  clear(),
  highlightBySelector(selector),
  
  // Private
  _elements: []
}
```

**Extract từ:** `content.js` lines 1727-1757

---

### 1️⃣1️⃣ **handlers/export-handler.js** (~150 dòng)
**Nhiệm vụ:** Export data
```javascript
window.DataScraperExportHandler = {
  exportJSON(data, filename),
  exportCSV(data, filename),
  convertToCSV(data),
  escapeCSV(value),
  
  // Private
  _downloadDirectly(content, filename, mimeType),
  _generateFilename(format)
}
```

**Extract từ:** `popup.js` lines 595-761

---

### 1️⃣2️⃣ **ui/popup-main.js** (~300 dòng)
**Nhiệm vụ:** Main UI logic
```javascript
// State management
const PopupState = {
  currentData: null,
  currentTab: null,
  messageTimeout: null
}

// UI functions
function init()
function loadPageInfo(tab)
function displayResults(data)
function showMessage(text, type)
function clearResults()
```

**Extract từ:** `popup.js` lines 1-43, 151-174, 546-807

---

### 1️⃣3️⃣ **ui/popup-handlers.js** (~400 dòng)
**Nhiệm vụ:** Event handlers
```javascript
function setupEventListeners(tab)
function handleAutoDetect(tab)
function handleTestSelector(tab)
function handleScrapeManyProducts(tab)
function handleScrapeWithPagination(tab)
function handleScrapeFromAPI(tab)
function handleScrapeProductDetail(tab)
function handleScrapeDetailsFromList(tab)
function handleCustomScrape()
function handleHighlight(tab)
```

**Extract từ:** `popup.js` lines 46-543

---

## 🔄 Thứ tự refactor (Step by step)

### **Phase 1: Extract utilities** ✅ COMPLETED
1. ✅ Tạo `services/dom-utils.js` (102 lines)
2. ✅ Tạo `services/selector-utils.js` (183 lines)
3. ✅ Tạo `services/extraction-utils.js` (283 lines)
4. ✅ Update `utils.js` for backward compatibility (100 lines)
5. ✅ Update `manifest.json` with new load order
6. ✅ Test với code cũ - All working!

**Result:** Reduced `utils.js` from 222 → 100 lines, extracted 568 lines to services/

---

### **Phase 2: Extract handlers** ✅ COMPLETED
7. ✅ Tạo `handlers/highlight-manager.js` (60 lines)
8. ⏭️ Skip `handlers/export-handler.js` (sẽ làm trong Phase 4 - UI)
9. ✅ Tạo `handlers/message-handler.js` (293 lines)
10. ✅ Update `content.js` to use new handlers
11. ✅ Update `manifest.json` with handlers load order
12. ✅ Test với code cũ - All working!

**Result:** Reduced `content.js` from 2032 → 1830 lines (saved 202 lines)

---

### **Phase 3: Extract core scrapers** ⏳ IN PROGRESS (Next Step)
13. ⏳ Tạo `core/base-scraper.js` (~150 lines)
    - Extract: `scrapeBySelector`, `scrapeTable`, `scrapeLinks`, `scrapeImages`, `scrapeCustom`
    - From: `content.js` lines 19-163, 1509-1543
    
14. ⏳ Tạo `services/state-manager.js` (~100 lines)
    - Extract: Pagination state, Detail scraping state, API cache
    - From: Scattered logic in `content.js`
    
15. ⏳ Tạo `core/pagination-handler.js` (~300 lines)
    - Extract: `scrapeProductsWithPagination`, `scrapeProductsWithScroll`
    - Extract common pagination/scroll logic
    - From: `content.js` lines 166-613
    
16. ⏳ Tạo `core/product-scraper.js` (~200 lines)
    - Extract: `scrapeProducts`, product list scraping logic
    - From: `content.js` lines 132-163
    
17. ⏳ Tạo `core/detail-scraper.js` (~400 lines)
    - Extract: `scrapeProductDetail`, `scrapeProductDetailFromDOM`, `extractDetailSection`
    - From: `content.js` lines 616-1405
    
18. ⏳ Move `api-scraper.js` vào `core/api-scraper.js`
    - Keep backward compatibility
    
19. ⏳ Update `content.js` to use new core scrapers
20. ⏳ Update `manifest.json` with core load order
21. ⏳ Test toàn bộ

**Expected Result:** Reduce `content.js` from 1830 → ~200 lines (main entry point only)

---

### **Phase 4: Refactor UI** ⏳ TODO
22. ⏳ Tạo `ui/popup-handlers.js` (~400 lines)
    - Extract: All event handlers from `popup.js`
    
23. ⏳ Tạo `ui/popup-main.js` (~300 lines)
    - Extract: Main UI logic, state management
    
24. ⏳ Tạo `handlers/export-handler.js` (~150 lines)
    - Extract: Export logic from `popup.js`
    
25. ⏳ Update `popup.html` to load new UI modules
26. ⏳ Test UI

**Expected Result:** Reduce `popup.js` from 835 → ~100 lines

---

### **Phase 5: Update manifest & cleanup** ⏳ TODO
27. ⏳ Update `manifest.json` với final script order
28. ⏳ Remove unused code/comments
29. ⏳ Update documentation
30. ⏳ Test tổng thể
31. ⏳ Final commit & push

---

## 🎨 Optimization Tips

### **1. Reduce duplication**
```javascript
// ❌ BAD: Lặp lại logic
function scrapeWithScroll() {
  // ... scrape items logic ...
  // ... check stop conditions ...
  // ... scroll/click logic ...
}

function scrapeWithPagination() {
  // ... scrape items logic ... (DUPLICATE!)
  // ... check stop conditions ... (DUPLICATE!)
  // ... navigate logic ...
}

// ✅ GOOD: Extract common logic
class ScraperStrategy {
  constructor(options) {
    this.options = options;
    this.products = new Map();
  }
  
  async scrape() {
    while (!this.shouldStop()) {
      await this.scrapeCurrentPage();
      if (!await this.loadNextPage()) break;
    }
    return Array.from(this.products.values());
  }
  
  scrapeCurrentPage() {
    // Common scraping logic
  }
  
  shouldStop() {
    // Common stop conditions
  }
  
  async loadNextPage() {
    // Override in subclasses
  }
}

class ScrollStrategy extends ScraperStrategy {
  async loadNextPage() {
    // Scroll or click "Xem thêm"
  }
}

class PaginationStrategy extends ScraperStrategy {
  async loadNextPage() {
    // Click next page button
  }
}
```

### **2. Better naming**
```javascript
// ❌ BAD
function extractDetailSection(sectionId, className)
function scrapeProductDetailFromDOM()

// ✅ GOOD
function extractSectionContent(sectionId, options)
function scrapeDetailFromDOM()
```

### **3. State management**
```javascript
// ❌ BAD: Scattered storage keys
chrome.storage.local.set({ paginationState: ... });
chrome.storage.local.set({ scrapeDetailsState: ... });
chrome.storage.local.set({ lastProductDetailAPI: ... });

// ✅ GOOD: Namespaced state
const StateManager = {
  KEYS: {
    PAGINATION: 'scraper:pagination',
    DETAIL_LIST: 'scraper:detail_list',
    API_CACHE: 'scraper:api_cache'
  },
  
  async save(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  
  async get(key) {
    const result = await chrome.storage.local.get(key);
    return result[key];
  }
}
```

### **4. Break down long functions**
```javascript
// ❌ BAD: 500+ lines function
function scrapeProductDetailFromDOM() {
  // Extract name (50 lines)
  // Extract SKU (30 lines)
  // Extract price (40 lines)
  // Extract images (60 lines)
  // Extract sections (300+ lines)
  // ...
}

// ✅ GOOD: Break into smaller functions
function scrapeProductDetailFromDOM() {
  const container = findProductContainer();
  
  return {
    name: extractName(container),
    sku: extractSKU(container),
    price: extractPrice(container),
    images: extractImages(container),
    ...extractAllSections(container),
    specifications: extractSpecifications(container)
  };
}

function extractName(container) {
  // 10-20 lines, focused logic
}

function extractSKU(container) {
  // 10-20 lines, focused logic
}
```

---

## 📦 Load order trong manifest.json

```json
{
  "content_scripts": [
    {
      "matches": ["*://*/*"],
      "js": [
        "config.js",                         // 1. Config first
        
        "services/dom-utils.js",             // 2. Utilities
        "services/selector-utils.js",
        "services/extraction-utils.js",
        "services/state-manager.js",
        
        "core/api-scraper.js",               // 3. Core scrapers
        "core/base-scraper.js",
        "core/pagination-handler.js",
        "core/product-scraper.js",
        "core/detail-scraper.js",
        
        "handlers/highlight-manager.js",     // 4. Handlers
        "handlers/message-handler.js",
        "handlers/export-handler.js",
        
        "content-main.js"                    // 5. Main entry point
      ],
      "run_at": "document_idle"
    }
  ]
}
```

---

## ✅ Lợi ích

1. ✅ **Dễ đọc**: Mỗi file < 400 dòng, focused on single responsibility
2. ✅ **Dễ maintain**: Thay đổi 1 feature chỉ sửa 1 file
3. ✅ **Dễ test**: Có thể test từng module riêng
4. ✅ **Dễ extend**: Thêm scraper mới chỉ cần thêm 1 file
5. ✅ **Performance**: Lazy load modules nếu cần
6. ✅ **Reusability**: Có thể dùng lại utilities cho project khác

---

## 🚀 Next Steps

1. **Bắt đầu với Phase 1** (utilities) - dễ nhất và ít rủi ro
2. **Test kỹ sau mỗi phase**
3. **Giữ lại code cũ** trong một branch backup
4. **Update documentation** sau khi refactor xong

---

**Created:** 2025-12-07
**Author:** AI Assistant
**Version:** 1.0