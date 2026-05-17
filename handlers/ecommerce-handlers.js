(() => {
  'use strict';

  // ============================================
  // 🛍️ E-COMMERCE HANDLERS (Custom cho Long Châu/E-commerce)
  // ============================================
  window.DataScraperEcommerceHandlers = {
    // Flags to prevent multiple modals
    _formatModalOpen: false,
    _methodModalOpen: false,
    _methodModalSelected: false, // Track if method was already selected
    _scrapeConfigModalOpen: false, // Combined modal flag
    _formatModalListeners: null,
    _methodModalListeners: null,
    _scrapeConfigModalListeners: null,

    /**
     * Helper: Validate tab access
     */
    _validateTab: function(tab) {
      if (!tab || !tab.id) {
        window.PopupDisplay.showMessage('Không thể truy cập tab', 'error');
        return false;
      }
      return true;
    },

    /**
     * Handle scrape many products with scroll
     */
    handleScrapeManyProducts: function(tab) {
      if (!this._validateTab(tab)) return;

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
          scrollDelay: 700, // Optimized: reduced from 1000ms
          maxScrolls: 100
        }
      }, window.PopupScrape.handleResponse);
    },

    /**
     * Handle scrape with pagination
     */
    handleScrapeWithPagination: function(tab) {
      if (!this._validateTab(tab)) return;

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
          pageDelay: 1200, // Optimized: reduced from 2000ms
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
      if (!this._validateTab(tab)) return;

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
      if (!this._validateTab(tab)) return;

      // Cleanup skip for new session (if user hasn't set skip value)
      this._cleanupSkipForNewSession();

      const currentData = window.PopupState.getListData();
      if (!currentData || !Array.isArray(currentData) || currentData.length === 0) {
        window.PopupDisplay.showMessage('Không có danh sách sản phẩm. Vui lòng scrape danh sách trước!', 'error');
        return;
      }

      const skipProductsInput = document.getElementById('skipProducts');
      const forceAPIInput = document.getElementById('forceAPIScraping');
      const scrapeDelayInput = document.getElementById('scrapeDelay');
      
      const skipProducts = parseInt(skipProductsInput?.value) || 0;
      const forceAPI = forceAPIInput ? forceAPIInput.checked : false;
      const scrapeDelay = parseInt(scrapeDelayInput?.value) || 5000;

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
          delay: scrapeDelay,
          maxDetails: maxDetails,
          forceAPI: forceAPI,
          skip: skipProducts // Pass skip value to calculate actual item number (1-based)
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
      if (!this._validateTab(tab)) return;

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
      if (!this._validateTab(tab)) return;

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
     * Shows combined modal for method and format selection
     */
    handleScrapeListAndDetails: function(tab) {
      // Prevent multiple modals
      if (this._scrapeConfigModalOpen) {
        console.warn('[EcommerceHandlers] Scrape config modal already open, ignoring duplicate click');
        return;
      }

      // Show combined modal for method and format selection
      const configModal = document.getElementById('scrapeConfigModal');
      if (configModal) {
        // Check if modal is already visible
        if (configModal.style.display === 'flex' || configModal.classList.contains('active')) {
          console.warn('[EcommerceHandlers] Scrape config modal already visible, ignoring duplicate click');
          return;
        }

        // Mark modal as open
        this._scrapeConfigModalOpen = true;
        
        // Setup selections with defaults
        let selectedMethod = 'pagination'; // Default: pagination
        let selectedFormat = 'csv'; // Default: csv
        
        // Clean up old listeners if they exist
        if (this._scrapeConfigModalListeners) {
          this._cleanupScrapeConfigModalListeners();
        }
        
        // Store listeners for cleanup
        this._scrapeConfigModalListeners = {
          methodOptions: [],
          formatOptions: [],
          confirm: null,
          cancel: null,
          overlay: null
        };
        
        // Setup method selection
        const methodOptions = configModal.querySelectorAll('.modal-option[data-method]');
        const methodClickHandler = (option) => {
          methodOptions.forEach(opt => opt.classList.remove('selected'));
          option.classList.add('selected');
          selectedMethod = option.dataset.method || 'pagination';
        };
        
        methodOptions.forEach(option => {
          const handler = () => methodClickHandler(option);
          option.addEventListener('click', handler);
          this._scrapeConfigModalListeners.methodOptions.push({ element: option, handler });
        });
        
        // Set default method selection (Pagination)
        const defaultMethodOption = configModal.querySelector('.modal-option[data-method="pagination"]');
        if (defaultMethodOption) {
          defaultMethodOption.classList.add('selected');
        } else if (methodOptions.length > 0) {
          methodOptions[methodOptions.length - 1].classList.add('selected'); // Last one (pagination)
        }
        
        // Setup format selection
        const formatOptions = configModal.querySelectorAll('.modal-option[data-format]');
        const formatClickHandler = (option) => {
          formatOptions.forEach(opt => opt.classList.remove('selected'));
          option.classList.add('selected');
          selectedFormat = option.dataset.format || 'csv';
        };
        
        formatOptions.forEach(option => {
          const handler = () => formatClickHandler(option);
          option.addEventListener('click', handler);
          this._scrapeConfigModalListeners.formatOptions.push({ element: option, handler });
        });
        
        // Set default format selection (CSV)
        const defaultFormatOption = configModal.querySelector('.modal-option[data-format="csv"]');
        if (defaultFormatOption) {
          defaultFormatOption.classList.add('selected');
        } else if (formatOptions.length > 0) {
          formatOptions[0].classList.add('selected'); // First one (CSV)
        }
        
        const confirmBtn = document.getElementById('scrapeConfigConfirm');
        const cancelBtn = document.getElementById('scrapeConfigCancel');
        
        // Confirm handler
        const confirmHandler = () => {
          this._scrapeConfigModalOpen = false;
          configModal.style.display = 'none';
          configModal.classList.remove('active');
          this._cleanupScrapeConfigModalListeners();
          
          // Store selected format and proceed with scraping
          chrome.storage.local.set({ manualExportFormat: selectedFormat }, () => {
            // Continue with scraping using selected method
            this._proceedWithScrapeListAndDetails(tab, selectedMethod);
          });
        };
        
        // Cancel handler
        const cancelHandler = () => {
          this._scrapeConfigModalOpen = false;
          configModal.style.display = 'none';
          configModal.classList.remove('active');
          this._cleanupScrapeConfigModalListeners();
        };
        
        confirmBtn.addEventListener('click', confirmHandler);
        cancelBtn.addEventListener('click', cancelHandler);
        this._scrapeConfigModalListeners.confirm = { element: confirmBtn, handler: confirmHandler };
        this._scrapeConfigModalListeners.cancel = { element: cancelBtn, handler: cancelHandler };
        
        // Close on overlay click
        const overlayClickHandler = (e) => {
          if (e.target === configModal) {
            cancelHandler();
          }
        };
        configModal.addEventListener('click', overlayClickHandler);
        this._scrapeConfigModalListeners.overlay = { element: configModal, handler: overlayClickHandler };
        
        // Show modal
        configModal.style.display = 'flex';
        configModal.classList.add('active');
        return; // Stop here, will continue after selection
      }
      
      // Fallback: proceed without modal if modal not found
      this._proceedWithScrapeListAndDetails(tab, 'pagination');
    },

    /**
     * Clean up format modal listeners
     */
    _cleanupFormatModalListeners: function() {
      if (!this._formatModalListeners) return;
      
      // Remove format option listeners
      if (this._formatModalListeners.formatOptions) {
        this._formatModalListeners.formatOptions.forEach(({ element, handler }) => {
          element.removeEventListener('click', handler);
        });
      }
      
      // Remove button listeners
      if (this._formatModalListeners.confirm) {
        this._formatModalListeners.confirm.element.removeEventListener('click', this._formatModalListeners.confirm.handler);
      }
      if (this._formatModalListeners.cancel) {
        this._formatModalListeners.cancel.element.removeEventListener('click', this._formatModalListeners.cancel.handler);
      }
      
      this._formatModalListeners = null;
    },
    
    /**
     * Clean up scrape config modal listeners
     */
    _cleanupScrapeConfigModalListeners: function() {
      if (!this._scrapeConfigModalListeners) return;
      
      // Remove method option listeners
      if (this._scrapeConfigModalListeners.methodOptions) {
        this._scrapeConfigModalListeners.methodOptions.forEach(({ element, handler }) => {
          element.removeEventListener('click', handler);
        });
      }
      
      // Remove format option listeners
      if (this._scrapeConfigModalListeners.formatOptions) {
        this._scrapeConfigModalListeners.formatOptions.forEach(({ element, handler }) => {
          element.removeEventListener('click', handler);
        });
      }
      
      // Remove button listeners
      if (this._scrapeConfigModalListeners.confirm) {
        this._scrapeConfigModalListeners.confirm.element.removeEventListener('click', this._scrapeConfigModalListeners.confirm.handler);
      }
      if (this._scrapeConfigModalListeners.cancel) {
        this._scrapeConfigModalListeners.cancel.element.removeEventListener('click', this._scrapeConfigModalListeners.cancel.handler);
      }
      
      // Remove overlay listener
      if (this._scrapeConfigModalListeners.overlay) {
        this._scrapeConfigModalListeners.overlay.element.removeEventListener('click', this._scrapeConfigModalListeners.overlay.handler);
      }
      
      this._scrapeConfigModalListeners = null;
    },

    /**
     * Cleanup skip value for new session
     * If user has skip input value, keep it; otherwise reset to 0 and clear storage
     */
    _cleanupSkipForNewSession: function() {
      const skipProductsInput = document.getElementById('skipProducts');
      if (!skipProductsInput) return;
      
      const currentSkipValue = parseInt(skipProductsInput.value) || 0;
      
      // If user has explicitly set skip value (not 0), keep it
      if (currentSkipValue > 0) {
        console.log(`[EcommerceHandlers] Keeping skip value from user input: ${currentSkipValue}`);
        return;
      }
      
      // If skip is 0 or empty, reset to 0
      skipProductsInput.value = 0;
    },

    /**
     * Internal function to proceed with scrape list and details
     */
    _proceedWithScrapeListAndDetails: function(tab, method = 'pagination') {
      if (!this._validateTab(tab)) return;

      // Fix: Clear any existing state first to prevent stuck listeners
      // This fixes the issue where scraping doesn't work after clear + routing
      // Clear all scraper-related states to ensure clean start
      // NOTE: Only clear states BEFORE starting new scrape, not during scraping
      const stateKeysToRemove = [
        'scrapeDetailsState',
        // Don't clear paginationState here - it will be managed by the scraper itself
        // Clearing it here can interrupt ongoing scraping
        // 'paginationState',
        // Export related keys (clear to avoid conflicts with previous session)
        'currentExportBatch',
        'exportCompleted',
        'pendingAutoExport',
        window.DataScraperStateManager?.KEYS?.DETAIL_LIST,
        window.DataScraperStateManager?.KEYS?.API_CACHE
        // Don't clear PAGINATION key here - let scraper manage it
        // window.DataScraperStateManager?.KEYS?.PAGINATION,
      ].filter(Boolean);
      
      chrome.storage.local.remove(stateKeysToRemove, () => {
        if (chrome.runtime.lastError) {
          console.error('[ScrapeListAndDetails] Error clearing states:', chrome.runtime.lastError);
        }
        // Initialize request counter for new session
        chrome.storage.local.set({ sessionRequestCount: 0 });
        // Continue after cleanup
      });
      
      // Cleanup skip for new session (reset if user hasn't set skip value)
      // Do this AFTER clearing states to avoid conflicts
      this._cleanupSkipForNewSession();

      const maxProductsInput = document.getElementById('maxProducts');
      const skipProductsInput = document.getElementById('skipProducts');
      const productSelectorInput = document.getElementById('productSelector');
      const containerSelectorInput = document.getElementById('containerSelector');
      const loadMoreSelectorInput = document.getElementById('loadMoreSelector');
      const nextPageSelectorInput = document.getElementById('nextPageSelector');
      const scrapeDelayInput = document.getElementById('scrapeDelay');
      
      let maxProducts = parseInt(maxProductsInput?.value) || 100;
      let skipProducts = parseInt(skipProductsInput?.value) || 0;
      const productSelector = productSelectorInput?.value.trim() || null;
      const containerSelector = containerSelectorInput?.value.trim() || null;
      const loadMoreSelector = loadMoreSelectorInput?.value.trim() || null;
      const nextPageSelector = nextPageSelectorInput?.value.trim() || null;
      const scrapeDelay = parseInt(scrapeDelayInput?.value) || 5000;
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
      
      // Extract titleSlug from current URL and save to storage
      // Example: https://nhathuoclongchau.com.vn/thuoc/thuoc-dieu-tri-ung-thu -> "thuoc/thuoc-dieu-tri-ung-thu"
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].url) {
          try {
            const url = new URL(tabs[0].url);
            // Extract path segments (remove empty strings and .html files)
            const pathSegments = url.pathname.split('/')
              .filter(p => p && !p.includes('.html') && !p.includes('.'));
            
            if (pathSegments.length > 0) {
              const titleSlug = pathSegments.join('/');
              chrome.storage.local.set({ titleSlug: titleSlug });
            }
          } catch (e) {
            // Ignore errors
          }
        }
        
        // Method will be passed from handleScrapeListAndDetails
        proceedWithScrapingInternal(skipProducts, maxProducts, method);
      });
      
      function proceedWithScrapingInternal(actualSkip, actualLimit, selectedMethod = 'pagination') {
        // Method is already selected from combined modal, proceed directly
        // Define proceedWithScraping function inside this scope
        function proceedWithScraping(method) {
          // Kiểm tra module workflow có sẵn không
          if (!window.DataScraperWorkflow) {
            window.PopupDisplay.showMessage('Module workflow chưa được load. Vui lòng reload extension.', 'error');
            return;
          }

          const forceAPIInput = document.getElementById('forceAPIScraping');
          const forceAPI = forceAPIInput ? forceAPIInput.checked : false;

          // Hiển thị processing status
          const processingStatus = document.getElementById('processingStatus');
          const processingText = document.getElementById('processingText');
          if (processingStatus) {
            processingStatus.style.display = 'block';
          }

          // Sử dụng module workflow mới
          window.DataScraperWorkflow.scrapeListAndDetails({
            skip: actualSkip,
            limit: actualLimit,
            method: method,
            productSelector: productSelector,
            containerSelector: containerSelector,
            loadMoreSelector: loadMoreSelector,
            nextPageSelector: nextPageSelector,
            forceAPI: forceAPI,
            delay: scrapeDelay,
            onProgress: (progressData) => {
              // Update progress
              if (processingText) {
                processingText.textContent = progressData.message || 'Đang xử lý...';
              }
              
              if (progressData.step === 'loading_list') {
                window.PopupDisplay.showMessage(
                  `🚀 Bước 1/2: ${progressData.message}`,
                  'loading'
                );
              } else if (progressData.step === 'scraping_details') {
                window.PopupDisplay.showMessage(
                  `🔍 Bước 2/2: ${progressData.message}`,
                  'loading'
                );
              }
            },
            onComplete: (result) => {
              // Hide processing status
              if (processingStatus) {
                processingStatus.style.display = 'none';
              }

              // Set data và display results
              window.PopupState.setDetailData(result.details);
              window.PopupDisplay.displayResults(result.details, { 
                maxProducts: result.expectedDetailCount 
              });

              // Check if this is manual export (1click) - use selected format
              // Auto-export is handled in content.js, not here
              chrome.storage.local.get(['manualExportFormat'], (storageResult) => {
                const manualFormat = storageResult.manualExportFormat;
                
                // Only export manually if format was selected (from 1click button)
                if (manualFormat && result.details && result.details.length > 0) {
                  // Export with selected format (no modal, format already chosen)
                  window.DataScraperExportHandler.exportData(manualFormat, result.details);
                }
              });
            },
            onError: (error) => {
              // Hide processing status
              if (processingStatus) {
                processingStatus.style.display = 'none';
              }
              
              window.PopupDisplay.showMessage(
                `Lỗi: ${error.message || 'Không thể scrape dữ liệu'}`,
                'error'
              );
            }
          });
        }
        
        // Use the method passed from modal (or default pagination)
        proceedWithScraping(selectedMethod);
      }
    },

    /**
     * Clean up method modal listeners
     */
    _cleanupMethodModalListeners: function() {
      if (!this._methodModalListeners) return;
      
      // Remove option listeners
      if (this._methodModalListeners.options) {
        this._methodModalListeners.options.forEach(({ element, handler }) => {
          element.removeEventListener('click', handler);
        });
      }
      
      // Remove button listeners
      if (this._methodModalListeners.confirm) {
        this._methodModalListeners.confirm.element.removeEventListener('click', this._methodModalListeners.confirm.handler);
      }
      if (this._methodModalListeners.cancel) {
        this._methodModalListeners.cancel.element.removeEventListener('click', this._methodModalListeners.cancel.handler);
      }
      
      // Remove overlay listener
      if (this._methodModalListeners.overlay) {
        this._methodModalListeners.overlay.element.removeEventListener('click', this._methodModalListeners.overlay.handler);
      }
      
      this._methodModalListeners = null;
    }
  };
})();

