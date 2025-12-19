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
            window.PopupState.setListData(message.data);
            window.PopupDisplay.displayResults(message.data, { maxProducts });
            window.PopupDisplay.showMessage(`✅ Đã scrape thành công ${message.data.length}/${maxProducts} sản phẩm`, 'success');
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
          window.PopupState.setListData(response.data);
          window.PopupDisplay.displayResults(response.data, { maxProducts });
          if (response.data.length >= maxProducts) {
            chrome.runtime.onMessage.removeListener(messageListener);
            window.PopupDisplay.showMessage(`✅ Đã scrape thành công ${response.data.length}/${maxProducts} sản phẩm`, 'success');
          } else {
            window.PopupDisplay.showMessage(`Đã scrape trang 1: ${response.data.length}/${maxProducts} sản phẩm. Đang tiếp tục...`, 'loading');
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

      const forceAPIInput = document.getElementById('forceAPIScraping');
      const forceAPI = forceAPIInput ? forceAPIInput.checked : false;

      window.PopupDisplay.showMessage(
        `Đang scrape chi tiết sản phẩm... ${forceAPI ? '(Ưu tiên API)' : '(DOM)'}`, 
        'loading'
      );
      chrome.tabs.sendMessage(tab.id, {
        action: 'scrape',
        type: 'productDetail',
        options: {
          forceAPI: forceAPI
        }
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

      const currentData = window.PopupState.getListData();
      if (!currentData || !Array.isArray(currentData) || currentData.length === 0) {
        window.PopupDisplay.showMessage('Không có danh sách sản phẩm. Vui lòng scrape danh sách trước!', 'error');
        return;
      }

      const skipProductsInput = document.getElementById('skipProducts');
      const forceAPIInput = document.getElementById('forceAPIScraping');
      
      const skipProducts = parseInt(skipProductsInput?.value) || 0;
      const forceAPI = forceAPIInput ? forceAPIInput.checked : false;

      const productLinks = currentData
        .map(p => p.link || p.url || p.href)
        .filter(link => link && link.includes('.html'))
        .slice(skipProducts); // Apply skip

      if (productLinks.length === 0) {
        window.PopupDisplay.showMessage('Không tìm thấy link sản phẩm trong danh sách!', 'error');
        return;
      }

      const maxDetails = productLinks.length; // Use all remaining links
      const confirmed = confirm(
        `Bạn có muốn scrape chi tiết cho ${maxDetails} sản phẩm?\n\n` +
        `Skip: ${skipProducts} sản phẩm đầu\n` +
        `Force API: ${forceAPI ? 'Có' : 'Không'}\n\n` +
        `Lưu ý: Quá trình này sẽ tự động mở từng trang và có thể mất ${Math.ceil(maxDetails * 3 / 60)} phút.`
      );
      
      if (!confirmed) return;

      window.PopupDisplay.showMessage(
        `Đang scrape chi tiết ${maxDetails} sản phẩm... ${forceAPI ? '(Force API)' : ''} (có thể mất vài phút)`, 
        'loading'
      );
      
      // Listen for details completion
      const detailsListener = (detailsMessage, sender, detailsSendResponse) => {
        if (detailsMessage.action === 'detailsScrapingComplete') {
          chrome.runtime.onMessage.removeListener(detailsListener);
          
          const details = detailsMessage.data || [];
          window.PopupState.setDetailData(details);
          
          // Force display results section with data
          if (details && details.length > 0) {
            window.PopupDisplay.displayResults(details, { 
              maxProducts: detailsMessage.maxProducts || details.length 
            });
          }
          
          // Hide processing status
          const processingStatus = document.getElementById('processingStatus');
          if (processingStatus) {
            processingStatus.style.display = 'none';
          }
          
          // Chỉ hiện 1 line message ngắn gọn
          const maxProducts = detailsMessage.maxProducts || details.length;
          window.PopupDisplay.showMessage(
            `✅ Đã scrape thành công ${details.length}/${maxProducts} sản phẩm`, 
            'success'
          );
          detailsSendResponse({ success: true });
        }
        return true;
      };

      chrome.runtime.onMessage.addListener(detailsListener);
      
      chrome.tabs.sendMessage(tab.id, {
        action: 'scrape',
        type: 'productDetailsFromList',
        options: {
          productLinks: productLinks.slice(0, maxDetails),
          delay: 2000,
          maxDetails: maxDetails,
          forceAPI: forceAPI
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          chrome.runtime.onMessage.removeListener(detailsListener);
          window.PopupDisplay.showMessage('Lỗi: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        // Chi tiết sẽ được trả về qua detailsScrapingComplete
        if (response?.success !== false) {
          window.PopupDisplay.showMessage(
            `🔍 Đang scrape chi tiết... (trình duyệt sẽ tự mở từng sản phẩm)`,
            'loading'
          );
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
    },

    /**
     * Handle scrape list AND details in one click
     * Scrapes product list first, then automatically scrapes details from the links
     */
    handleScrapeListAndDetails: function(tab) {
      if (!tab || !tab.id) {
        window.PopupDisplay.showMessage('Không thể truy cập tab', 'error');
        return;
      }

      // Fix: Clear any existing state first to prevent stuck listeners
      // This fixes the issue where scraping doesn't work after clear + routing
      // Clear all scraper-related states to ensure clean start
      const stateKeysToRemove = [
        'scrapeDetailsState',
        'paginationState',
        window.DataScraperStateManager?.KEYS?.PAGINATION,
        window.DataScraperStateManager?.KEYS?.DETAIL_LIST,
        window.DataScraperStateManager?.KEYS?.API_CACHE
      ].filter(Boolean);
      
      console.log('[ScrapeListAndDetails] Clearing existing states before starting:', stateKeysToRemove);
      chrome.storage.local.remove(stateKeysToRemove, () => {
        if (chrome.runtime.lastError) {
          console.error('[ScrapeListAndDetails] Error clearing states:', chrome.runtime.lastError);
        } else {
          console.log('[ScrapeListAndDetails] Successfully cleared existing states');
        }
        // Continue after cleanup
      });

      const maxProductsInput = document.getElementById('maxProducts');
      const skipProductsInput = document.getElementById('skipProducts');
      const productSelectorInput = document.getElementById('productSelector');
      const containerSelectorInput = document.getElementById('containerSelector');
      const loadMoreSelectorInput = document.getElementById('loadMoreSelector');
      const nextPageSelectorInput = document.getElementById('nextPageSelector');
      
      const maxProducts = parseInt(maxProductsInput?.value) || 100;
      const skipProducts = parseInt(skipProductsInput?.value) || 0;
      const productSelector = productSelectorInput?.value.trim() || null;
      const containerSelector = containerSelectorInput?.value.trim() || null;
      const loadMoreSelector = loadMoreSelectorInput?.value.trim() || null;
      const nextPageSelector = nextPageSelectorInput?.value.trim() || null;
      const maxDetails = maxProducts; // Limit details = list (same limit)
      
      // Validate skip + limit
      if (skipProducts < 0) {
        window.PopupDisplay.showMessage('Skip không thể âm', 'error');
        return;
      }
      
      if (maxProducts <= 0) {
        window.PopupDisplay.showMessage('Limit phải lớn hơn 0', 'error');
        return;
      }

      // Show custom modal to choose method
      const modal = document.getElementById('methodModal');
      if (!modal) {
        // Fallback to confirm
        const method = confirm(
          `Chọn phương thức scrape list:\n\n` +
          `OK = Scroll\n` +
          `Cancel = Pagination`
        ) ? 'scroll' : 'pagination';
        proceedWithScraping(method);
        return;
      }

      const options = modal.querySelectorAll('.modal-option');
      const confirmBtn = document.getElementById('modalConfirm');
      const cancelBtn = document.getElementById('modalCancel');
      
      if (!options.length || !confirmBtn || !cancelBtn) {
        // Fallback to confirm
        const method = confirm(
          `Chọn phương thức scrape list:\n\n` +
          `OK = Scroll\n` +
          `Cancel = Pagination`
        ) ? 'scroll' : 'pagination';
        proceedWithScraping(method);
        return;
      }

      let selectedMethod = 'scroll'; // Default

      // Reset selection
      options.forEach(opt => opt.classList.remove('selected'));
      if (options[0]) {
        options[0].classList.add('selected');
      }

      // Option click handler
      const optionClickHandler = (option) => {
        options.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        selectedMethod = option.dataset.method;
      };

      options.forEach(option => {
        option.addEventListener('click', () => optionClickHandler(option));
      });

      // Show modal
      modal.style.display = 'flex';
      modal.classList.add('active');
      
      // Force show (in case CSS doesn't work)
      setTimeout(() => {
        const computed = window.getComputedStyle(modal);
        if (computed.display === 'none') {
          modal.style.display = 'flex';
          modal.style.visibility = 'visible';
          modal.style.opacity = '1';
        }
      }, 100);

      // Confirm handler
      const handleConfirm = () => {
        modal.classList.remove('active');
        modal.style.display = 'none';
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        options.forEach(opt => {
          opt.removeEventListener('click', () => {});
        });
        
        // Continue with selected method
        proceedWithScraping(selectedMethod);
      };

      // Cancel handler
      const handleCancel = () => {
        modal.classList.remove('active');
        modal.style.display = 'none';
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        options.forEach(opt => {
          opt.removeEventListener('click', () => {});
        });
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);

      // Close on overlay click
      const overlayClickHandler = (e) => {
        if (e.target === modal) {
          handleCancel();
        }
      };
      modal.addEventListener('click', overlayClickHandler);

      function proceedWithScraping(method) {
        const estimatedTime = Math.ceil((maxProducts / 12) * 2 + (maxDetails * 3) / 60);
        const confirmed = confirm(
          `🚀 SCRAPE LIST + DETAIL (1 CLICK)\n\n` +
          `📊 List: ${maxProducts} sản phẩm (${method === 'scroll' ? 'Scroll' : 'Pagination'})\n` +
          `🔍 Detail: ${maxDetails} sản phẩm (bằng với list)\n` +
          `⏱️ Ước tính: ~${estimatedTime} phút\n\n` +
          `Quá trình tự động:\n` +
          `1️⃣ Scrape danh sách sản phẩm\n` +
          `2️⃣ Tự động scrape chi tiết từ các link đã lấy`
        );
        
        if (!confirmed) return;

        window.PopupDisplay.showMessage(
          `🚀 Bước 1/2: Đang scrape ${maxProducts} sản phẩm (${method === 'scroll' ? 'Scroll' : 'Pagination'})...`, 
          'loading'
        );

        const requestId = 'listAndDetails_' + Date.now();
        let productList = [];

      // Listen for pagination/scroll completion
      const messageListener = (message, sender, sendResponse) => {
        // Log ALL messages to debug
        console.log('[ScrapeListAndDetails] Message received (all):', {
          action: message?.action,
          requestId: message?.requestId,
          expectedRequestId: requestId,
          hasData: !!message?.data,
          dataLength: message?.data?.length || 0,
          sender: sender?.tab?.id || 'unknown'
        });
        
        // Log specific messages for debugging
        if (message?.action === 'paginationComplete' || message?.action === 'scrollComplete') {
          console.log('[ScrapeListAndDetails] Received scrollComplete/paginationComplete message:', {
            action: message.action,
            requestId: message.requestId,
            expectedRequestId: requestId,
            match: message.requestId === requestId,
            dataLength: message.data?.length || 0,
            sender: sender?.tab?.id || 'unknown'
          });
        }
        
        if ((message?.action === 'paginationComplete' || message?.action === 'scrollComplete') && 
            message?.requestId === requestId) {
          console.log('[ScrapeListAndDetails] Message matched! Processing...');
          chrome.runtime.onMessage.removeListener(messageListener);
          
          productList = message.data || [];
          console.log('[ScrapeListAndDetails] Product list received:', productList.length, 'items');
          
          // Extract all links first
          const allProductLinks = productList
            .map(p => p.link || p.url || p.href)
            .filter(link => link && link.includes('.html'));
          
          console.log('[ScrapeListAndDetails] All product links:', allProductLinks.length);
          
          // Apply skip: skip first N items, then take maxDetails items
          // Example: skip=100, limit=100 → scrape 200 items, then take items 101-200
          const productLinks = allProductLinks.slice(skipProducts, skipProducts + maxDetails);
          
          console.log(`[ScrapeListAndDetails] Skip: ${skipProducts}, Limit: ${maxDetails}, Total scraped: ${productList.length}, Total links: ${allProductLinks.length}, Links to scrape: ${productLinks.length} (range: ${skipProducts + 1}-${skipProducts + productLinks.length})`);
          
          if (productLinks.length === 0) {
            window.PopupDisplay.showMessage(
              `Không có link nào sau khi skip ${skipProducts} items. Tổng số links: ${allProductLinks.length}`, 
              'error'
            );
            return;
          }
          
          console.log('[ScrapeListAndDetails] Starting detail scraping for', productLinks.length, 'products');

          // Step 2: Scrape details
          window.PopupDisplay.showMessage(
            `✅ Đã scrape ${productList.length} sản phẩm trong list\n` +
            `🔍 Bước 2/2: Đang scrape chi tiết ${productLinks.length} sản phẩm (giới hạn: ${maxDetails})...`, 
            'loading'
          );

          // Listen for details completion (separate listener)
          const detailsListener = (detailsMessage, sender, detailsSendResponse) => {
            if (detailsMessage.action === 'detailsScrapingComplete') {
              chrome.runtime.onMessage.removeListener(detailsListener);
              chrome.runtime.onMessage.removeListener(messageListener);
              
              const details = detailsMessage.data || [];
              window.PopupState.setDetailData(details);
              window.PopupDisplay.displayResults(details, { maxProducts: maxDetails });
              
              // Hide processing status
              const processingStatus = document.getElementById('processingStatus');
              if (processingStatus) {
                processingStatus.style.display = 'none';
              }
              
              // Chỉ hiện 1 line message ngắn gọn
              window.PopupDisplay.showMessage(
                `✅ Đã scrape thành công ${details.length}/${maxDetails} sản phẩm`, 
                'success'
              );
              detailsSendResponse({ success: true });
            }
            return true;
          };

          chrome.runtime.onMessage.addListener(detailsListener);

          const forceAPIInput = document.getElementById('forceAPIScraping');
          const forceAPI = forceAPIInput ? forceAPIInput.checked : false;

          console.log('[ScrapeListAndDetails] Sending detail scrape request with', productLinks.length, 'links');
          chrome.tabs.sendMessage(tab.id, {
            action: 'scrape',
            type: 'productDetailsFromList',
            options: {
              productLinks: productLinks,
              delay: 2000,
              maxDetails: maxDetails,
              forceAPI: forceAPI
            }
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('[ScrapeListAndDetails] Error sending detail scrape request:', chrome.runtime.lastError);
              chrome.runtime.onMessage.removeListener(detailsListener);
              window.PopupDisplay.showMessage('Lỗi: ' + chrome.runtime.lastError.message, 'error');
              return;
            }
            console.log('[ScrapeListAndDetails] Detail scrape request sent, response:', response);
            // Response chỉ là empty array, chi tiết sẽ đến qua detailsScrapingComplete
            if (response?.success !== false) {
              // Đã bắt đầu scrape, chờ detailsScrapingComplete
              window.PopupDisplay.showMessage(
                `🚀 Đã bắt đầu scrape chi tiết...\n` +
                `Đang navigate giữa các trang sản phẩm...`, 
                'loading'
              );
            }
          });
          
          sendResponse({ success: true });
        }
      };

      // Add listener BEFORE starting scrape to ensure it's ready
      chrome.runtime.onMessage.addListener(messageListener);
      console.log('[ScrapeListAndDetails] Message listener added, waiting for scrollComplete/paginationComplete with requestId:', requestId);

      // Start list scraping
      // Need to scrape MORE to account for skip: skip + limit
      // Example: skip=100, limit=100 → scrape 200 items, then slice to get items 101-200
      const totalToScrape = skipProducts + maxProducts;
      console.log(`[ScrapeListAndDetails] Scraping list: skip=${skipProducts}, limit=${maxProducts}, total=${totalToScrape}`);
      
      const listOptions = {
        maxProducts: totalToScrape, // Scrape total = skip + limit
        productSelector,
        containerSelector,
        requestId: requestId,
        [method === 'scroll' ? 'loadMoreSelector' : 'nextPageSelector']: 
          method === 'scroll' ? loadMoreSelector : nextPageSelector,
        useLoadMore: method === 'scroll',
        scrollDelay: 1000,
        maxScrolls: 100,
        pageDelay: 2000,
        maxPages: Math.ceil(totalToScrape / 12) + 2
      };

      chrome.tabs.sendMessage(tab.id, {
        action: 'scrape',
        type: method === 'scroll' ? 'productsWithScroll' : 'productsWithPagination',
        options: listOptions
      }, (response) => {
        if (chrome.runtime.lastError) {
          chrome.runtime.onMessage.removeListener(messageListener);
          const errorMsg = chrome.runtime.lastError.message;
          if (errorMsg.includes('Receiving end does not exist')) {
            window.PopupDisplay.showMessage('Content script chưa được load. Vui lòng reload trang và thử lại.', 'error');
          } else {
            window.PopupDisplay.showMessage('Lỗi: ' + errorMsg, 'error');
          }
        } else if (response?.success && response.data) {
          // If list scraping completes immediately (single page, no pagination needed)
          productList = response.data;
          const allProductLinks = productList
            .map(p => p.link || p.url || p.href)
            .filter(link => link && link.includes('.html'));
          
          // Apply skip: skip first N items, then take maxDetails items
          const productLinks = allProductLinks.slice(skipProducts, skipProducts + maxDetails);

          if (productLinks.length > 0) {
            chrome.runtime.onMessage.removeListener(messageListener);
            // Trigger detail scraping
            window.PopupDisplay.showMessage(
              `✅ Đã scrape ${productList.length} sản phẩm trong list\n` +
              `🔍 Bước 2/2: Đang scrape chi tiết ${productLinks.length} sản phẩm...`, 
              'loading'
            );

            chrome.tabs.sendMessage(tab.id, {
              action: 'scrape',
              type: 'productDetailsFromList',
              options: {
                productLinks: productLinks,
                delay: 2000,
                maxDetails: maxDetails
              }
            }, (detailResponse) => {
              if (chrome.runtime.lastError) {
                window.PopupDisplay.showMessage('Lỗi: ' + chrome.runtime.lastError.message, 'error');
                return;
              }
              if (detailResponse?.success) {
                // Kết quả chi tiết sẽ được gửi qua detailsScrapingComplete
                window.PopupDisplay.showMessage(
                  `🔍 Đang scrape chi tiết... (trình duyệt sẽ tự mở từng sản phẩm)`,
                  'loading'
                );
              } else {
                window.PopupDisplay.showMessage('Lỗi: ' + (detailResponse?.error || 'Unknown error'), 'error');
              }
            });
          } else {
            window.PopupDisplay.showMessage('Không tìm thấy link sản phẩm trong danh sách!', 'error');
          }
        }
      });
      }
    }
  };
})();

