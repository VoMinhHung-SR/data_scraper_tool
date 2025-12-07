(() => {
  'use strict';

  // ============================================
  // 📦 STATE
  // ============================================
  const state = {
    currentData: null,
    currentTab: null,
    messageTimeout: null
  };

  // ============================================
  // 🎯 INIT
  // ============================================
  async function init() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showMessage('Không thể truy cập tab hiện tại', 'error');
        return;
      }
      
      state.currentTab = tab;
      setupEventListeners(tab);
      loadPageInfo(tab);
      
      // Listen for details scraping completion
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'detailsScrapingComplete') {
          state.currentData = message.data;
          displayResults(message.data);
          showMessage(`Đã scrape thành công ${message.data.length} chi tiết sản phẩm!`, 'success');
          sendResponse({ success: true });
        }
        return true;
      });
    } catch (error) {
      console.error('Init error:', error);
      showMessage('Lỗi khởi tạo: ' + error.message, 'error');
    }
  }

  // ============================================
  // 🔧 SETUP EVENT LISTENERS
  // ============================================
  function setupEventListeners(tab) {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const tabName = tabBtn.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        tabBtn.classList.add('active');
        const targetTab = document.getElementById(`${tabName}Tab`);
        if (targetTab) targetTab.classList.add('active');
      });
    });

    // Quick scrape buttons
    const quickScrapes = {
      'scrapeTable': () => scrape('table'),
      'scrapeLinks': () => scrape('links'),
      'scrapeImages': () => scrape('images'),
      'scrapeProducts': () => scrape('products')
    };
    
    Object.entries(quickScrapes).forEach(([id, handler]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    });

    // Auto-detect selector
    const autoDetectBtn = document.getElementById('autoDetectSelector');
    if (autoDetectBtn) {
      autoDetectBtn.addEventListener('click', () => handleAutoDetect(tab));
    }

    // Test selector
    const testBtn = document.getElementById('testSelector');
    if (testBtn) {
      testBtn.addEventListener('click', () => handleTestSelector(tab));
    }

    // E-commerce scrape
    const scrapeManyBtn = document.getElementById('scrapeManyProducts');
    if (scrapeManyBtn) {
      scrapeManyBtn.addEventListener('click', () => handleScrapeManyProducts(tab));
    }

    const scrapePaginationBtn = document.getElementById('scrapeWithPagination');
    if (scrapePaginationBtn) {
      scrapePaginationBtn.addEventListener('click', () => handleScrapeWithPagination(tab));
    }

    const scrapeDetailBtn = document.getElementById('scrapeProductDetail');
    if (scrapeDetailBtn) {
      scrapeDetailBtn.addEventListener('click', () => handleScrapeProductDetail(tab));
    }
    
    const scrapeDetailsFromListBtn = document.getElementById('scrapeDetailsFromList');
    if (scrapeDetailsFromListBtn) {
      scrapeDetailsFromListBtn.addEventListener('click', () => handleScrapeDetailsFromList(tab));
    }
    if (scrapeDetailBtn) {
      scrapeDetailBtn.addEventListener('click', () => scrape('productDetail'));
    }

    // Scrape from API
    const scrapeAPIBtn = document.getElementById('scrapeFromAPI');
    if (scrapeAPIBtn) {
      scrapeAPIBtn.addEventListener('click', () => handleScrapeFromAPI(tab));
    }

    const scrapeLongChauBtn = document.getElementById('scrapeLongChauAPI');
    if (scrapeLongChauBtn) {
      scrapeLongChauBtn.addEventListener('click', () => handleScrapeLongChauAPI(tab));
    }

    // Custom scrape
    const scrapeCustomBtn = document.getElementById('scrapeCustom');
    if (scrapeCustomBtn) {
      scrapeCustomBtn.addEventListener('click', handleCustomScrape);
    }

    const highlightBtn = document.getElementById('highlightSelector');
    if (highlightBtn) {
      highlightBtn.addEventListener('click', () => handleHighlight(tab));
    }

    // Export buttons
    const exportJSONBtn = document.getElementById('exportJSON');
    if (exportJSONBtn) {
      exportJSONBtn.addEventListener('click', () => exportData('json'));
    }

    const exportCSVBtn = document.getElementById('exportCSV');
    if (exportCSVBtn) {
      exportCSVBtn.addEventListener('click', () => exportData('csv'));
    }

    const clearBtn = document.getElementById('clearResults');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearResults);
    }
  }

  // ============================================
  // 📄 LOAD PAGE INFO
  // ============================================
  function loadPageInfo(tab) {
    if (!tab || !tab.id) return;
    
    chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script might not be loaded yet, ignore silently
        if (chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
          return;
        }
        console.warn('Load page info error:', chrome.runtime.lastError.message);
        return;
      }
      if (response) {
        const pageInfoEl = document.getElementById('pageInfo');
        if (pageInfoEl) {
          pageInfoEl.innerHTML = `
            <div class="url">${escapeHtml(response.url || '')}</div>
            <div style="margin-top: 5px; color: #999;">${escapeHtml(response.title || '')}</div>
          `;
        }
      }
    });
  }

  // ============================================
  // 🔍 HANDLERS
  // ============================================
  function handleAutoDetect(tab) {
    if (!tab || !tab.id) {
      showMessage('Không thể truy cập tab', 'error');
      return;
    }
    
    chrome.tabs.sendMessage(tab.id, { action: 'autoDetectSelector' }, (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        if (errorMsg.includes('Receiving end does not exist')) {
          showMessage('Content script chưa được load. Vui lòng reload trang và thử lại.', 'error');
        } else {
          showMessage('Lỗi: ' + errorMsg, 'error');
        }
        return;
      }
      
      const selectorInput = document.getElementById('productSelector');
      const infoDiv = document.getElementById('selectorInfo');
      
      if (response?.success && response.selector) {
        if (selectorInput) selectorInput.value = response.selector;
        if (infoDiv) {
          infoDiv.innerHTML = 
            `✅ Tự động tìm thấy: <strong>${response.count}</strong> sản phẩm với selector: <code>${escapeHtml(response.selector)}</code>`;
        }
        showMessage(`Đã tìm thấy ${response.count} sản phẩm`, 'success');
      } else {
        if (infoDiv) {
          infoDiv.innerHTML = `⚠️ Không tìm thấy selector tự động. Vui lòng nhập thủ công.`;
        }
        showMessage('Không tìm thấy selector tự động', 'error');
      }
    });
  }

  function handleTestSelector(tab) {
    if (!tab || !tab.id) {
      showMessage('Không thể truy cập tab', 'error');
      return;
    }
    
    const selectorInput = document.getElementById('productSelector');
    const selector = selectorInput?.value.trim();
    
    if (!selector) {
      showMessage('Vui lòng nhập CSS selector', 'error');
      return;
    }
    
    chrome.tabs.sendMessage(tab.id, { action: 'testSelector', selector }, (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        if (errorMsg.includes('Receiving end does not exist')) {
          showMessage('Content script chưa được load. Vui lòng reload trang và thử lại.', 'error');
        } else {
          showMessage('Lỗi: ' + errorMsg, 'error');
        }
        return;
      }
      
      const infoDiv = document.getElementById('selectorInfo');
      if (!infoDiv) return;
      
      if (response?.success) {
        let html = `✅ Tìm thấy <strong>${response.count}</strong> sản phẩm<br>`;
        if (response.sample && response.sample.length > 0) {
          html += '<div style="margin-top: 5px; font-size: 10px;">Mẫu: ';
          response.sample.forEach((item, idx) => {
            const name = escapeHtml(item.name || item.href || 'N/A');
            html += `<div style="padding: 3px; background: #f0f0f0; margin: 2px 0; border-radius: 3px;">${idx + 1}. ${name}</div>`;
          });
          html += '</div>';
        }
        infoDiv.innerHTML = html;
        showMessage(`Test thành công: ${response.count} sản phẩm`, 'success');
      } else {
        infoDiv.innerHTML = `❌ Lỗi: ${escapeHtml(response?.error || 'Unknown error')}`;
        showMessage('Lỗi khi test selector', 'error');
      }
    });
  }

  function handleScrapeManyProducts(tab) {
    const maxProductsInput = document.getElementById('maxProducts');
    const productSelectorInput = document.getElementById('productSelector');
    const containerSelectorInput = document.getElementById('containerSelector');
    const loadMoreSelectorInput = document.getElementById('loadMoreSelector');
    
    const maxProducts = parseInt(maxProductsInput?.value) || 100;
    const productSelector = productSelectorInput?.value.trim() || null;
    const containerSelector = containerSelectorInput?.value.trim() || null;
    const loadMoreSelector = loadMoreSelectorInput?.value.trim() || null;
    
    showMessage(`Đang scrape ${maxProducts} sản phẩm với scroll + "Xem thêm"... (có thể mất vài phút)`, 'loading');
    
    chrome.tabs.sendMessage(tab.id, {
      action: 'scrape',
      type: 'productsWithScroll',
      options: {
        maxProducts,
        productSelector,
        containerSelector,
        loadMoreSelector,
        useLoadMore: true,
        scrollDelay: 1000,
        maxScrolls: 100
      }
    }, handleScrapeResponse);
  }

  function handleScrapeWithPagination(tab) {
    const maxProductsInput = document.getElementById('maxProducts');
    const productSelectorInput = document.getElementById('productSelector');
    const containerSelectorInput = document.getElementById('containerSelector');
    const nextPageSelectorInput = document.getElementById('nextPageSelector');
    
    const maxProducts = parseInt(maxProductsInput?.value) || 100;
    const productSelector = productSelectorInput?.value.trim() || null;
    const containerSelector = containerSelectorInput?.value.trim() || null;
    const nextPageSelector = nextPageSelectorInput?.value.trim() || null;
    
    // Tính số trang cần (ước tính 12 sản phẩm/trang)
    const estimatedPages = Math.ceil(maxProducts / 12);
    const requestId = Date.now().toString();
    
    showMessage(`Đang scrape ${maxProducts} sản phẩm với pagination (ước tính ${estimatedPages} trang)...`, 'loading');
    
    // Listen for pagination completion (from background or content script)
    const messageListener = (message, sender, sendResponse) => {
      if (message.action === 'paginationComplete' && message.requestId === requestId) {
        chrome.runtime.onMessage.removeListener(messageListener);
        if (message.data) {
          state.currentData = message.data;
          displayResults(message.data);
          showMessage(`Đã scrape thành công ${message.data.length} sản phẩm từ ${message.data[0]?.page || 'nhiều'} trang`, 'success');
        }
        sendResponse({ success: true });
      }
    };
    
    chrome.runtime.onMessage.addListener(messageListener);
    
    // Start pagination
    chrome.tabs.sendMessage(tab.id, {
      action: 'scrape',
      type: 'productsWithPagination',
      options: {
        maxProducts,
        productSelector,
        containerSelector,
        nextPageSelector,
        pageDelay: 2000,
        maxPages: estimatedPages + 2, // Thêm 2 trang buffer
        requestId: requestId
      }
    }, (response) => {
      // Initial response (first page)
      if (response?.success) {
        state.currentData = response.data;
        displayResults(response.data);
        if (response.data.length >= maxProducts) {
          chrome.runtime.onMessage.removeListener(messageListener);
          showMessage(`Đã scrape thành công ${response.data.length} sản phẩm`, 'success');
        } else {
          showMessage(`Đã scrape trang 1: ${response.data.length} sản phẩm. Đang tiếp tục...`, 'loading');
        }
      } else if (chrome.runtime.lastError) {
        chrome.runtime.onMessage.removeListener(messageListener);
        const errorMsg = chrome.runtime.lastError.message;
        if (errorMsg.includes('Receiving end does not exist')) {
          showMessage('Content script chưa được load. Vui lòng reload trang và thử lại.', 'error');
        } else {
          showMessage('Lỗi: ' + errorMsg, 'error');
        }
      }
    });
  }

  function handleScrapeFromAPI(tab) {
    const maxProductsInput = document.getElementById('maxProducts');
    const apiUrlInput = document.getElementById('apiUrl');
    
    const maxProducts = parseInt(maxProductsInput?.value) || 100;
    const apiUrl = apiUrlInput?.value.trim() || null;
    
    showMessage(`Đang scrape từ API... (${apiUrl ? 'Gọi API trực tiếp' : 'Intercept requests'})`, 'loading');
    
    chrome.tabs.sendMessage(tab.id, {
      action: 'scrape',
      type: apiUrl ? 'callAPI' : 'productsFromAPI',
      options: {
        apiUrl: apiUrl,
        maxProducts: maxProducts,
        pageSize: 20,
        interceptMode: !apiUrl
      }
    }, handleScrapeResponse);
  }

  function handleScrapeLongChauAPI(tab) {
    const maxProductsInput = document.getElementById('maxProducts');
    const categoryInput = document.getElementById('apiCategory');
    
    const maxProducts = parseInt(maxProductsInput?.value) || 100;
    const category = categoryInput?.value.trim() || null;
    
    showMessage(`Đang scrape từ Long Châu API... (${category || 'tự động detect category'})`, 'loading');
    
    chrome.tabs.sendMessage(tab.id, {
      action: 'scrape',
      type: 'scrapeLongChauAPI',
      options: {
        maxProducts: maxProducts,
        pageSize: 20,
        category: category,
        sortType: 4
      }
    }, handleScrapeResponse);
  }

  function handleCustomScrape() {
    const selectorInput = document.getElementById('customSelector');
    const attributeInput = document.getElementById('customAttribute');
    
    const selector = selectorInput?.value.trim();
    if (!selector) {
      showMessage('Vui lòng nhập CSS selector', 'error');
      return;
    }
    
    const attribute = attributeInput?.value.trim();
    scrape('selector', { selector, attribute });
  }

  function handleHighlight(tab) {
    const selectorInput = document.getElementById('customSelector');
    const selector = selectorInput?.value.trim();
    
    if (!selector) {
      showMessage('Vui lòng nhập CSS selector', 'error');
      return;
    }
    
    chrome.tabs.sendMessage(tab.id, { action: 'highlight', selector }, (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        if (errorMsg.includes('Receiving end does not exist')) {
          showMessage('Content script chưa được load. Vui lòng reload trang và thử lại.', 'error');
        } else {
          showMessage('Lỗi: ' + errorMsg, 'error');
        }
        return;
      }
      if (response?.success) {
        showMessage(`Đã highlight ${response.count} elements`, 'success');
      }
    });
  }

  function handleScrapeProductDetail(tab) {
    showMessage('Đang scrape chi tiết sản phẩm...', 'loading');
    chrome.tabs.sendMessage(tab.id, {
      action: 'scrape',
      type: 'productDetail'
    }, handleScrapeResponse);
  }

  function handleScrapeDetailsFromList(tab) {
    if (!state.currentData || !Array.isArray(state.currentData) || state.currentData.length === 0) {
      showMessage('Không có danh sách sản phẩm. Vui lòng scrape danh sách trước!', 'error');
      return;
    }

    const productLinks = state.currentData
      .map(p => p.link || p.url || p.href)
      .filter(link => link && link.includes('.html'));

    if (productLinks.length === 0) {
      showMessage('Không tìm thấy link sản phẩm trong danh sách!', 'error');
      return;
    }

    const maxDetails = Math.min(productLinks.length, 50); // Limit để tránh quá lâu
    const confirmed = confirm(`Bạn có muốn scrape chi tiết cho ${maxDetails} sản phẩm?\n\nLưu ý: Quá trình này sẽ tự động mở từng trang và có thể mất ${Math.ceil(maxDetails * 3 / 60)} phút.`);
    
    if (!confirmed) return;

    showMessage(`Đang scrape chi tiết ${maxDetails} sản phẩm... (có thể mất vài phút)`, 'loading');
    
    chrome.tabs.sendMessage(tab.id, {
      action: 'scrape',
      type: 'productDetailsFromList',
      options: {
        productLinks: productLinks.slice(0, maxDetails),
        delay: 2000,
        maxDetails: maxDetails,
        onProgress: (progress) => {
          showMessage(`Đang scrape ${progress.current}/${progress.total}...`, 'loading');
        }
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        showMessage('Lỗi: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      if (response?.success) {
        state.currentData = response.data;
        displayResults(response.data);
        showMessage(`Đã scrape thành công ${response.data.length} chi tiết sản phẩm`, 'success');
      } else {
        showMessage('Lỗi: ' + (response?.error || 'Unknown error'), 'error');
      }
    });
  }

  function handleScrapeResponse(response) {
    if (chrome.runtime.lastError) {
      const errorMsg = chrome.runtime.lastError.message;
      if (errorMsg.includes('Receiving end does not exist')) {
        showMessage('Content script chưa được load. Vui lòng reload trang và thử lại.', 'error');
      } else {
        showMessage('Lỗi: ' + errorMsg, 'error');
      }
      return;
    }

    if (response?.success) {
      state.currentData = response.data;
      displayResults(response.data);
      const count = Array.isArray(response.data) ? response.data.length : 1;
      showMessage(`Đã scrape thành công ${count} items`, 'success');
    } else {
      showMessage('Lỗi: ' + (response?.error || 'Unknown error'), 'error');
    }
  }

  // ============================================
  // 📊 SCRAPE FUNCTION
  // ============================================
  function scrape(type, options = {}) {
    if (!state.currentTab || !state.currentTab.id) {
      showMessage('Không thể truy cập tab', 'error');
      return;
    }

    showMessage('Đang scrape...', 'loading');

    chrome.tabs.sendMessage(state.currentTab.id, {
      action: 'scrape',
      type,
      options
    }, (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        if (errorMsg.includes('Receiving end does not exist')) {
          showMessage('Content script chưa được load. Vui lòng reload trang và thử lại.', 'error');
        } else {
          showMessage('Lỗi: ' + errorMsg, 'error');
        }
        return;
      }
      handleScrapeResponse(response);
    });
  }

  // ============================================
  // 📊 DISPLAY RESULTS
  // ============================================
  function displayResults(data) {
    const resultsSection = document.getElementById('resultsSection');
    const statsDiv = document.getElementById('stats');
    const previewDiv = document.getElementById('resultPreview');

    if (!resultsSection || !statsDiv || !previewDiv) return;

    resultsSection.style.display = 'block';

    // Stats
    const count = Array.isArray(data) ? data.length : 1;
    const dataSize = new Blob([JSON.stringify(data)]).size;
    statsDiv.innerHTML = `
      <div class="stat">
        <div class="stat-value">${count}</div>
        <div>Items</div>
      </div>
      <div class="stat">
        <div class="stat-value">${formatBytes(dataSize)}</div>
        <div>Size</div>
      </div>
    `;

    // Preview
    if (Array.isArray(data) && data.length > 0) {
      const preview = data.slice(0, 5).map((item, idx) => {
        const content = typeof item === 'object' 
          ? JSON.stringify(item, null, 2).substring(0, 150)
          : String(item).substring(0, 150);
        return `<div class="result-item"><strong>#${idx + 1}:</strong> ${escapeHtml(content)}</div>`;
      }).join('');
      
      previewDiv.innerHTML = data.length > 5
        ? preview + `<div style="text-align: center; padding: 10px; color: #666;">... và ${data.length - 5} items khác</div>`
        : preview;
    } else if (data) {
      const content = typeof data === 'object' 
        ? JSON.stringify(data, null, 2)
        : String(data);
      previewDiv.innerHTML = `<div class="result-item">${escapeHtml(content)}</div>`;
    } else {
      previewDiv.innerHTML = '<div class="result-item">Không có dữ liệu</div>';
    }
  }

  // ============================================
  // 💾 EXPORT DATA
  // ============================================
  function exportData(format) {
    if (!state.currentData) {
      showMessage('Không có dữ liệu để export', 'error');
      return;
    }

    try {
      showMessage('Đang chuẩn bị export...', 'loading');
      
      const { content, filename, mimeType } = generateExportContent(format);
      if (!content) {
        showMessage('Không thể tạo nội dung export', 'error');
        return;
      }

      // Kiểm tra kích thước file
      const sizeInMB = new Blob([content]).size / (1024 * 1024);
      if (sizeInMB > 50) {
        showMessage('File quá lớn (>50MB). Vui lòng giảm số lượng dữ liệu.', 'error');
        return;
      }

      // Sử dụng background script để download
      chrome.runtime.sendMessage({
        action: 'downloadFile',
        content: content,
        filename: filename,
        mimeType: mimeType
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Download error:', chrome.runtime.lastError);
          downloadDirectly(content, filename, mimeType, format);
        } else if (response && response.success) {
          showMessage(`Đã export thành công: ${filename}`, 'success');
        } else if (response && response.error === 'FILE_TOO_LARGE') {
          downloadDirectly(content, filename, mimeType, format);
        } else if (response && response.error && response.error.includes('USER_CANCELED')) {
          // User canceled download dialog - this is fine, don't show error
          // Just silently ignore
          return;
        } else {
          showMessage('Lỗi khi export: ' + (response?.error || 'Unknown error'), 'error');
        }
      });
    } catch (error) {
      console.error('Export error:', error);
      showMessage('Lỗi khi export: ' + error.message, 'error');
    }
  }

  function generateExportContent(format) {
    if (format === 'json') {
      return {
        content: JSON.stringify(state.currentData, null, 2),
        filename: `scraped-data-${Date.now()}.json`,
        mimeType: 'application/json'
      };
    } else if (format === 'csv') {
      return {
        content: convertToCSV(state.currentData),
        filename: `scraped-data-${Date.now()}.csv`,
        mimeType: 'text/csv'
      };
    }
    return null;
  }

  // Fallback: download trực tiếp
  function downloadDirectly(content, filename, mimeType, format) {
    try {
      const blob = new Blob(
        format === 'csv' ? ['\ufeff' + content] : [content],
        { type: mimeType + ';charset=utf-8;' }
      );
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
      }, 100);
      
      showMessage(`Đã export thành công: ${filename}`, 'success');
    } catch (error) {
      console.error('Direct download error:', error);
      showMessage('Lỗi khi export: ' + error.message, 'error');
    }
  }

  // ============================================
  // 📄 CONVERT TO CSV
  // ============================================
  function convertToCSV(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    // Flatten nested objects
    const flattenObject = (obj, prefix = '') => {
      const flattened = {};
      for (const key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        
        const newKey = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        
        if (value === null || value === undefined) {
          flattened[newKey] = '';
        } else if (Array.isArray(value)) {
          flattened[newKey] = JSON.stringify(value);
        } else if (typeof value === 'object') {
          Object.assign(flattened, flattenObject(value, newKey));
        } else {
          flattened[newKey] = value;
        }
      }
      return flattened;
    };

    // Flatten all items
    const flattenedData = data.map(item => {
      if (typeof item === 'object' && item !== null) {
        return flattenObject(item);
      }
      return { value: item };
    });

    // Get all unique keys
    const keys = new Set();
    flattenedData.forEach(item => {
      if (typeof item === 'object' && item !== null) {
        Object.keys(item).forEach(key => keys.add(key));
      }
    });

    const headers = Array.from(keys);
    if (headers.length === 0) return '';

    const rows = [headers.map(h => `"${escapeCSV(h)}"`).join(',')];

    flattenedData.forEach(item => {
      const row = headers.map(header => {
        const val = (typeof item === 'object' && item !== null) ? item[header] : item;
        const value = (val !== null && val !== undefined) ? String(val) : '';
        return `"${escapeCSV(value)}"`;
      });
      rows.push(row.join(','));
    });

    return rows.join('\n');
  }

  function escapeCSV(value) {
    return String(value)
      .replace(/"/g, '""')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '');
  }

  // ============================================
  // 🧹 CLEAR RESULTS
  // ============================================
  function clearResults() {
    state.currentData = null;
    
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) resultsSection.style.display = 'none';
    
    const customSelector = document.getElementById('customSelector');
    if (customSelector) customSelector.value = '';
    
    const customAttribute = document.getElementById('customAttribute');
    if (customAttribute) customAttribute.value = '';
    
    if (state.currentTab && state.currentTab.id) {
      chrome.tabs.sendMessage(state.currentTab.id, { action: 'clearHighlight' });
    }
    
    showMessage('Đã xóa kết quả', 'success');
  }

  // ============================================
  // 💬 SHOW MESSAGE
  // ============================================
  function showMessage(text, type = 'success') {
    const messageDiv = document.getElementById('message');
    if (!messageDiv) return;

    messageDiv.className = type;
    messageDiv.textContent = text;
    messageDiv.style.display = 'block';

    // Clear previous timeout
    if (state.messageTimeout) {
      clearTimeout(state.messageTimeout);
    }

    if (type !== 'loading') {
      state.messageTimeout = setTimeout(() => {
        messageDiv.style.display = 'none';
        state.messageTimeout = null;
      }, 3000);
    }
  }

  // ============================================
  // 🔒 UTILITY FUNCTIONS
  // ============================================
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // ============================================
  // 🚀 INITIALIZE
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
