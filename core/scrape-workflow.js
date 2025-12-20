(() => {
  'use strict';

  // ============================================
  // 🔄 SCRAPE WORKFLOW MODULE
  // ============================================
  // Workflow mới: Load tất cả sản phẩm → Apply skip/limit → Get detail
  // Giữ nguyên format output cũ
  window.DataScraperWorkflow = {
    /**
     * Scrape list và detail theo workflow mới
     * @param {Object} options - Options
     * @param {number} options.skip - Số sản phẩm bỏ qua từ đầu
     * @param {number} options.limit - Số sản phẩm cần scrape detail
     * @param {string} options.method - 'scroll' hoặc 'pagination'
     * @param {string} options.productSelector - Product selector
     * @param {string} options.containerSelector - Container selector
     * @param {string} options.loadMoreSelector - Load more button selector (cho scroll)
     * @param {string} options.nextPageSelector - Next page selector (cho pagination)
     * @param {boolean} options.forceAPI - Force API scraping cho detail
     * @param {Function} options.onProgress - Callback khi có progress update
     * @param {Function} options.onComplete - Callback khi hoàn thành
     * @param {Function} options.onError - Callback khi có lỗi
     */
    scrapeListAndDetails: async function(options = {}) {
      const {
        skip = 0,
        limit = 100,
        method = 'scroll',
        productSelector = null,
        containerSelector = null,
        loadMoreSelector = null,
        nextPageSelector = null,
        forceAPI = false,
        onProgress = null,
        onComplete = null,
        onError = null
      } = options;

      try {
        // Step 1: Tính số lượng cần load (skip + limit)
        const maxProductsToLoad = skip + limit;
        
        if (onProgress) {
          onProgress({
            step: 'loading_list',
            message: `Đang load ${maxProductsToLoad} sản phẩm (skip: ${skip}, limit: ${limit})...`,
            progress: 0
          });
        }

        const allProducts = await this._loadAllProducts({
          method,
          productSelector,
          containerSelector,
          loadMoreSelector,
          nextPageSelector,
          maxProducts: maxProductsToLoad,
          onProgress: (progressData) => {
            if (onProgress) {
              onProgress({
                step: 'loading_list',
                message: progressData.message,
                progress: progressData.progress
              });
            }
          }
        });

        console.log(`[Workflow] Đã load ${allProducts.length} sản phẩm từ list (yêu cầu: ${maxProductsToLoad})`);

        // Step 2: Extract links và apply skip/limit
        const allProductLinks = allProducts
          .map(p => p.link || p.url || p.href)
          .filter(link => link && link.includes('.html'));

        console.log(`[Workflow] Tổng số links: ${allProductLinks.length}`);

        // Apply skip và limit
        const startIndex = skip;
        const endIndex = skip + limit;
        const productLinks = allProductLinks.slice(startIndex, endIndex);

        console.log(`[Workflow] Skip: ${skip}, Limit: ${limit}`);
        console.log(`[Workflow] Links sau khi apply skip/limit: ${productLinks.length} (range: ${startIndex + 1}-${endIndex})`);

        if (productLinks.length === 0) {
          const errorMsg = `Không có link nào sau khi skip ${skip} items. Tổng số links: ${allProductLinks.length}`;
          if (onError) {
            onError(new Error(errorMsg));
          }
          return;
        }

        // Step 3: Scrape details
        if (onProgress) {
          onProgress({
            step: 'scraping_details',
            message: `Đang scrape chi tiết ${productLinks.length} sản phẩm...`,
            progress: 0
          });
        }

        const details = await this._scrapeDetails({
          productLinks,
          forceAPI,
          onProgress: (progressData) => {
            if (onProgress) {
              onProgress({
                step: 'scraping_details',
                message: progressData.message,
                progress: progressData.progress
              });
            }
          }
        });

        console.log(`[Workflow] Đã scrape ${details.length}/${productLinks.length} sản phẩm detail`);

        // Step 4: Complete
        if (onComplete) {
          onComplete({
            listCount: allProducts.length,
            detailCount: details.length,
            expectedDetailCount: productLinks.length,
            details: details
          });
        }

        return details;
      } catch (error) {
        console.error('[Workflow] Error:', error);
        if (onError) {
          onError(error);
        }
        throw error;
      }
    },

    /**
     * Load sản phẩm từ trang theo số lượng yêu cầu (skip + limit)
     * @private
     */
    _loadAllProducts: async function(options) {
      const {
        method,
        productSelector,
        containerSelector,
        loadMoreSelector,
        nextPageSelector,
        maxProducts = 100, // Mặc định 100 nếu không có
        onProgress
      } = options;

      return new Promise((resolve, reject) => {
        // Sử dụng maxProducts được truyền vào (skip + limit)

        const requestId = 'workflow_' + Date.now().toString();

        // Listen for completion
        const messageListener = (message, sender, sendResponse) => {
          if ((message?.action === 'paginationComplete' || message?.action === 'scrollComplete') &&
              message?.requestId === requestId) {
            chrome.runtime.onMessage.removeListener(messageListener);
            
            const products = message.data || [];
            console.log(`[Workflow] Received ${products.length} products from ${method}`);
            
            if (onProgress) {
              onProgress({
                message: `Đã load ${products.length} sản phẩm`,
                progress: 100
              });
            }
            
            resolve(products);
            sendResponse({ success: true });
          }
          return true;
        };

        chrome.runtime.onMessage.addListener(messageListener);

        // Start scraping
        const scrapeOptions = {
          maxProducts: maxProducts,
          productSelector: productSelector,
          containerSelector: containerSelector,
          requestId: requestId
        };

        if (method === 'scroll') {
          scrapeOptions.loadMoreSelector = loadMoreSelector;
          scrapeOptions.useLoadMore = true;
          scrapeOptions.scrollDelay = 1000;
          // Tính số scrolls cần thiết dựa trên maxProducts
          // Thực tế mỗi scroll chỉ load ~8-12 items (không phải 15-20)
          // Ước tính an toàn: 8 items/scroll, buffer 40 để đảm bảo scrape đủ
          const itemsPerScroll = 8; // Conservative estimate based on actual behavior
          const buffer = 40; // Large buffer to ensure we don't stop early
          scrapeOptions.maxScrolls = Math.ceil(maxProducts / itemsPerScroll) + buffer;
          console.log(`[Workflow] Calculated maxScrolls: ${scrapeOptions.maxScrolls} (for ${maxProducts} products, ${itemsPerScroll} items/scroll, buffer: ${buffer})`);
        } else {
          scrapeOptions.nextPageSelector = nextPageSelector;
          scrapeOptions.pageDelay = 2000;
          // Tính số pages cần thiết dựa trên maxProducts (ước tính mỗi page ~20-30 sản phẩm)
          scrapeOptions.maxPages = Math.ceil(maxProducts / 20) + 2; // Thêm buffer
        }

        // Send message to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs || tabs.length === 0) {
            chrome.runtime.onMessage.removeListener(messageListener);
            reject(new Error('No active tab found'));
            return;
          }

          const tab = tabs[0];
          chrome.tabs.sendMessage(tab.id, {
            action: 'scrape',
            type: method === 'scroll' ? 'productsWithScroll' : 'productsWithPagination',
            options: scrapeOptions
          }, (response) => {
            if (chrome.runtime.lastError) {
              chrome.runtime.onMessage.removeListener(messageListener);
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            // Nếu response có data ngay (single page, no pagination)
            if (response?.success && response.data && Array.isArray(response.data)) {
              chrome.runtime.onMessage.removeListener(messageListener);
              resolve(response.data);
            }
            // Nếu không, chờ message từ content script
          });
        });
      });
    },

    /**
     * Scrape details từ danh sách links
     * @private
     */
    _scrapeDetails: async function(options) {
      const {
        productLinks,
        forceAPI = false,
        onProgress
      } = options;

      return new Promise((resolve, reject) => {
        const details = [];
        let currentIndex = 0;

        // Listen for details completion
        const detailsListener = (message, sender, sendResponse) => {
          if (message?.action === 'detailsScrapingComplete') {
            chrome.runtime.onMessage.removeListener(detailsListener);
            
            const scrapedDetails = message.data || [];
            console.log(`[Workflow] Received ${scrapedDetails.length} details`);
            
            resolve(scrapedDetails);
            sendResponse({ success: true });
          }
          return true;
        };

        chrome.runtime.onMessage.addListener(detailsListener);

        // Start detail scraping
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs || tabs.length === 0) {
            chrome.runtime.onMessage.removeListener(detailsListener);
            reject(new Error('No active tab found'));
            return;
          }

          const tab = tabs[0];
          
          // Save state để content script có thể tiếp tục
          chrome.storage.local.set({
            scrapeDetailsState: {
              links: productLinks,
              currentIndex: 0,
              details: [],
              maxDetails: productLinks.length,
              forceAPI: forceAPI
            }
          }, () => {
            // Send message để bắt đầu scrape detail
            chrome.tabs.sendMessage(tab.id, {
              action: 'scrape',
              type: 'productDetailsFromList',
              options: {
                productLinks: productLinks,
                delay: 2000,
                maxDetails: productLinks.length,
                forceAPI: forceAPI
              }
            }, (response) => {
              if (chrome.runtime.lastError) {
                chrome.runtime.onMessage.removeListener(detailsListener);
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }

              // Update progress
              if (onProgress) {
                onProgress({
                  message: `Đã bắt đầu scrape chi tiết...`,
                  progress: 0
                });
              }

              // Chi tiết sẽ được gửi qua detailsScrapingComplete message
            });
          });
        });
      });
    }
  };
})();

