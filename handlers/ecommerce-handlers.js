(() => {
  'use strict';

  // ============================================
  // 🛍️ E-COMMERCE HANDLERS (Custom cho Long Châu/E-commerce)
  // ============================================
  window.DataScraperEcommerceHandlers = {
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
          scrollDelay: 1000,
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
     * Shows format selection modal before starting
     */
    handleScrapeListAndDetails: function(tab) {
      // Show format selection modal first (chỉ cho manual export)
      const formatModal = document.getElementById('exportFormatModal');
      if (formatModal) {
        // Store tab reference for later use
        formatModal.dataset.tabId = tab.id;
        
        // Setup format selection handler
        const confirmBtn = document.getElementById('confirmExportFormat');
        const cancelBtn = document.getElementById('cancelExportFormat');
        let selectedFormat = 'csv'; // Default
        
        // Remove existing listeners to avoid duplicates
        const newConfirmBtn = confirmBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        // Setup format selection
        const formatOptions = document.querySelectorAll('#exportFormatModal .modal-option');
        formatOptions.forEach(option => {
          option.addEventListener('click', () => {
            formatOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedFormat = option.dataset.format || 'csv';
          });
        });
        
        // Set default selection (CSV)
        if (formatOptions.length > 0) {
          formatOptions[0].classList.add('selected');
        }
        
        // Confirm handler
        newConfirmBtn.addEventListener('click', () => {
          formatModal.style.display = 'none';
          // Store selected format for later use
          chrome.storage.local.set({ manualExportFormat: selectedFormat }, () => {
            // Continue with scraping
            this._proceedWithScrapeListAndDetails(tab);
          });
        });
        
        // Cancel handler
        newCancelBtn.addEventListener('click', () => {
          formatModal.style.display = 'none';
        });
        
        // Show modal
        formatModal.style.display = 'flex';
        return; // Stop here, will continue after format selection
      }
      
      // Fallback: proceed without modal if modal not found
      this._proceedWithScrapeListAndDetails(tab);
    },
    
    /**
     * Internal function to proceed with scrape list and details
     */
    _proceedWithScrapeListAndDetails: function(tab) {
      if (!this._validateTab(tab)) return;

      // Fix: Clear any existing state first to prevent stuck listeners
      // This fixes the issue where scraping doesn't work after clear + routing
      // Clear all scraper-related states to ensure clean start
      const stateKeysToRemove = [
        'scrapeDetailsState',
        'paginationState',
        // Export related keys (clear to avoid conflicts with previous session)
        'currentExportBatch',
        'exportCompleted',
        'pendingAutoExport',
        window.DataScraperStateManager?.KEYS?.PAGINATION,
        window.DataScraperStateManager?.KEYS?.DETAIL_LIST,
        window.DataScraperStateManager?.KEYS?.API_CACHE
      ].filter(Boolean);
      
      chrome.storage.local.remove(stateKeysToRemove, () => {
        if (chrome.runtime.lastError) {
          console.error('[ScrapeListAndDetails] Error clearing states:', chrome.runtime.lastError);
        }
        // Continue after cleanup
      });

      const maxProductsInput = document.getElementById('maxProducts');
      const skipProductsInput = document.getElementById('skipProducts');
      const productSelectorInput = document.getElementById('productSelector');
      const containerSelectorInput = document.getElementById('containerSelector');
      const loadMoreSelectorInput = document.getElementById('loadMoreSelector');
      const nextPageSelectorInput = document.getElementById('nextPageSelector');
      
      let maxProducts = parseInt(maxProductsInput?.value) || 100;
      let skipProducts = parseInt(skipProductsInput?.value) || 0;
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
        
        proceedWithScrapingInternal(skipProducts, maxProducts);
      });
      
      function proceedWithScrapingInternal(actualSkip, actualLimit) {
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
                // Clear manual format after use
                chrome.storage.local.remove(['manualExportFormat'], () => {
                  // Export with selected format (no modal, format already chosen)
                  window.DataScraperExportHandler.exportData(manualFormat, result.details);
                });
              }
            });

            // Show success message
            const autoExportMsg = autoExportCheckbox?.checked ? ' (đang tự động export...)' : '';
            window.PopupDisplay.showMessage(
              `✅ Đã scrape thành công ${result.detailCount}/${result.expectedDetailCount} sản phẩm${autoExportMsg}\n` +
              `📊 Tổng số sản phẩm trong list: ${result.listCount}`,
              'success'
            );
          },
          onError: (error) => {
            // Hide processing status
            if (processingStatus) {
              processingStatus.style.display = 'none';
            }

            window.PopupDisplay.showMessage(
              `❌ Lỗi: ${error.message || 'Unknown error'}`,
              'error'
            );
          }
        });
      }
      }
    }
  };
})();

