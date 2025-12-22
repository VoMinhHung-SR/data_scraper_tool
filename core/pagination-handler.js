(() => {
  'use strict';

  // ============================================
  // 🔄 PAGINATION HANDLER
  // ============================================
  // Handles pagination and scroll-based product scraping
  window.DataScraperPaginationHandler = {
    /**
     * Common: Initialize selector and container
     * @param {string|null} productSelector - Product selector
     * @param {string|null} containerSelector - Container selector
     * @returns {{selector: string|null, container: Element}}
     */
    _initialize: (productSelector, containerSelector) => {
      const Utils = window.DataScraperUtils;
      const SelectorUtils = window.DataScraperSelectorUtils;
      const log = window.DataScraperLog;
      
      let selector = productSelector;
      
      // Auto-detect selector if not provided
      if (!selector) {
        const result = SelectorUtils.autoDetectProductSelector();
        if (result.selector) {
          selector = result.selector;
          log(`Tự động chọn selector: ${selector} (${result.count} sản phẩm)`, '🔍');
        }
      }

      // Find container
      const container = Utils.findContainer(containerSelector);
      if (containerSelector) {
        log(`Sử dụng container: ${containerSelector}`, '📦');
      } else if (container !== document.body) {
        log('Tự động tìm thấy grid container', '📦');
      }

      return { selector, container };
    },

    /**
     * Common: Find items with optimized query strategy
     * @param {string} selector - Product selector
     * @param {Element} container - Container element
     * @returns {Array<Element>} Found items
     */
    _findItems: (selector, container) => {
      const Utils = window.DataScraperUtils;
      
      // Simple logic like old version - no complex filtering
      if (selector.startsWith('>')) {
        return Array.from(container.children);
      }
      
      // Try in container first (most common case)
      let items = Utils.safeQueryAll(selector, container);
      
      // If no items in container and container is not body, try document-wide
      if (items.length === 0 && container !== document.body) {
        const allItems = Utils.safeQueryAll(selector);
        // Filter items that are descendants of container
        if (allItems.length > 0 && container) {
          items = allItems.filter(item => container.contains(item));
        } else {
          items = allItems; // Fallback: use all items
        }
      }
      
      return items;
    },

    /**
     * Common: Scrape products from current page
     * @param {string} selector - Product selector
     * @param {Element} container - Container element
     * @param {Map} products - Products map (to avoid duplicates)
     * @param {number} currentPage - Current page number (for pagination)
     * @param {Object|null} cachedCategoryData - Cached category data
     * @returns {number} Number of new products scraped
     */
    _scrapeCurrentPage: (selector, container, products, currentPage = 0, cachedCategoryData = null) => {
      const Utils = window.DataScraperUtils;
      const ExtractionUtils = window.DataScraperExtractionUtils;
      
      if (!selector) return { newProducts: 0, categoryData: cachedCategoryData };
      
      // Extract category from breadcrumb once (shared for all products on this page)
      // Use cached data if provided, otherwise extract on first page only
      let categoryData = cachedCategoryData;
      if (!categoryData && currentPage === 0) {
        categoryData = ExtractionUtils.extractCategoryFromBreadcrumb();
      }

      // Find items - use simple logic like old version
      let items = [];
      if (selector.startsWith('>')) {
        items = Array.from(container.children);
      } else if (selector.includes('a[href]') || selector.includes('a[')) {
        items = Utils.safeQueryAll(selector, container);
      } else {
        items = Utils.safeQueryAll(selector, container);
      }

      // Process items - simple forEach like old version
      let newProducts = 0;
      
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

          const info = ExtractionUtils.extractProductInfo(card, link);
          const product = {
            name: info.name || 'N/A',
            price: info.price || '',
            image: info.image || '',
            link: link.href,
            package: info.package || '',
            description: '',
            sku: '',
            category: categoryData?.category || [],
            categoryPath: categoryData?.categoryPath || '',
            categorySlug: categoryData?.categorySlug || '',
            page: currentPage > 0 ? currentPage : undefined
          };

          const hasValidName = product.name && product.name !== 'N/A' && product.name.trim().length > 2;
          const hasValidPrice = product.price && product.price.trim().length > 0;
          const hasValidImage = product.image && product.image.trim().length > 0;
          
          if (hasValidName || hasValidPrice || hasValidImage) {
            products.set(link.href, product);
            newProducts++;
          }
        } catch (e) {
          // Skip invalid item silently
        }
      });

      return { newProducts, categoryData };
    },

    /**
     * Scrape products with pagination (next page button)
     * @param {Object} options - Options
     * @returns {Promise<Array>}
     */
    scrapeWithPagination: async (options = {}) => {
      const Utils = window.DataScraperUtils;
      const SelectorUtils = window.DataScraperSelectorUtils;
      const StateManager = window.DataScraperStateManager;
      const log = window.DataScraperLog;
      
      const {
        maxProducts = 100,
        pageDelay = 2000,
        maxPages = 20,
        productSelector = null,
        containerSelector = null,
        nextPageSelector = null
      } = options;

      return new Promise((resolve) => {
        const products = new Map();
        let currentPage = 1;
        let productsPerPage = 0;

        // Initialize
        const { selector, container } = window.DataScraperPaginationHandler._initialize(
          productSelector,
          containerSelector
        );

        if (!selector) {
          resolve([]);
          return;
        }

        // Generate request ID
        const requestId = options.requestId || Date.now().toString();
        options.requestId = requestId;

        // Clear old state
        StateManager.clearPaginationState();

        // Scrape current page with cached category data
        let cachedCategoryData = null;
        const scrapeCurrentPage = () => {
          try {
            const result = window.DataScraperPaginationHandler._scrapeCurrentPage(
              selector,
              container,
              products,
              currentPage,
              cachedCategoryData
            );
            
            const pageProducts = result.newProducts;
            // Cache category data for subsequent pages
            if (result.categoryData) {
              cachedCategoryData = result.categoryData;
            }

            const currentCount = products.size;
            if (currentPage === 1) {
              productsPerPage = pageProducts;
              log(`Trang 1: ${pageProducts} sản phẩm/trang`, '📊');
            }

            log(`Trang ${currentPage}: ${pageProducts} sản phẩm mới, Tổng: ${currentCount}/${maxProducts}`, '📊');

            // Check stop conditions
            if (currentCount >= maxProducts) {
              log(`Đã đạt đủ ${maxProducts} sản phẩm sau ${currentPage} trang`, '✅');
              StateManager.clearPaginationState();
              resolve(Array.from(products.values()).slice(0, maxProducts));
              return;
            }

            // Find next page button
            const nextPageButton = SelectorUtils.findNextPageButton(nextPageSelector);
            if (!nextPageButton) {
              const finalProducts = Array.from(products.values()).slice(0, maxProducts);
              log(`⏹️ Không tìm thấy nút next page. Hoàn thành: ${finalProducts.length}/${maxProducts} sản phẩm từ ${currentPage} trang`, '⏹️');
              StateManager.clearPaginationState();
              resolve(finalProducts);
              return;
            }

            // Check max pages
            if (currentPage >= maxPages) {
              const finalProducts = Array.from(products.values()).slice(0, maxProducts);
              log(`⏹️ Đã đạt tối đa ${maxPages} trang. Hoàn thành: ${finalProducts.length}/${maxProducts} sản phẩm`, '⏹️');
              StateManager.clearPaginationState();
              resolve(finalProducts);
              return;
            }

            // Navigate to next page
            currentPage++;
            const currentUrl = window.location.href;
            log(`Chuyển sang trang ${currentPage}...`, '🔄');

            // Save state
            StateManager.savePaginationState({
              products: Array.from(products.entries()),
              currentPage,
              maxProducts,
              selector,
              containerSelector,
              nextPageSelector,
              pageDelay,
              maxPages,
              requestId
            });

            // Click next page button - simple like old version
            if (nextPageButton.href) {
              // Navigate to next page (will reload content script)
              window.location.href = nextPageButton.href;
              return;
            } else {
              // AJAX pagination - simple click and wait like old version
              nextPageButton.click();
              setTimeout(() => {
                scrapeCurrentPage();
              }, pageDelay);
            }
          } catch (error) {
            log(`Lỗi khi scrape trang ${currentPage}: ${error.message}`, '❌');
            StateManager.clearPaginationState();
            const finalProducts = Array.from(products.values()).slice(0, maxProducts);
            resolve(finalProducts);
          }
        };

        scrapeCurrentPage();
      });
    },

    /**
     * Scrape products with scroll and "Xem thêm" button
     * @param {Object} options - Options
     * @returns {Promise<Array>}
     */
    scrapeWithScroll: async (options = {}) => {
      const Utils = window.DataScraperUtils;
      const SelectorUtils = window.DataScraperSelectorUtils;
      const log = window.DataScraperLog;
      
      const {
        maxProducts = 100,
        scrollDelay = 1000,
        maxScrolls = 50,
        productSelector = null,
        containerSelector = null,
        loadMoreSelector = null,
        useLoadMore = true
      } = options;

      return new Promise((resolve) => {
        const products = new Map();
        let scrollCount = 0;
        let lastProductCount = 0;
        let noNewProductsCount = 0;
        let loadMoreClickCount = 0;

        // Initialize
        const { selector, container } = window.DataScraperPaginationHandler._initialize(
          productSelector,
          containerSelector
        );

        if (!selector) {
          resolve([]);
          return;
        }

        // Scrape current products with cached category data
        let cachedCategoryData = null;
        let isWaitingForContent = false; // Track if we're waiting for content to load
        let lastClickedButton = null; // Track last clicked button to prevent double clicks
        let lastClickedButtonText = null; // Track button text to detect new button instances
        let lastClickTime = 0; // Track when button was last clicked
        
        const scrapeCurrentProducts = () => {
          try {
            // Skip if already waiting for content to load
            if (isWaitingForContent) {
              return;
            }
            
            // Scrape current page from grid container
            const result = window.DataScraperPaginationHandler._scrapeCurrentPage(
              selector,
              container,
              products,
              0,
              cachedCategoryData
            );
            
            const pageProducts = result.newProducts;
            // Cache category data for subsequent scrapes
            if (result.categoryData) {
              cachedCategoryData = result.categoryData;
            }

            const currentCount = products.size;
            log(`Đã scrape ${currentCount}/${maxProducts} sản phẩm (scroll ${scrollCount}, load more: ${loadMoreClickCount})`, '📊');

            // Check if we have enough products - ALWAYS slice to exact maxProducts
            if (currentCount >= maxProducts) {
              const finalProducts = Array.from(products.values()).slice(0, maxProducts);
              log(`✅ Hoàn thành: ${finalProducts.length} sản phẩm (đã request ${maxProducts})`, '✅');
              
              if (options.requestId) {
                chrome.runtime.sendMessage({
                  action: 'scrollComplete',
                  requestId: options.requestId,
                  data: finalProducts,
                  url: window.location.href,
                  timestamp: new Date().toISOString()
                });
              }
              
              resolve(finalProducts);
              return;
            }
            
            // Check if button still exists and has text indicating more products
            // For Long Châu: button text like "Xem thêm 188 sản phẩm" means there are more
            let hasMoreProducts = true;
            if (useLoadMore) {
              const DOMUtils = window.DataScraperDOMUtils;
              const parentContainer = DOMUtils.findParentContainer(container);
              const checkButton = SelectorUtils.findLoadMoreButton(loadMoreSelector, parentContainer);
              
              if (checkButton) {
                const btnText = DOMUtils.getText(checkButton).toLowerCase().trim();
                // If button text doesn't contain "xem thêm" or number, might be done
                // But also check if button is disabled (means no more products)
                if (checkButton.disabled || (!/xem\s+thêm/i.test(btnText) && !/\d+/.test(btnText))) {
                  hasMoreProducts = false;
                }
              } else {
                // No button found, might be done
                hasMoreProducts = false;
              }
            }
            
            // If no new products extracted in this round, check if we should stop
            if (pageProducts === 0) {
              // Check if we've tried multiple times with no new products
              if (!hasMoreProducts) {
                // No button or button disabled = no more products
                const finalProducts = Array.from(products.values()).slice(0, maxProducts);
                log(`⏹️ Đã load hết sản phẩm. Hoàn thành: ${finalProducts.length} sản phẩm`, '⏹️');
                
                if (options.requestId) {
                  chrome.runtime.sendMessage({
                    action: 'scrollComplete',
                    requestId: options.requestId,
                    data: finalProducts,
                    url: window.location.href,
                    timestamp: new Date().toISOString()
                  });
                }
                
                resolve(finalProducts);
                return;
              }
              
              // If we have some products but less than requested, return what we have
              if (currentCount > 0) {
                const finalProducts = Array.from(products.values()).slice(0, maxProducts);
                log(`⚠️ Chỉ scrape được ${finalProducts.length}/${maxProducts} sản phẩm (không còn items mới)`, '⚠️');
                
                if (options.requestId) {
                  chrome.runtime.sendMessage({
                    action: 'scrollComplete',
                    requestId: options.requestId,
                    data: finalProducts,
                    url: window.location.href,
                    timestamp: new Date().toISOString()
                  });
                }
                
                resolve(finalProducts);
                return;
              }
            }

            if (currentCount === lastProductCount) {
              noNewProductsCount++;
              if (noNewProductsCount >= 3) {
                // Always slice to maxProducts before returning
                const finalProducts = Array.from(products.values()).slice(0, maxProducts);
                log(`⏹️ Không còn sản phẩm mới. Hoàn thành: ${finalProducts.length}/${maxProducts} sản phẩm`, '⏹️');
                
                if (options.requestId) {
                  chrome.runtime.sendMessage({
                    action: 'scrollComplete',
                    requestId: options.requestId,
                    data: finalProducts,
                    url: window.location.href,
                    timestamp: new Date().toISOString()
                  });
                }
                
                resolve(finalProducts);
                return;
              }
            } else {
              noNewProductsCount = 0;
            }

            lastProductCount = currentCount;
            scrollCount++;

            if (scrollCount >= maxScrolls) {
              const finalProducts = Array.from(products.values()).slice(0, maxProducts);
              log(`⏹️ Đã scroll tối đa ${maxScrolls} lần. Hoàn thành: ${finalProducts.length}/${maxProducts} sản phẩm`, '⏹️');
              
              if (options.requestId) {
                chrome.runtime.sendMessage({
                  action: 'scrollComplete',
                  requestId: options.requestId,
                  data: finalProducts,
                  url: window.location.href,
                  timestamp: new Date().toISOString()
                });
              }
              
              resolve(finalProducts);
              return;
            }

            // Try "Xem thêm" button first
            if (useLoadMore) {
              // Find parent container that includes both products and button
              const DOMUtils = window.DataScraperDOMUtils;
              const parentContainer = DOMUtils.findParentContainer(container);
              
              // Search for button in parent container (broader scope) or document
              const loadMoreButton = SelectorUtils.findLoadMoreButton(loadMoreSelector, parentContainer);

              // Get button text to detect if it's a new button instance (DOM might have changed)
              const buttonText = loadMoreButton ? DOMUtils.getText(loadMoreButton).toLowerCase().trim() : '';
              const isNewButton = !lastClickedButtonText || buttonText !== lastClickedButtonText;
              const timeSinceLastClick = Date.now() - lastClickTime;
              const shouldResetLastButton = timeSinceLastClick > 5000; // Reset after 5 seconds

              // Verify button is visible and clickable
              // Simplified conditions: only check if button exists, is visible, and not disabled
              if (loadMoreButton && 
                  loadMoreButton.offsetParent !== null && 
                  !loadMoreButton.disabled) {
                try {
                  // Mark as waiting to prevent concurrent clicks
                  isWaitingForContent = true;
                  lastClickedButton = loadMoreButton;
                  lastClickedButtonText = buttonText;
                  lastClickTime = Date.now();
                  
                  // Scroll button into view with more aggressive approach
                  loadMoreButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  
                  // Also try scrolling window to ensure button is visible
                  const rect = loadMoreButton.getBoundingClientRect();
                  const scrollY = window.scrollY + rect.top - (window.innerHeight / 2);
                  window.scrollTo({ top: scrollY, behavior: 'smooth' });

                  // Wait longer to ensure button is ready (especially for Long Châu)
                  setTimeout(() => {
                    // Re-find button in case DOM changed
                    const currentButton = SelectorUtils.findLoadMoreButton(loadMoreSelector, parentContainer);
                    if (!currentButton || !currentButton.offsetParent || currentButton.disabled) {
                      isWaitingForContent = false;
                      lastClickedButton = null;
                      lastClickedButtonText = null;
                      lastClickTime = 0;
                      scrapeCurrentProducts();
                      return;
                    }
                    
                    // Try multiple click methods to ensure it works
                    let clickSuccess = false;
                    
                    // Method 1: Direct click()
                    try {
                      currentButton.focus(); // Focus first
                      currentButton.click();
                      clickSuccess = true;
                    } catch (e) {
                      log(`Click method 1 failed: ${e.message}`, '⚠️');
                    }
                    
                    // Method 2: Dispatch mouse events (fallback)
                    if (!clickSuccess) {
                      try {
                        currentButton.focus();
                        const mouseDownEvent = new MouseEvent('mousedown', {
                          bubbles: true,
                          cancelable: true,
                          view: window
                        });
                        const mouseUpEvent = new MouseEvent('mouseup', {
                          bubbles: true,
                          cancelable: true,
                          view: window
                        });
                        const clickEvent = new MouseEvent('click', {
                          bubbles: true,
                          cancelable: true,
                          view: window
                        });
                        
                        currentButton.dispatchEvent(mouseDownEvent);
                        currentButton.dispatchEvent(mouseUpEvent);
                        currentButton.dispatchEvent(clickEvent);
                        clickSuccess = true;
                      } catch (e) {
                        log(`Click method 2 failed: ${e.message}`, '⚠️');
                      }
                    }
                    
                    if (clickSuccess) {
                      loadMoreClickCount++;
                      log(`✅ Đã click nút "Xem thêm" (lần ${loadMoreClickCount}) - Text: "${buttonText}"`, '🔄');
                      
                      // Wait longer for content to load (especially for Long Châu)
                      const waitTime = scrollDelay + 500; // Extra 500ms for Long Châu
                      setTimeout(() => {
                        isWaitingForContent = false;
                        lastClickedButton = null;
                        lastClickedButtonText = null;
                        lastClickTime = 0;
                        scrapeCurrentProducts();
                      }, waitTime);
                    } else {
                      log(`❌ Không thể click nút "Xem thêm"`, '⚠️');
                      isWaitingForContent = false;
                      lastClickedButton = null;
                      lastClickedButtonText = null;
                      lastClickTime = 0;
                      scrapeCurrentProducts();
                    }
                  }, 800); // Increased delay to 800ms for better reliability
                  return;
                } catch (e) {
                  isWaitingForContent = false;
                  lastClickedButton = null;
                  lastClickedButtonText = null;
                  lastClickTime = 0;
                  log(`Lỗi khi xử lý click "Xem thêm": ${e.message}`, '⚠️');
                }
              } else if (loadMoreButton && loadMoreButton.disabled) {
                // Button is disabled, might be loading - wait a bit
                log(`Nút "Xem thêm" đang disabled (có thể đang load)...`, '⏳');
                setTimeout(() => {
                  scrapeCurrentProducts();
                }, scrollDelay);
                return;
              } else if (loadMoreButton && loadMoreButton.offsetParent === null) {
                // Button is hidden, might appear later
                log(`Nút "Xem thêm" đang ẩn, đợi thêm...`, '⏳');
                setTimeout(() => {
                  scrapeCurrentProducts();
                }, scrollDelay);
                return;
              }
            }

            // Fallback: Scroll to bottom
            window.scrollTo(0, document.body.scrollHeight);
            setTimeout(scrapeCurrentProducts, scrollDelay);
          } catch (error) {
            log(`Lỗi khi scrape với scroll: ${error.message}`, '❌');
            const finalProducts = Array.from(products.values()).slice(0, maxProducts);
            log(`Hoàn thành: ${finalProducts.length}/${maxProducts} sản phẩm`, '⚠️');
            
            if (options.requestId) {
              chrome.runtime.sendMessage({
                action: 'scrollComplete',
                requestId: options.requestId,
                data: finalProducts,
                url: window.location.href,
                timestamp: new Date().toISOString()
              });
            }
            
            resolve(finalProducts);
          }
        };

        scrapeCurrentProducts();
      });
    }
  };
})();