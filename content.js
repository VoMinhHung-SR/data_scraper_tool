(() => {
  'use strict';

  // Use modules from config.js and utils.js
  const Utils = window.DataScraperUtils;
  const log = window.DataScraperLog;
  const API = window.DataScraperAPI;

  // Import new modules
  const BaseScraper = window.DataScraperBaseScraper;
  const ProductScraper = window.DataScraperProductScraper;
  const PaginationHandler = window.DataScraperPaginationHandler;

  if (!Utils || !log) {
    return;
  }

  // ============================================
  // 🔧 HELPER FUNCTIONS (Product Detail Extraction)
  // ============================================
  
  /**
   * Extract price information from container
   */
  const extractPriceInfo = (container, Utils) => {
    let currentPrice = '';
    let currentPriceValue = 0;
    let originalPrice = '';
    let originalPriceValue = 0;
    let discount = 0;
    let discountPercent = 0;
    
    // Tìm current price (giá hiện tại - giá discount)
    const priceEl = Utils.safeQuery('[data-test="price"]', container) ||
                   Utils.safeQuery('span[class*="font-semibold"], span[class*="font-bold"], span[class*="text-heading"], span[class*="text-title"]', container);
    
    if (priceEl) {
      const priceText = Utils.getText(priceEl).trim();
      // Chỉ lấy nếu có pattern giá (số + đ/₫), không phải text như "tư vấn"
      const isConsultProduct = priceText && (
        priceText.toLowerCase().includes('tư vấn') ||
        priceText.toLowerCase().includes('consult') ||
        priceText.toLowerCase().includes('liên hệ') ||
        priceText.toLowerCase().includes('cần tư vấn')
      );
      
      if (!isConsultProduct) {
        const priceMatch = priceText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*([₫đ])/);
        if (priceMatch) {
          currentPrice = priceText;
          const numStr = priceMatch[1].replace(/[.,]/g, '');
          currentPriceValue = parseInt(numStr, 10) || 0;
        }
      }
    }
    
    // Tìm original price (giá gốc - có line-through)
    const originalPriceEl = Utils.safeQuery('p[class*="line-through"], span[class*="line-through"], div[class*="line-through"]', container) ||
                           Utils.safeQuery('p.text-gray-7, span.text-gray-7', container);
    
    if (originalPriceEl) {
      const originalPriceText = Utils.getText(originalPriceEl).trim();
      const originalPriceMatch = originalPriceText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*([₫đ])/);
      if (originalPriceMatch) {
        originalPrice = originalPriceText;
        const numStr = originalPriceMatch[1].replace(/[.,]/g, '');
        originalPriceValue = parseInt(numStr, 10) || 0;
        
        // Tính discount nếu có cả currentPrice và originalPrice
        if (currentPriceValue > 0 && originalPriceValue > 0 && originalPriceValue > currentPriceValue) {
          discount = originalPriceValue - currentPriceValue;
          discountPercent = Math.round((discount / originalPriceValue) * 100);
        }
      }
    }
    
    // Nếu không tìm thấy original price từ line-through, thử tìm trong cùng container với price
    if (!originalPrice && priceEl) {
      const priceParent = priceEl.parentElement;
      if (priceParent) {
        const siblings = Array.from(priceParent.children);
        for (const sibling of siblings) {
          if (sibling !== priceEl && (sibling.classList.contains('line-through') || 
              sibling.classList.contains('text-gray-7'))) {
            const siblingText = Utils.getText(sibling).trim();
            const siblingMatch = siblingText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*([₫đ])/);
            if (siblingMatch) {
              originalPrice = siblingText;
              const numStr = siblingMatch[1].replace(/[.,]/g, '');
              originalPriceValue = parseInt(numStr, 10) || 0;
              
              if (currentPriceValue > 0 && originalPriceValue > 0 && originalPriceValue > currentPriceValue) {
                discount = originalPriceValue - currentPriceValue;
                discountPercent = Math.round((discount / originalPriceValue) * 100);
              }
              break;
            }
          }
        }
      }
    }
    
    return {
      currentPrice,
      currentPriceValue,
      originalPrice,
      originalPriceValue,
      discount,
      discountPercent
    };
  };

  /**
   * Normalize unit code
   */
  const normalizeUnitCode = (unitName) => {
    return unitName.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/^(hop|hoop)$/i, 'hop')
      .replace(/^(vi|vỉ)$/i, 'vi')
      .replace(/^(vien|viên)$/i, 'vien')
      .replace(/^(goi|gói)$/i, 'goi')
      .replace(/^(chai)$/i, 'chai')
      .replace(/^(tuyp|tuýp)$/i, 'tuyp')
      .replace(/^(ong|ống)$/i, 'ong')
      || 'default';
  };

  /**
   * Extract value from row with specific label
   */
  const extractSpecValue = (labelPattern, container, Utils) => {
    const specRows = Utils.safeQueryAll('div[class*="flex"], tr, div[class*="detail-item"]', container);
    
    for (const row of specRows) {
      const rowText = Utils.getText(row).trim();
      // Kiểm tra nếu row chứa label
      if (labelPattern.test(rowText)) {
        // Strategy 1: Tìm label element (p với class text-gray-7) trước
        const labelEl = Utils.safeQuery('p[class*="text-gray-7"], p[class*="text-body"], div[class*="text-gray-7"]', row);
        
        if (labelEl && labelPattern.test(Utils.getText(labelEl).trim())) {
          // Tìm element [data-theme-element="article"] trong cùng row, nhưng không phải là label
          const allArticleEls = Utils.safeQueryAll('[data-theme-element="article"]', row);
          for (const articleEl of allArticleEls) {
            const articleText = Utils.getText(articleEl).trim();
            // Đảm bảo không phải là label và có nội dung
            if (articleText && !labelPattern.test(articleText) && articleText !== Utils.getText(labelEl).trim()) {
              // Loại bỏ các text không cần thiết như "Sao chép"
              const cleanedText = articleText.replace(/\s*Sao\s+chép.*/i, '').trim();
              if (cleanedText) {
                return cleanedText;
              }
            }
          }
          
          // Strategy 2: Tìm div có class text-gray-10 và text-body trong cùng row với label
          const valueDivs = Utils.safeQueryAll('div', row);
          for (const div of valueDivs) {
            const divClass = div.className || '';
            const divText = Utils.getText(div).trim();
            
            // Kiểm tra nếu div có class text-gray-10 và text-body và không phải là label
            if ((divClass.includes('text-gray-10') && (divClass.includes('text-body') || divClass.includes('text-body1') || divClass.includes('text-body2'))) &&
                divText && !labelPattern.test(divText) && divText !== Utils.getText(labelEl).trim()) {
              // Loại bỏ các text không cần thiết
              const cleanedText = divText.replace(/\s*Sao\s+chép.*/i, '').trim();
              if (cleanedText) {
                return cleanedText;
              }
            }
          }
        } else {
          // Strategy 3: Nếu không tìm thấy label element, tìm trực tiếp [data-theme-element="article"] trong row
          const allArticleEls = Utils.safeQueryAll('[data-theme-element="article"]', row);
          for (const articleEl of allArticleEls) {
            const articleText = Utils.getText(articleEl).trim();
            if (articleText && !labelPattern.test(articleText)) {
              const cleanedText = articleText.replace(/\s*Sao\s+chép.*/i, '').trim();
              if (cleanedText) {
                return cleanedText;
              }
            }
          }
        }
        
        // Strategy 4: Nếu vẫn chưa tìm thấy, lấy text sau label trong cùng row
        const parts = rowText.split(labelPattern);
        if (parts.length > 1) {
          const valuePart = parts[1].trim().split(/\n/)[0].trim();
          if (valuePart && !labelPattern.test(valuePart)) {
            const cleanedText = valuePart.replace(/\s*Sao\s+chép.*/i, '').trim();
            if (cleanedText) {
              return cleanedText;
            }
          }
        }
      }
    }
    
    return '';
  };

  /**
   * Find section by class name or heading text
   */
  const findSectionByClassOrHeading = (className, headingPattern, defaultId, Utils) => {
    // Ưu tiên 1: Tìm theo class name
    const sectionByClass = Utils.safeQuery(`.${className}, [class*="${className}"]`);
    if (sectionByClass) {
      // Đảm bảo class name đúng (không phải class khác chứa className)
      const sectionClass = sectionByClass.className || '';
      if (sectionClass.includes(className) || sectionClass === className) {
        return sectionByClass.id || null;
      }
    }
    
    // Ưu tiên 2: Tìm theo heading text
    const allSections = Utils.safeQueryAll('[id^="detail-content-"]');
    for (const sec of allSections) {
      const heading = Utils.safeQuery('h2, h3, h4', sec);
      if (heading) {
        const headingText = Utils.getText(heading);
        if (headingPattern && headingPattern.test(headingText)) {
          return sec.id;
        }
      }
    }
    
    // KHÔNG dùng defaultId - return null nếu không tìm thấy
    return null;
  };

  /**
   * Extract basic info (name, sku, brand, slug)
   */
  const extractBasicInfo = (container, Utils) => {
    const fullText = Utils.getText(container);
    
    // Extract name
    let name = '';
    const nameSelectors = [
      'h1',
      '[data-test-id="product-name"]',
      '[class*="product-name"]',
      '[class*="product-title"]',
      'div:first-child',
    ];
    for (const sel of nameSelectors) {
      const nameEl = Utils.safeQuery(sel, container);
      if (nameEl) {
        const nameText = Utils.getText(nameEl).trim();
        if (nameText && nameText.length > 10 && !nameText.match(/^\d+$/) && !nameText.includes('đánh giá')) {
          name = nameText.split('\n')[0].trim();
          break;
        }
      }
    }
    // Fallback: tìm div có text dài nhất không chứa button/price
    if (!name) {
      const allDivs = Utils.safeQueryAll('div', container);
      for (const div of allDivs) {
        const divText = Utils.getText(div).trim();
        if (divText.length > 20 && divText.length < 200 && 
            !divText.includes('Chọn') && !divText.includes('đánh giá') &&
            !divText.match(/^\d+[.,]?\d*\s*[₫đ]/)) {
          name = divText.split('\n')[0].trim();
          break;
        }
      }
    }
    
    // Extract SKU
    let sku = '';
    const skuEl = Utils.safeQuery('[data-test-id="sku"]', container);
    if (skuEl) {
      sku = Utils.getText(skuEl).trim();
    } else {
      const skuMatch = fullText.match(/\b\d{6,8}\b/);
      if (skuMatch) {
        sku = skuMatch[0];
      } else {
        sku = Utils.getText(Utils.safeQuery('[class*="sku"], [class*="code"]', container));
      }
    }
    
    // Extract brand
    let brand = '';
    const brandEl = Utils.safeQuery('div.font-medium', container);
    if (brandEl) {
      const brandText = Utils.getText(brandEl);
      const brandMatch = brandText.match(/Thương\s+hiệu[:\s]+([^\n\r]+)/i);
      if (brandMatch) {
        brand = brandMatch[1].trim();
      } else {
        brand = brandText.replace(/Thương\s+hiệu[:\s]*/gi, '').trim();
      }
    } else {
      const brandMatch = fullText.match(/Thương\s+hiệu[:\s]+([^\n\r]+)/i);
      if (brandMatch) {
        brand = brandMatch[1].trim().split(/\s+/)[0];
      }
    }
    
    // Extract slug from URL
    const url = window.location.href || '';
    const urlMatch = url.match(/\/([^\/]+)\.html$/);
    const slug = urlMatch ? urlMatch[1] : '';
    
    return { name, sku, brand, slug };
  };

  // ============================================
  // 📊 DATA SCRAPER (Composed from modules)
  // ============================================
  const Scraper = {
    // Base scraping (from core/base-scraper.js)
    scrapeBySelector: BaseScraper?.scrapeBySelector || function() { return []; },
    scrapeTable: BaseScraper?.scrapeTable || function() { return []; },
    scrapeLinks: BaseScraper?.scrapeLinks || function() { return []; },
    scrapeImages: BaseScraper?.scrapeImages || function() { return []; },
    scrapeCustom: BaseScraper?.scrapeCustom || function() { return []; },

    // Product scraping (from core/product-scraper.js)
    scrapeProducts: ProductScraper?.scrapeProducts || function() { return []; },
    
    // Pagination & Scroll (from core/pagination-handler.js)
    scrapeProductsWithPagination: PaginationHandler?.scrapeWithPagination || function() { return Promise.resolve([]); },
    scrapeProductsWithScroll: PaginationHandler?.scrapeWithScroll || function() { return Promise.resolve([]); },

    // Detail scraping (keep in content.js for now, will optimize later)
    // Scrape chi tiết sản phẩm từ trang detail (chỉ dùng DOM)
    scrapeProductDetail: async (forceAPI = false) => {
      // Delegate to detail-scraper module
      return await window.DataScraperDetailScraper.scrapeProductDetail(forceAPI);
    },

    extractDetailSection: (sectionId, className = null) => {
      // Delegate to detail-scraper module
      return window.DataScraperDetailScraper.extractDetailSection(sectionId, className);
    },

    // Scrape chi tiết từ DOM (fallback)
    scrapeProductDetailFromDOM: async () => {
      // Delegate to detail-scraper module
      return await window.DataScraperDetailScraper.scrapeProductDetailFromDOM();
    },

    // Scrape detail cho nhiều products từ list URLs (dùng storage state)
    scrapeProductDetailsFromList: async (productLinks, options = {}) => {
      // Delegate to list-scraper module
      return await window.DataScraperListScraper.scrapeProductDetailsFromList(productLinks, options);
    },

    // Scrape từ API
    scrapeFromAPI: async (options = {}) => {
      // Delegate to api-scraper module
      return await window.DataScraperAPI.scrapeFromAPI(options);
    },

    // Tìm API data trong window (fallback)
    findAPIInWindow: (resolve, maxProducts) => {
      // Delegate to api-scraper module
      return window.DataScraperAPI.findAPIInWindow(resolve, maxProducts);
    },

    // Scrape custom
    scrapeCustom: (config) => {
      try {
        const { selectors, type = 'object' } = config;
        const results = [];

        if (type === 'list') {
          const container = Utils.safeQuery(selectors.container);
          if (!container) return [];

          const items = Utils.safeQueryAll(selectors.item, container);
          items.forEach(item => {
            const data = {};
            Object.keys(selectors.fields).forEach(key => {
              const fieldSelector = selectors.fields[key];
              const element = Utils.safeQuery(fieldSelector, item);
              data[key] = element?.textContent?.trim() || element?.getAttribute('href') || '';
            });
            results.push(data);
          });
        } else {
          const data = {};
          Object.keys(selectors).forEach(key => {
            const element = Utils.safeQuery(selectors[key]);
            data[key] = element?.textContent?.trim() || element?.getAttribute('href') || element?.src || '';
          });
          results.push(data);
        }

        return results;
      } catch (error) {
        return [];
      }
    }
  };

  // ============================================
  // 📡 EXPORT SCRAPER INSTANCE
  // ============================================
  // Export Scraper to window so MessageHandler can access it
  window.DataScraperInstance = Scraper;
  
  // ============================================
  // 🧪 TEST HELPER FUNCTION
  // ============================================
  // Helper function để test scrape và download kết quả
  window.testScrapeDetail = async () => {
    try {
      console.log('🧪 Bắt đầu test scrape product detail...');
      
      // Chờ một chút để đảm bảo DOM đã load
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!Scraper) {
        console.error('❌ Scraper không tồn tại!');
        return null;
      }
      
      const productDetail = await window.DataScraperDetailScraper.scrapeProductDetail(false);
      
      if (!productDetail) {
        console.error('❌ Không thể scrape product detail!');
        return null;
      }
      
      console.log('✅ Scrape thành công!');
      console.log('📊 Kết quả:', productDetail);
      
      // Format kết quả
      const formatResult = (data) => {
        let result = '='.repeat(80) + '\n';
        result += 'PRODUCT DETAIL SCRAPE RESULT\n';
        result += '='.repeat(80) + '\n';
        result += `Timestamp: ${new Date().toISOString()}\n`;
        result += `URL: ${window.location.href}\n`;
        result += '\n';
        
        if (data.basicInfo) {
          // Grouped structure
          result += '--- BASIC INFO ---\n';
          result += `Name: ${data.basicInfo?.name || 'N/A'}\n`;
          result += `SKU: ${data.basicInfo?.sku || 'N/A'}\n`;
          result += `Brand: ${data.basicInfo?.brand || 'N/A'}\n`;
          result += `Slug: ${data.basicInfo?.slug || 'N/A'}\n`;
          result += '\n';
          
          result += '--- PRICING ---\n';
          result += `Price: ${data.pricing?.price || 'N/A'}\n`;
          result += `Price Display: ${data.pricing?.priceDisplay || 'N/A'}\n`;
          result += `Price Value: ${data.pricing?.priceValue || 0}\n`;
          result += `Package Size: ${data.pricing?.packageSize || 'N/A'}\n`;
          result += '\n';
          
          if (data.pricing?.packageOptions && data.pricing.packageOptions.length > 0) {
            result += '--- PACKAGE OPTIONS (VARIANTS) ---\n';
            data.pricing.packageOptions.forEach((option, index) => {
              result += `\nOption ${index + 1}:\n`;
              result += `  Unit: ${option.unit || 'N/A'}\n`;
              result += `  Unit Display: ${option.unitDisplay || 'N/A'}\n`;
              result += `  Price: ${option.price || 'N/A'}\n`;
              result += `  Price Display: ${option.priceDisplay || 'N/A'}\n`;
              result += `  Price Value: ${option.priceValue || 0}\n`;
              result += `  Specification: ${option.specification || 'N/A'}\n`;
              result += `  Is Default: ${option.isDefault ? 'Yes' : 'No'}\n`;
              result += `  Is Available: ${option.isAvailable ? 'Yes' : 'No'}\n`;
            });
            result += '\n';
          }
        } else {
          // Flat structure
          result += '--- PRODUCT INFO ---\n';
          result += `Name: ${data.name || 'N/A'}\n`;
          result += `SKU: ${data.sku || 'N/A'}\n`;
          result += `Brand: ${data.brand || 'N/A'}\n`;
          result += `Price: ${data.price || 'N/A'}\n`;
          result += `Package Size: ${data.packageSize || 'N/A'}\n`;
          result += '\n';
          
          if (data.packageOptions && data.packageOptions.length > 0) {
            result += '--- PACKAGE OPTIONS (VARIANTS) ---\n';
            data.packageOptions.forEach((option, index) => {
              result += `\nOption ${index + 1}:\n`;
              result += `  Unit: ${option.unit || 'N/A'}\n`;
              result += `  Unit Display: ${option.unitDisplay || 'N/A'}\n`;
              result += `  Price: ${option.price || 'N/A'}\n`;
              result += `  Price Display: ${option.priceDisplay || 'N/A'}\n`;
              result += `  Price Value: ${option.priceValue || 0}\n`;
              result += `  Specification: ${option.specification || 'N/A'}\n`;
              result += `  Is Default: ${option.isDefault ? 'Yes' : 'No'}\n`;
              result += `  Is Available: ${option.isAvailable ? 'Yes' : 'No'}\n`;
            });
            result += '\n';
          }
        }
        
        result += '='.repeat(80) + '\n';
        result += 'JSON FORMAT:\n';
        result += '='.repeat(80) + '\n';
        result += JSON.stringify(data, null, 2);
        result += '\n';
        
        return result;
      };
      
      const formattedResult = formatResult(productDetail);
      
      // Download file
      const blob = new Blob([formattedResult], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'data.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('✅ Đã ghi kết quả vào file data.txt!');
      console.log('📥 File đã được tự động download');
      console.log('\n' + '='.repeat(80));
      console.log('KẾT QUẢ SCRAPE:');
      console.log('='.repeat(80));
      console.log(formattedResult);
      
      return productDetail;
    } catch (error) {
      console.error('❌ Lỗi khi test scrape:', error);
      console.error('Stack trace:', error.stack);
      return null;
    }
  };

  // ============================================
  // 📡 USE HANDLERS FROM handlers/ folder
  // ============================================
  const MessageHandler = window.DataScraperMessageHandler;
  const HighlightManager = window.DataScraperHighlightManager;

  // ============================================
  // 📡 MAIN MESSAGE LISTENER
  // ============================================
  // Helper function to continue workflow from storage (background scraping)
  // Optimized: This function is no longer needed since we don't save list to storage
  // Workflow now slices and scrapes details directly without storing the full list
  const continueWorkflowFromStorage = (requestId) => {
    console.log('[Content] continueWorkflowFromStorage is deprecated - workflow now handles slicing directly without storage');
    // Clean up workflow state since we can't continue without the list
    chrome.storage.local.remove([
      `workflow_state_${requestId}`,
      `workflow_list_result_${requestId}`
    ]);
  };

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrape') {
      return MessageHandler.handleScrape(request, sendResponse);
    }

    if (request.action === 'continueWorkflow') {
      // Continue workflow from storage (background scraping)
      continueWorkflowFromStorage(request.requestId);
      sendResponse({ success: true });
      return false;
    }

    if (request.action === 'getPageInfo') {
      MessageHandler.handleGetPageInfo(sendResponse);
      return false;
    }

    if (request.action === 'testSelector') {
      return MessageHandler.handleTestSelector(request, sendResponse);
    }

    if (request.action === 'autoDetectSelector') {
      return MessageHandler.handleAutoDetectSelector(sendResponse);
    }

    if (request.action === 'highlight') {
      const count = HighlightManager.highlightBySelector(request.selector);
      sendResponse({ success: true, count });
      return false;
    }

    if (request.action === 'clearHighlight') {
      HighlightManager.clear();
      sendResponse({ success: true });
      return false;
    }
  });

  // ============================================
  // 🔄 INTERCEPT API CALLS FOR PRODUCT DETAIL
  // ============================================
  // Intercept API calls khi vào trang detail để lưu data
  // Flexible: accept any .html page
  if (window.location.href.includes('.html')) {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0];
      
      if (typeof url === 'string' && (
        url.includes('/api/') && (url.includes('product') || url.includes('sku'))
      )) {
        
        return originalFetch.apply(this, args)
          .then(response => {
            const clonedResponse = response.clone();
            clonedResponse.json().then(data => {
              // Lưu vào storage để dùng sau
              if (data && (data.data || data.sku)) {
                chrome.storage.local.set({ 
                  lastProductDetailAPI: {
                    url: url,
                    data: data,
                    timestamp: Date.now()
                  }
                });
              }
            }).catch(() => {});
            return response;
          });
      }
      
      return originalFetch.apply(this, args);
    };
  }

  // 🔄 AUTO SCRAPE DETAIL FROM STORAGE STATE
  // ============================================
  chrome.storage.local.get(['scrapeDetailsState'], (result) => {
    if (result.scrapeDetailsState) {
      const state = result.scrapeDetailsState;
      
      // Validate state structure to prevent crashes
      if (!state || typeof state !== 'object') {
        console.error('[Content] Invalid scrapeDetailsState: not an object');
        chrome.storage.local.remove(['scrapeDetailsState']);
        return;
      }
      
      // Validate required fields
      if (!Array.isArray(state.links) || state.links.length === 0) {
        console.error('[Content] Invalid scrapeDetailsState: links is not an array or empty');
        chrome.storage.local.remove(['scrapeDetailsState']);
        return;
      }
      
      // Initialize missing fields
      if (typeof state.currentIndex !== 'number' || state.currentIndex < 0) {
        state.currentIndex = 0;
      }
      if (!Array.isArray(state.details)) {
        state.details = [];
      }
      if (!Array.isArray(state.failedLinks)) {
        state.failedLinks = [];
      }
      if (typeof state.attempts !== 'object' || state.attempts === null) {
        state.attempts = {};
      }
      
      // Validate currentIndex is within bounds
      if (state.currentIndex >= state.links.length) {
        console.error('[Content] Invalid scrapeDetailsState: currentIndex out of bounds');
        chrome.storage.local.remove(['scrapeDetailsState']);
        return;
      }
      
      const currentUrl = window.location.href;
      
      // Check if current page is a product detail page (flexible URL check)
      // Accept any .html page
      const isProductPage = currentUrl.includes('.html');
      
      if (isProductPage) {
        
        // Update progress indicator
        const total = state.links.length;
        const skip = state.skip || 0; // Get skip value (default 0 for backward compatibility)
        const current = state.currentIndex + 1; // Current position in sliced array (1-based)
        const actualItemNumber = skip + current; // Calculate actual item number (1-based) in original list
        const percent = Math.round((current / total) * 100);
        if (window.DataScraperProgressIndicator) {
          window.DataScraperProgressIndicator.update(percent);
        }
        
        // Log actual item number for debugging (shows real position in original list)
        console.log(`[Content] Scraping item ${actualItemNumber}/${skip + total} (currentIndex: ${state.currentIndex}, skip: ${skip})`);
        
        // Wait for page ready
        const scrapeAndContinue = async () => {
          // Validate currentIndex before accessing
          if (state.currentIndex < 0 || state.currentIndex >= state.links.length) {
            console.error('[Content] currentIndex out of bounds:', state.currentIndex, 'links length:', state.links.length);
            chrome.storage.local.remove(['scrapeDetailsState']);
            return;
          }
          
          const link = state.links[state.currentIndex];
          
          // Validate link exists and is valid
          if (!link) {
            console.error('[Content] Invalid link at index:', state.currentIndex);
            state.currentIndex++;
            if (state.currentIndex >= state.links.length) {
              chrome.storage.local.remove(['scrapeDetailsState']);
            } else {
              chrome.storage.local.set({ scrapeDetailsState: state }, () => {
                const nextLink = typeof state.links[state.currentIndex] === 'string' 
                  ? state.links[state.currentIndex] 
                  : state.links[state.currentIndex]?.link || state.links[state.currentIndex]?.url;
                if (nextLink) {
                  window.location.href = nextLink;
                } else {
                  chrome.storage.local.remove(['scrapeDetailsState']);
                }
              });
            }
            return;
          }

          const markFailure = (reason) => {
            // Validate link exists before using as key
            if (!link) {
              console.error('[Content] Cannot mark failure: link is invalid');
              state.currentIndex++;
              return false;
            }
            
            const attempts = (state.attempts[link] || 0) + 1;
            state.attempts[link] = attempts;

            if (attempts >= 3) {
              // Ensure failedLinks array exists
              if (!Array.isArray(state.failedLinks)) {
                state.failedLinks = [];
              }
              state.failedLinks.push({
                link,
                reason: reason || 'unknown',
                attempts
              });
              state.currentIndex++;
            }

            // Retry if attempts < 3
            if (attempts < 3) {
              // Validate link before navigation
              if (!link || typeof link !== 'string' || link.trim() === '') {
                console.error('[Content] Cannot retry: invalid link');
                state.currentIndex++;
                return false;
              }
              
              chrome.storage.local.set({ scrapeDetailsState: state }, () => {
                if (chrome.runtime.lastError) {
                  console.error('[Content] Error saving state for retry:', chrome.runtime.lastError);
                  return;
                }
                try {
                  window.location.href = link;
                } catch (e) {
                  console.error('[Content] Error navigating to link:', e);
                  state.currentIndex++;
                  chrome.storage.local.set({ scrapeDetailsState: state });
                }
              });
              return true; // indicate retry
            }

            return false; // no retry, move on
          };

          // Track if price is CONSULT (needs delay before navigation)
          let isConsultPrice = false;

          try {
            // Check if forceAPI is set in state
            const forceAPI = state.forceAPI || false;
            
            // Validate DetailScraper exists
            if (!window.DataScraperDetailScraper || typeof window.DataScraperDetailScraper.scrapeProductDetail !== 'function') {
              console.error('[Content] DataScraperDetailScraper not available');
              const retried = markFailure('scraper_not_available');
              if (retried) return;
              state.currentIndex++;
              return;
            }
            
            const detail = await window.DataScraperDetailScraper.scrapeProductDetail(forceAPI);
            
            if (detail) {
              // Check if price is CONSULT (supports both flat and grouped structure)
              const priceDisplay = detail.priceDisplay || detail.price || 
                                   (detail.pricing && detail.pricing.priceDisplay) || 
                                   (detail.pricing && detail.pricing.price) || '';
              isConsultPrice = priceDisplay && priceDisplay.toString().toUpperCase().includes('CONSULT');
              
              // Ensure details array exists
              if (!Array.isArray(state.details)) {
                state.details = [];
              }
              state.details.push(detail);
              
              // Update progress after scrape
              // Use total links, not effectiveLimit, to show accurate progress
              // Validate state.links exists and is not empty to avoid division by zero
              if (state.links && state.links.length > 0) {
                const newPercent = Math.round((state.details.length / state.links.length) * 100);
                if (window.DataScraperProgressIndicator) {
                  window.DataScraperProgressIndicator.update(newPercent);
                }
              }
              
              // NEW WORKFLOW: No auto-export during scraping
              // Export will be triggered when user clicks popup again (with badge)
            } else {
              // detail null/invalid
              const retried = markFailure('empty_detail');
              if (retried) return;
            }
          } catch (error) {
            console.error('[Content] Error scraping detail:', error);
            const retried = markFailure(error?.message || 'error');
            if (retried) return;
          }
          
          // Validate before incrementing
          if (typeof state.currentIndex === 'number') {
            state.currentIndex++;
          } else {
            console.error('[Content] Invalid currentIndex, resetting to 0');
            state.currentIndex = 0;
          }
          
          // Check if we've reached maxDetails limit or end of links
          // Use Math.min to ensure we don't exceed available links
          const effectiveLimit = Math.min(
            state.maxDetails || state.links.length,
            state.links.length
          );
          
          // Check completion: 
          // Ưu tiên xử lý hết tất cả links trước, không dừng sớm vì limit
          // Vì có thể có items bị skip do lỗi, nên cần thử scrape tất cả links
          const hasProcessedAllLinks = state.currentIndex >= state.links.length;
          
          // Chỉ check limit nếu đã xử lý hết links HOẶC đã scrape đủ limit
          // Nhưng ưu tiên xử lý hết links để không miss items
          if (hasProcessedAllLinks) {
            chrome.storage.local.remove(['scrapeDetailsState']);
            
            // Show completion indicator
            if (window.DataScraperProgressIndicator) {
              window.DataScraperProgressIndicator.complete();
            }
            
            // Save to storage first (fallback if popup is closed)
            chrome.storage.local.set({
              'scraper_detail_data': {
                data: state.details,
                failedLinks: state.failedLinks || [],
                timestamp: Date.now(),
                count: state.details.length,
                type: 'detail',
                maxProducts: state.maxDetails || state.details.length
              }
            }, () => {
            });
            
            // Check auto-export: if enabled and > 100 items, auto-export without asking
            chrome.storage.local.get(['autoExportEnabled'], (exportResult) => {
              const autoExportEnabled = exportResult.autoExportEnabled !== false; // Default true
              const itemCount = state.details.length;
              
              if (autoExportEnabled && itemCount > 100) {
                // Auto-export: split into batches of 100 and export each batch
                const ITEMS_PER_BATCH = 100;
                const totalBatches = Math.ceil(itemCount / ITEMS_PER_BATCH);
                
                console.log(`[Content] Auto-export triggered: ${itemCount} items, ${totalBatches} batches`);
                
                // Export each batch
                for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
                  const startIndex = batchNum * ITEMS_PER_BATCH;
                  const endIndex = Math.min(startIndex + ITEMS_PER_BATCH, itemCount);
                  const batchData = state.details.slice(startIndex, endIndex);
                  
                  // Use actual 1-based indices for filename
                  const actualStartIndex = startIndex + 1;
                  const actualEndIndex = endIndex;
                  
                  setTimeout(() => {
                    chrome.runtime.sendMessage({
                      action: 'autoExportBatch',
                      data: batchData,
                      startIndex: actualStartIndex,
                      endIndex: actualEndIndex,
                      batchNumber: batchNum + 1
                    }, (response) => {
                      if (chrome.runtime.lastError) {
                        console.error('[Content] Auto-export batch error:', chrome.runtime.lastError);
                      } else {
                        console.log(`[Content] Auto-export batch ${batchNum + 1}/${totalBatches} sent`);
                      }
                    });
                  }, batchNum * 1500); // Delay between batches: 1.5s
                }
                
                // Mark export as completed
                chrome.storage.local.set({ exportCompleted: true });
              }
            });
            
            // Show badge notification to notify user to click popup for download
            chrome.runtime.sendMessage({
              action: 'showScrapeCompleteBadge',
              itemCount: state.details.length,
              type: 'detail'
            }, () => {
              // Ignore errors
            });
            
            // Send result to popup with retry mechanism
            const sendResult = (retryCount = 0) => {
            chrome.runtime.sendMessage({
              action: 'detailsScrapingComplete',
              data: state.details,
              failedLinks: state.failedLinks || [],
                maxProducts: state.maxDetails || state.details.length,
              timestamp: new Date().toISOString()
              }, (response) => {
                if (chrome.runtime.lastError) {
                  if (chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
                    // Popup is closed, data is already saved to storage
                  } else if (retryCount < 3) {
                    setTimeout(() => sendResult(retryCount + 1), 1000);
                  } else {
                  }
                } else {
                }
              });
            };
            
            sendResult();
            return;
          }
          
          // Navigate to next product
          // Validate currentIndex is within bounds
          if (state.currentIndex < 0 || state.currentIndex >= state.links.length) {
            console.error('[Content] currentIndex out of bounds when navigating:', state.currentIndex, 'links length:', state.links.length);
            chrome.storage.local.remove(['scrapeDetailsState']);
            return;
          }
          
          const nextLinkItem = state.links[state.currentIndex];
          if (!nextLinkItem) {
            console.error('[Content] No link at index:', state.currentIndex);
            chrome.storage.local.remove(['scrapeDetailsState']);
            return;
          }
          
          const nextLink = typeof nextLinkItem === 'string' 
            ? nextLinkItem 
            : (nextLinkItem?.link || nextLinkItem?.url);
          
          if (nextLink && typeof nextLink === 'string' && nextLink.trim() !== '') {
            // Add delay 2s if price is CONSULT to avoid traffic overload
            if (isConsultPrice) {
              setTimeout(() => {
                chrome.storage.local.set({ scrapeDetailsState: state }, () => {
                  if (chrome.runtime.lastError) {
                    console.error('[Content] Error saving state before navigation:', chrome.runtime.lastError);
                    return;
                  }
                  try {
                    // Navigate to next product - page load sẽ được handle bởi window.onload listener
                    window.location.href = nextLink;
                  } catch (e) {
                    console.error('[Content] Error navigating to next link:', e);
                    chrome.storage.local.remove(['scrapeDetailsState']);
                  }
                });
              }, 2000); // 2 second delay when price is CONSULT to avoid traffic overload
            } else {
              // Normal navigation when price is not CONSULT - no delay needed
              chrome.storage.local.set({ scrapeDetailsState: state }, () => {
                if (chrome.runtime.lastError) {
                  console.error('[Content] Error saving state before navigation:', chrome.runtime.lastError);
                  return;
                }
                try {
                  // Navigate to next product - page load sẽ được handle bởi window.onload listener
                  window.location.href = nextLink;
                } catch (e) {
                  console.error('[Content] Error navigating to next link:', e);
                  chrome.storage.local.remove(['scrapeDetailsState']);
                }
              });
            }
          } else {
            chrome.storage.local.remove(['scrapeDetailsState']);
            
            // Save to storage first (fallback if popup is closed)
            chrome.storage.local.set({
              'scraper_detail_data': {
                data: state.details,
                failedLinks: state.failedLinks || [],
                timestamp: Date.now(),
                count: state.details.length,
                type: 'detail',
                maxProducts: state.maxDetails || state.details.length
              }
            });
            
            // Check auto-export: if enabled and > 100 items, auto-export without asking
            // IMPORTANT: Check if already triggered to avoid duplicate exports
            chrome.storage.local.get(['autoExportEnabled', 'autoExportTriggered'], (exportResult) => {
              const autoExportEnabled = exportResult.autoExportEnabled !== false; // Default true
              const alreadyTriggered = exportResult.autoExportTriggered === true;
              const itemCount = state.details.length;
              
              // Only trigger if enabled, > 100 items, and not already triggered
              if (autoExportEnabled && itemCount > 100 && !alreadyTriggered) {
                try {
                  // Mark as triggered immediately to prevent duplicate
                  chrome.storage.local.set({ autoExportTriggered: true }, () => {
                    // Auto-export: split into batches of 100 and export each batch
                    const ITEMS_PER_BATCH = 100;
                    const totalBatches = Math.ceil(itemCount / ITEMS_PER_BATCH);
                    
                    console.log(`[Content] Auto-export triggered: ${itemCount} items, ${totalBatches} batches`);
                    
                    // Store batch info in storage (don't send large data via message)
                    const batchInfo = {
                      totalBatches: totalBatches,
                      itemCount: itemCount,
                      currentBatch: 0,
                      startTime: Date.now()
                    };
                    
                    chrome.storage.local.set({ autoExportBatchInfo: batchInfo }, () => {
                      // Export first batch immediately, then continue with delays
                      const exportBatch = (batchNum) => {
                        if (batchNum >= totalBatches) {
                          // All batches done
                          chrome.storage.local.remove(['autoExportBatchInfo', 'currentExportBatch']);
                          chrome.storage.local.set({ exportCompleted: true });
                          console.log(`[Content] Auto-export completed: ${totalBatches} batches`);
                          return;
                        }
                        
                        try {
                          const startIndex = batchNum * ITEMS_PER_BATCH;
                          const endIndex = Math.min(startIndex + ITEMS_PER_BATCH, itemCount);
                          const batchData = state.details.slice(startIndex, endIndex);
                          
                          // Use actual 1-based indices for filename
                          const actualStartIndex = startIndex + 1;
                          const actualEndIndex = endIndex;
                          
                          // Store batch data in storage (safer than sending via message)
                          const batchKey = `autoExportBatch_${batchNum}`;
                          chrome.storage.local.set({ [batchKey]: batchData }, () => {
                            // Send message with batch reference (not data)
                            chrome.runtime.sendMessage({
                              action: 'autoExportBatch',
                              batchKey: batchKey,
                              startIndex: actualStartIndex,
                              endIndex: actualEndIndex,
                              batchNumber: batchNum + 1,
                              totalBatches: totalBatches
                            }, (response) => {
                              if (chrome.runtime.lastError) {
                                console.error(`[Content] Auto-export batch ${batchNum + 1} error:`, chrome.runtime.lastError);
                              } else {
                                console.log(`[Content] Auto-export batch ${batchNum + 1}/${totalBatches} sent`);
                              }
                              
                              // Clean up batch data from storage after export
                              chrome.storage.local.remove([batchKey]);
                              
                              // Export next batch with delay
                              if (batchNum + 1 < totalBatches) {
                                setTimeout(() => exportBatch(batchNum + 1), 2000); // 2s delay between batches
                              } else {
                                // All done
                                chrome.storage.local.remove(['autoExportBatchInfo', 'currentExportBatch']);
                                chrome.storage.local.set({ exportCompleted: true });
                              }
                            });
                          });
                        } catch (error) {
                          console.error(`[Content] Error exporting batch ${batchNum + 1}:`, error);
                          // Continue with next batch even if this one fails
                          if (batchNum + 1 < totalBatches) {
                            setTimeout(() => exportBatch(batchNum + 1), 2000);
                          }
                        }
                      };
                      
                      // Start exporting batches
                      exportBatch(0);
                    });
                  });
                } catch (error) {
                  console.error('[Content] Error triggering auto-export:', error);
                }
              } else if (alreadyTriggered) {
                console.log('[Content] Auto-export already triggered, skipping');
              }
            });
            
            // Send partial results
            chrome.runtime.sendMessage({
              action: 'detailsScrapingComplete',
              data: state.details,
              failedLinks: state.failedLinks || [],
              maxProducts: state.maxDetails || state.details.length,
              timestamp: new Date().toISOString()
            }, (response) => {
              if (chrome.runtime.lastError) {
              }
            });
          }
        };
        
        // Helper function để chờ page load hoàn tất (tối ưu cho DOM ready)
        const waitForPageLoad = (callback) => {
          if (document.readyState === 'complete') {
            // DOM đã ready - dùng requestAnimationFrame để đợi render xong (nhanh hơn setTimeout)
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                callback();
              });
            });
          } else if (document.readyState === 'interactive') {
            // DOM đã interactive - chờ load event hoặc complete
            if (document.body && document.body.children.length > 0) {
              // Có content rồi - chỉ cần đợi render
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  callback();
                });
              });
            } else {
              // Chờ window.onload event
              window.addEventListener('load', () => {
                requestAnimationFrame(() => {
                  callback();
                });
              }, { once: true });
            }
          } else {
            // Chờ window.onload event
            window.addEventListener('load', () => {
              requestAnimationFrame(() => {
                callback();
              });
            }, { once: true });
          }
        };
        
        // Chờ page load hoàn tất trước khi scrape
        waitForPageLoad(scrapeAndContinue);
      }
    }
  });

  // ============================================
  // 🔄 PAGINATION STATE RECOVERY
  // ============================================
  // Check if we need to continue pagination from previous page
  chrome.storage.local.get(['paginationState', 'scraper_last_url'], (result) => {
    // Check if URL changed - if so, clear pagination state
    const currentUrl = window.location.href;
    const lastUrl = result.scraper_last_url;
    if (lastUrl && lastUrl !== currentUrl && result.paginationState) {
      chrome.storage.local.remove(['paginationState']);
      chrome.storage.local.set({ scraper_last_url: currentUrl });
      return;
    }
    
    if (result.paginationState) {
      const state = result.paginationState;
      
      // Validate state structure to prevent crashes
      if (!state || typeof state !== 'object') {
        console.error('[Content] Invalid paginationState: not an object');
        chrome.storage.local.remove(['paginationState']);
        return;
      }
      
      // Validate required fields
      if (!Array.isArray(state.products) && !(state.products instanceof Map)) {
        console.error('[Content] Invalid paginationState: products is not an array or Map');
        chrome.storage.local.remove(['paginationState']);
        return;
      }
      
      // Initialize missing fields
      if (typeof state.currentPage !== 'number' || state.currentPage < 0) {
        state.currentPage = 0;
      }
      if (typeof state.maxProducts !== 'number' || state.maxProducts <= 0) {
        console.error('[Content] Invalid paginationState: maxProducts is invalid');
        chrome.storage.local.remove(['paginationState']);
        return;
      }
      
      // Restore products
      let products;
      try {
        if (Array.isArray(state.products)) {
          products = new Map(state.products);
        } else if (state.products instanceof Map) {
          products = state.products;
        } else {
          products = new Map();
        }
      } catch (e) {
        console.error('[Content] Error restoring products Map:', e);
        chrome.storage.local.remove(['paginationState']);
        return;
      }
      
      // Wait for page to be ready
      const continueScraping = () => {
        const {
          maxProducts,
          selector,
          containerSelector,
          nextPageSelector,
          pageDelay,
          maxPages,
          requestId
        } = state;
        
        // Validate required fields
        if (!selector || typeof selector !== 'string') {
          console.error('[Content] Invalid paginationState: selector is missing or invalid');
          chrome.storage.local.remove(['paginationState']);
          return;
        }
        
        if (!containerSelector || typeof containerSelector !== 'string') {
          console.error('[Content] Invalid paginationState: containerSelector is missing or invalid');
          chrome.storage.local.remove(['paginationState']);
          return;
        }
        
        let currentPage = typeof state.currentPage === 'number' ? state.currentPage : 0;
        const container = Utils.findContainer(containerSelector);
        
        if (!container) {
          console.error('[Content] Container not found:', containerSelector);
          chrome.storage.local.remove(['paginationState']);
          return;
        }
        
        try {
          // Scrape current page
          let items = [];
          if (selector.startsWith('>')) {
            items = Array.from(container.children);
          } else if (selector.includes('a[href]') || selector.includes('a[')) {
            items = Utils.safeQueryAll(selector, container);
          } else {
            items = Utils.safeQueryAll(selector, container);
          }

          items.forEach((item) => {
            try {
              let link = null;
              let card = item;
              
              // If item is already an <a> tag, use it as link and find parent container
              if (item.tagName === 'A') {
                link = item;
                // Find parent container for extraction
                card = item.closest('[class*="product"], [class*="card"], [class*="item"]') 
                    || item.closest('div, article, li, section') 
                    || item.parentElement 
                    || item;
              } else {
                // Flexible link finding for all product types
                // Try .html first (most common pattern), then any valid link
                link = Utils.safeQuery('a[href*=".html"]', item) 
                    || Utils.safeQuery('a[href]:not([href^="#"]):not([href^="javascript:"]):not([href^="mailto:"]):not([href^="tel:"])', item);
                card = item;
              }
              
              if (!link || !link.href || products.has(link.href)) return;

              // Skip non-product links
              // Accept any link with .html (flexible for all categories/domains on the site)
              const href = link.href.toLowerCase();
              const isProductLink = href.includes('.html') || 
                (href.match(/\/[^\/]+\/[^\/]+$/) && !href.match(/\/(trang-chu|home|index|search|tim-kiem)/i));
              if (!isProductLink) return;

              const info = Utils.extractProductInfo(card, link);
              const product = {
                name: info.name || 'N/A',
                price: info.price,
                image: info.image,
                link: link.href,
                package: info.package,
                description: '',
                sku: '',
                page: currentPage
              };

              const hasValidName = product.name && product.name !== 'N/A' && product.name.trim().length > 2;
              const hasValidPrice = product.price && product.price.trim().length > 0;
              const hasValidImage = product.image && product.image.trim().length > 0;
              
              if (hasValidName || hasValidPrice || hasValidImage) {
                products.set(link.href, product);
              }
            } catch (e) {
              // Skip
            }
          });

          const currentCount = products.size;

          // Skip is already applied during scraping, so just take maxProducts
          if (currentCount >= maxProducts || currentPage >= maxPages) {
            chrome.storage.local.remove(['paginationState']);
            const finalProducts = Array.from(products.values()).slice(0, maxProducts);
            
            // Optimized: Don't save list to storage - workflow will handle slicing directly
            // Send result back to popup if it's still listening
            chrome.runtime.sendMessage({
              action: 'paginationComplete',
              requestId: requestId,
              data: finalProducts,
              url: window.location.href,
              timestamp: new Date().toISOString()
            });
            return;
          }

          const nextButton = Utils.findNextPageButton(nextPageSelector);
          if (!nextButton) {
            chrome.storage.local.remove(['paginationState']);
            const finalProducts = Array.from(products.values()).slice(0, maxProducts);
            
            // Save result to storage for background continuation (if workflow request)
            const isWorkflow = requestId && String(requestId).startsWith('workflow_');
            if (isWorkflow) {
              chrome.storage.local.set({
                [`workflow_list_result_${requestId}`]: finalProducts
              });
            }
            
            chrome.runtime.sendMessage({
              action: 'paginationComplete',
              requestId: requestId,
              data: finalProducts,
              url: window.location.href,
              timestamp: new Date().toISOString()
            });
            
            // If workflow and popup might be closed, trigger continuation check
            if (isWorkflow) {
              setTimeout(() => {
                chrome.storage.local.get([`workflow_state_${requestId}`], (result) => {
                  if (result[`workflow_state_${requestId}`]) {
                    // Workflow state exists, continue scraping details
                    continueWorkflowFromStorage(requestId);
                  }
                });
              }, 1000); // Wait a bit for popup to handle if still open
            }
            return;
          }

          currentPage++;
          chrome.storage.local.set({
            paginationState: {
              products: Array.from(products.entries()),
              currentPage,
              maxProducts,
              selector,
              containerSelector,
              nextPageSelector,
              pageDelay,
              maxPages,
              requestId
            }
          });

          if (nextButton.href) {
            window.location.href = nextButton.href;
          } else {
            nextButton.click();
            setTimeout(continueScraping, pageDelay);
          }
        } catch (error) {
          console.error('[Content] Error in pagination continueScraping:', error);
          chrome.storage.local.remove(['paginationState']);
        }
      };

      // Helper function để chờ page load hoàn tất (tối ưu cho DOM ready)
      const waitForPageLoad = (callback) => {
        if (document.readyState === 'complete') {
          // DOM đã ready - dùng requestAnimationFrame để đợi render xong (nhanh hơn setTimeout)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              callback();
            });
          });
        } else if (document.readyState === 'interactive') {
          // DOM đã interactive - chờ load event hoặc complete
          if (document.body && document.body.children.length > 0) {
            // Có content rồi - chỉ cần đợi render
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                callback();
              });
            });
          } else {
            // Chờ window.onload event
            window.addEventListener('load', () => {
              requestAnimationFrame(() => {
                callback();
              });
            }, { once: true });
          }
        } else {
          // Chờ window.onload event
          window.addEventListener('load', () => {
            requestAnimationFrame(() => {
              callback();
            });
          }, { once: true });
        }
      };
      
      // Chờ page load hoàn tất trước khi scrape
      waitForPageLoad(continueScraping);
    }
    
    // Save current URL for state management
    chrome.storage.local.set({ scraper_last_url: window.location.href });
  });

})();
