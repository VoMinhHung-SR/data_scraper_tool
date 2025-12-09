(() => {
  'use strict';

  // ============================================
  // 📡 MESSAGE HANDLER
  // ============================================
  window.DataScraperMessageHandler = {
    /**
     * Handle scrape request
     * @param {Object} request - Request object
     * @param {Function} sendResponse - Response callback
     * @returns {boolean} Keep channel open for async response
     */
    handleScrape: (request, sendResponse) => {
      const { type, options } = request;
      const log = window.DataScraperLog;
      
      // Import Scraper from content.js (will be available after content.js loads)
      const Scraper = window.DataScraperInstance;
      
      if (!Scraper) {
        log('Scraper not initialized', '❌');
        sendResponse({ success: false, error: 'Scraper not initialized' });
        return false;
      }

      try {
        switch (type) {
          case 'selector': {
            const data = Scraper.scrapeBySelector(options.selector, options);
            sendResponse({ 
              success: true, 
              data, 
              url: window.location.href, 
              timestamp: new Date().toISOString() 
            });
            break;
          }
          
          case 'table': {
            const data = Scraper.scrapeTable(options.tableSelector);
            sendResponse({ 
              success: true, 
              data, 
              url: window.location.href, 
              timestamp: new Date().toISOString() 
            });
            break;
          }
          
          case 'links': {
            const data = Scraper.scrapeLinks(options.containerSelector);
            sendResponse({ 
              success: true, 
              data, 
              url: window.location.href, 
              timestamp: new Date().toISOString() 
            });
            break;
          }
          
          case 'images': {
            const data = Scraper.scrapeImages(options.containerSelector);
            sendResponse({ 
              success: true, 
              data, 
              url: window.location.href, 
              timestamp: new Date().toISOString() 
            });
            break;
          }
          
          case 'products': {
            const data = Scraper.scrapeProducts();
            sendResponse({ 
              success: true, 
              data, 
              url: window.location.href, 
              timestamp: new Date().toISOString() 
            });
            break;
          }
          
          case 'productsWithPagination':
            Scraper.scrapeProductsWithPagination(options).then(data => {
              sendResponse({ 
                success: true, 
                data, 
                maxProducts: options.maxProducts || null,
                url: window.location.href, 
                timestamp: new Date().toISOString() 
              });
            }).catch(error => {
              sendResponse({ success: false, error: error.message });
            });
            return true; // Keep channel open
            
          case 'productsWithScroll':
            Scraper.scrapeProductsWithScroll(options).then(data => {
              sendResponse({ 
                success: true, 
                data, 
                maxProducts: options.maxProducts || null,
                url: window.location.href, 
                timestamp: new Date().toISOString() 
              });
            }).catch(error => {
              sendResponse({ success: false, error: error.message });
            });
            return true; // Keep channel open
            
          case 'productDetail':
            const forceAPI = options?.forceAPI || false;
            Scraper.scrapeProductDetail(forceAPI).then(data => {
              if (data && (data.sku || data.name)) {
                const resultData = Array.isArray(data) ? data : [data];
                sendResponse({ 
                  success: true, 
                  data: resultData, 
                  url: window.location.href, 
                  timestamp: new Date().toISOString() 
                });
              } else {
                log(`Không có dữ liệu từ scrapeProductDetail`, '⚠️');
                sendResponse({ 
                  success: false, 
                  error: 'Không tìm thấy dữ liệu sản phẩm', 
                  data: [] 
                });
              }
            }).catch(error => {
              log(`Lỗi khi scrape product detail: ${error.message}`, '❌');
              sendResponse({ 
                success: false, 
                error: error.message, 
                data: [] 
              });
            });
            return true; // Keep channel open
            
          case 'productDetailsFromList':
            Scraper.scrapeProductDetailsFromList(options.productLinks || [], options).then(data => {
              sendResponse({ 
                success: true, 
                data, 
                url: window.location.href, 
                timestamp: new Date().toISOString() 
              });
            }).catch(error => {
              sendResponse({ success: false, error: error.message });
            });
            return true; // Keep channel open
            
          case 'productsFromAPI':
            Scraper.scrapeFromAPI(options).then(data => {
              sendResponse({ 
                success: true, 
                data, 
                url: window.location.href, 
                timestamp: new Date().toISOString() 
              });
            }).catch(error => {
              sendResponse({ success: false, error: error.message });
            });
            return true; // Keep channel open
            
          case 'callAPI':
          case 'scrapeLongChauAPI':
            const API = window.DataScraperAPI;
            if (!API || !API.scrapeLongChau) {
              sendResponse({ success: false, error: 'API scraper not available' });
              return false;
            }
            
            API.scrapeLongChau(options).then(data => {
              sendResponse({ 
                success: true, 
                data, 
                url: window.location.href, 
                timestamp: new Date().toISOString() 
              });
            }).catch(error => {
              sendResponse({ success: false, error: error.message });
            });
            return true; // Keep channel open
            
          case 'custom': {
            const data = Scraper.scrapeCustom(options);
            sendResponse({ 
              success: true, 
              data, 
              url: window.location.href, 
              timestamp: new Date().toISOString() 
            });
            break;
          }
          
          default:
            log(`Unknown scrape type: ${type}`, '⚠️');
            sendResponse({ success: false, error: `Unknown scrape type: ${type}` });
        }
      } catch (error) {
        log(`Error in scrape: ${error.message}`, '❌');
        sendResponse({ success: false, error: error.message });
      }

      return true; // Keep channel open for async responses
    },

    /**
     * Handle get page info request
     * @param {Function} sendResponse - Response callback
     */
    handleGetPageInfo: (sendResponse) => {
      const DOMUtils = window.DataScraperDOMUtils;
      
      sendResponse({
        url: window.location.href,
        title: document.title,
        description: DOMUtils.safeQuery('meta[name="description"]')?.content || '',
        ready: document.readyState === 'complete'
      });
    },

    /**
     * Handle test selector request
     * @param {Object} request - Request object
     * @param {Function} sendResponse - Response callback
     */
    handleTestSelector: (request, sendResponse) => {
      const { selector } = request;
      const SelectorUtils = window.DataScraperSelectorUtils;
      
      try {
        const result = SelectorUtils.testSelector(selector);
        sendResponse(result);
      } catch (error) {
        sendResponse({
          success: false,
          error: error.message
        });
      }
      
      return true;
    },

    /**
     * Handle auto-detect selector request
     * @param {Function} sendResponse - Response callback
     */
    handleAutoDetectSelector: (sendResponse) => {
      const SelectorUtils = window.DataScraperSelectorUtils;
      
      try {
        const result = SelectorUtils.autoDetectProductSelector();
        sendResponse({
          success: true,
          selector: result.selector,
          count: result.count
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error.message
        });
      }
      
      return true;
    },

    /**
     * Handle highlight request
     * @param {Object} request - Request object
     * @param {Function} sendResponse - Response callback
     */
    handleHighlight: (request, sendResponse) => {
      const HighlightManager = window.DataScraperHighlightManager;
      const count = HighlightManager.highlightBySelector(request.selector);
      sendResponse({ success: true, count });
      return false;
    },

    /**
     * Handle clear highlight request
     * @param {Function} sendResponse - Response callback
     */
    handleClearHighlight: (sendResponse) => {
      const HighlightManager = window.DataScraperHighlightManager;
      HighlightManager.clear();
      sendResponse({ success: true });
      return false;
    }
  };
})();

