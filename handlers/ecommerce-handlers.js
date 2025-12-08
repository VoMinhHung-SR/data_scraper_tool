(() => {
  'use strict';

  // ============================================
  // 🛍️ E-COMMERCE HANDLERS (Custom cho Long Châu/E-commerce)
  // ============================================
  window.DataScraperEcommerceHandlers = {
    /**
     * Handle scrape many products with scroll
     */
    handleScrapeManyProducts: function(tab) {
      if (!tab || !tab.id) {
        window.PopupDisplay.showMessage('Không thể truy cập tab', 'error');
        return;
      }

      const maxProductsInput = document.getElementById('maxProducts');
      const productSelectorInput = document.getElementById('productSelector');
      const containerSelectorInput = document.getElementById('containerSelector');
      const loadMoreSelectorInput = document.getElementById('loadMoreSelector');
      
      const maxProducts = parseInt(maxProductsInput?.value) || 100;
      const productSelector = productSelectorInput?.value.trim() || null;
      const containerSelector = containerSelectorInput?.value.trim() || null;
      const loadMoreSelector = loadMoreSelectorInput?.value.trim() || null;
      
      window.PopupDisplay.showMessage(`Đang scrape ${maxProducts} sản phẩm với scroll + "Xem thêm"... (có thể mất vài phút)`, 'loading');
      
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
      }, window.PopupScrape.handleResponse);
    },

    /**
     * Handle scrape with pagination
     */
    handleScrapeWithPagination: function(tab) {
      if (!tab || !tab.id) {
        window.PopupDisplay.showMessage('Không thể truy cập tab', 'error');
        return;
      }

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
      
      window.PopupDisplay.showMessage(`Đang scrape ${maxProducts} sản phẩm với pagination (ước tính ${estimatedPages} trang)...`, 'loading');
      
      // Listen for pagination completion
      const messageListener = (message, sender, sendResponse) => {
        if (message.action === 'paginationComplete' && message.requestId === requestId) {
          chrome.runtime.onMessage.removeListener(messageListener);
          if (message.data) {
            window.PopupState.setData(message.data);
            window.PopupDisplay.displayResults(message.data);
            window.PopupDisplay.showMessage(`Đã scrape thành công ${message.data.length} sản phẩm từ ${message.data[0]?.page || 'nhiều'} trang`, 'success');
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
          maxPages: estimatedPages + 2,
          requestId: requestId
        }
      }, (response) => {
        // Initial response (first page)
        if (response?.success) {
          window.PopupState.setData(response.data);
          window.PopupDisplay.displayResults(response.data);
          if (response.data.length >= maxProducts) {
            chrome.runtime.onMessage.removeListener(messageListener);
            window.PopupDisplay.showMessage(`Đã scrape thành công ${response.data.length} sản phẩm`, 'success');
          } else {
            window.PopupDisplay.showMessage(`Đã scrape trang 1: ${response.data.length} sản phẩm. Đang tiếp tục...`, 'loading');
          }
        } else if (chrome.runtime.lastError) {
          chrome.runtime.onMessage.removeListener(messageListener);
          const errorMsg = chrome.runtime.lastError.message;
          if (errorMsg.includes('Receiving end does not exist')) {
            window.PopupDisplay.showMessage('Content script chưa được load. Vui lòng reload trang và thử lại.', 'error');
          } else {
            window.PopupDisplay.showMessage('Lỗi: ' + errorMsg, 'error');
          }
        }
      });
    },

    /**
     * Handle scrape product detail
     */
    handleScrapeProductDetail: function(tab) {
      if (!tab || !tab.id) {
        window.PopupDisplay.showMessage('Không thể truy cập tab', 'error');
        return;
      }

      window.PopupDisplay.showMessage('Đang scrape chi tiết sản phẩm...', 'loading');
      chrome.tabs.sendMessage(tab.id, {
        action: 'scrape',
        type: 'productDetail'
      }, window.PopupScrape.handleResponse);
    },

    /**
     * Handle scrape details from list
     */
    handleScrapeDetailsFromList: function(tab) {
      if (!tab || !tab.id) {
        window.PopupDisplay.showMessage('Không thể truy cập tab', 'error');
        return;
      }

      const currentData = window.PopupState.getData();
      if (!currentData || !Array.isArray(currentData) || currentData.length === 0) {
        window.PopupDisplay.showMessage('Không có danh sách sản phẩm. Vui lòng scrape danh sách trước!', 'error');
        return;
      }

      const productLinks = currentData
        .map(p => p.link || p.url || p.href)
        .filter(link => link && link.includes('.html'));

      if (productLinks.length === 0) {
        window.PopupDisplay.showMessage('Không tìm thấy link sản phẩm trong danh sách!', 'error');
        return;
      }

      const maxDetails = Math.min(productLinks.length, 50);
      const confirmed = confirm(`Bạn có muốn scrape chi tiết cho ${maxDetails} sản phẩm?\n\nLưu ý: Quá trình này sẽ tự động mở từng trang và có thể mất ${Math.ceil(maxDetails * 3 / 60)} phút.`);
      
      if (!confirmed) return;

      window.PopupDisplay.showMessage(`Đang scrape chi tiết ${maxDetails} sản phẩm... (có thể mất vài phút)`, 'loading');
      
      chrome.tabs.sendMessage(tab.id, {
        action: 'scrape',
        type: 'productDetailsFromList',
        options: {
          productLinks: productLinks.slice(0, maxDetails),
          delay: 2000,
          maxDetails: maxDetails
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          window.PopupDisplay.showMessage('Lỗi: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        if (response?.success) {
          window.PopupState.setData(response.data);
          window.PopupDisplay.displayResults(response.data);
          window.PopupDisplay.showMessage(`Đã scrape thành công ${response.data.length} chi tiết sản phẩm`, 'success');
        } else {
          window.PopupDisplay.showMessage('Lỗi: ' + (response?.error || 'Unknown error'), 'error');
        }
      });
    },

    /**
     * Handle scrape from API
     */
    handleScrapeFromAPI: function(tab) {
      if (!tab || !tab.id) {
        window.PopupDisplay.showMessage('Không thể truy cập tab', 'error');
        return;
      }

      const maxProductsInput = document.getElementById('maxProducts');
      const apiUrlInput = document.getElementById('apiUrl');
      
      const maxProducts = parseInt(maxProductsInput?.value) || 100;
      const apiUrl = apiUrlInput?.value.trim() || null;
      
      window.PopupDisplay.showMessage(`Đang scrape từ API... (${apiUrl ? 'Gọi API trực tiếp' : 'Intercept requests'})`, 'loading');
      
      chrome.tabs.sendMessage(tab.id, {
        action: 'scrape',
        type: apiUrl ? 'callAPI' : 'productsFromAPI',
        options: {
          apiUrl: apiUrl,
          maxProducts: maxProducts,
          pageSize: 20,
          interceptMode: !apiUrl
        }
      }, window.PopupScrape.handleResponse);
    },

    /**
     * Handle scrape Long Châu API (specific)
     */
    handleScrapeLongChauAPI: function(tab) {
      if (!tab || !tab.id) {
        window.PopupDisplay.showMessage('Không thể truy cập tab', 'error');
        return;
      }

      const maxProductsInput = document.getElementById('maxProducts');
      const categoryInput = document.getElementById('apiCategory');
      
      const maxProducts = parseInt(maxProductsInput?.value) || 100;
      const category = categoryInput?.value.trim() || null;
      
      window.PopupDisplay.showMessage(`Đang scrape từ Long Châu API... (${category || 'tự động detect category'})`, 'loading');
      
      chrome.tabs.sendMessage(tab.id, {
        action: 'scrape',
        type: 'scrapeLongChauAPI',
        options: {
          maxProducts: maxProducts,
          pageSize: 20,
          category: category,
          sortType: 4
        }
      }, window.PopupScrape.handleResponse);
    }
  };
})();

