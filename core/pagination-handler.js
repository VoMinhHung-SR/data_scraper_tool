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
     * @returns {Object} { newProducts: number, categoryData: Object }
     */
    _scrapeCurrentPage: (selector, container, products, currentPage = 0, cachedCategoryData = null) => {
      const Utils = window.DataScraperUtils;
      const ExtractionUtils = window.DataScraperExtractionUtils;
      
      if (!selector) return { newProducts: 0, categoryData: null };
      
      // Extract category from breadcrumb once (shared for all products on this page)
      // Use cached data if provided, otherwise extract on first page only
      let categoryData = cachedCategoryData;
      if (!categoryData && currentPage === 0) {
        categoryData = ExtractionUtils.extractCategoryFromBreadcrumb();
      }

      // Find items using optimized method
      const items = window.DataScraperPaginationHandler._findItems(selector, container);

      // Process items with optimized validation
      let newProducts = 0;
      const productLinkPattern = /\.html|^\/[^\/]+\/[^\/]+$/i;
      const nonProductPattern = /\/(trang-chu|home|index|search|tim-kiem)/i;
      
      for (const item of items) {
        try {
          let link = null;
          let card = item;
          
          // Optimize link and card finding
          if (item.tagName === 'A') {
            link = item;
            const parent = item.parentElement;
            // Optimize card finding - check most common cases first
            if (parent && parent.parentElement === container) {
              card = parent;
            } else if (parent?.classList.toString().match(/(product|card|item)/i)) {
              card = parent;
            } else {
              card = item.closest('[class*="product"], [class*="card"], [class*="item"]') || parent || item;
            }
          } else {
            // Try .html first (most common), then any valid link
            link = Utils.safeQuery('a[href*=".html"]', item) 
                || Utils.safeQuery('a[href]:not([href^="#"]):not([href^="javascript:"]):not([href^="mailto:"]):not([href^="tel:"])', item);
            card = item;
          }
          
          if (!link?.href || products.has(link.href)) continue;
          
          const href = link.href.toLowerCase();
          if (!productLinkPattern.test(href) || nonProductPattern.test(href)) continue;

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
            categorySlug: categoryData?.categorySlug || ''
          };

          if (currentPage > 0) {
            product.page = currentPage;
          }

          const hasData = (product.name && product.name !== 'N/A' && product.name.trim().length > 2) ||
                         (product.price && product.price.trim().length > 0) ||
                         (product.image && product.image.trim().length > 0);
          
          if (hasData) {
            products.set(link.href, product);
            newProducts++;
          }
        } catch (e) {
          // Skip invalid item silently
        }
      }

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

            // Click next page button
            if (nextPageButton.href) {
              // Navigate to next page (will reload content script)
              window.location.href = nextPageButton.href;
              return;
            } else {
              // AJAX pagination
              nextPageButton.click();

              const waitForContentUpdate = () => {
                let checkCount = 0;
                const maxChecks = 50;
                const initialItemCount = Utils.safeQueryAll(selector, container).length;

                const checkInterval = setInterval(() => {
                  checkCount++;
                  const currentItems = Utils.safeQueryAll(selector, container);
                  const urlChanged = window.location.href !== currentUrl;

                  if (currentItems.length > initialItemCount || urlChanged) {
                    clearInterval(checkInterval);
                    setTimeout(() => {
                      scrapeCurrentPage();
                    }, pageDelay);
                    return;
                  }

                  if (checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                    log('Timeout khi chờ nội dung cập nhật', '⚠️');
                    StateManager.clearPaginationState();
                    const finalProducts = Array.from(products.values()).slice(0, maxProducts);
                    resolve(finalProducts);
                  }
                }, 100);
              };

              waitForContentUpdate();
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
        const scrapeCurrentProducts = () => {
          try {
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
                console.log('[PaginationHandler] Sending scrollComplete message (enough products):', {
                  requestId: options.requestId,
                  dataLength: finalProducts.length,
                  maxProducts: maxProducts
                });
                chrome.runtime.sendMessage({
                  action: 'scrollComplete',
                  requestId: options.requestId,
                  data: finalProducts,
                  url: window.location.href,
                  timestamp: new Date().toISOString()
                }).catch(err => {
                  console.error('[PaginationHandler] Error sending scrollComplete message:', err);
                });
              }
              
              resolve(finalProducts);
              return;
            }
            
            // If no new products extracted in this round, check if we should stop
            if (pageProducts === 0) {
              // If we have some products but less than requested, return what we have
              if (currentCount > 0) {
                const finalProducts = Array.from(products.values()).slice(0, maxProducts);
                log(`⚠️ Chỉ scrape được ${finalProducts.length}/${maxProducts} sản phẩm (không còn items mới)`, '⚠️');
                
                if (options.requestId) {
                  console.log('[PaginationHandler] Sending scrollComplete message (no more items):', {
                    requestId: options.requestId,
                    dataLength: finalProducts.length,
                    maxProducts: maxProducts
                  });
                  chrome.runtime.sendMessage({
                    action: 'scrollComplete',
                    requestId: options.requestId,
                    data: finalProducts,
                    url: window.location.href,
                    timestamp: new Date().toISOString()
                  }).catch(err => {
                    console.error('[PaginationHandler] Error sending scrollComplete message:', err);
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
                  console.log('[PaginationHandler] Sending scrollComplete message (no new products):', {
                    requestId: options.requestId,
                    dataLength: finalProducts.length,
                    maxProducts: maxProducts
                  });
                  chrome.runtime.sendMessage({
                    action: 'scrollComplete',
                    requestId: options.requestId,
                    data: finalProducts,
                    url: window.location.href,
                    timestamp: new Date().toISOString()
                  }).catch(err => {
                    console.error('[PaginationHandler] Error sending scrollComplete message:', err);
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
                console.log('[PaginationHandler] Sending scrollComplete message (max scrolls):', {
                  requestId: options.requestId,
                  dataLength: finalProducts.length,
                  maxProducts: maxProducts
                });
                chrome.runtime.sendMessage({
                  action: 'scrollComplete',
                  requestId: options.requestId,
                  data: finalProducts,
                  url: window.location.href,
                  timestamp: new Date().toISOString()
                }).catch(err => {
                  console.error('[PaginationHandler] Error sending scrollComplete message:', err);
                });
              }
              
              resolve(finalProducts);
              return;
            }

            // Try "Xem thêm" button first
            if (useLoadMore) {
              const loadMoreButton = SelectorUtils.findLoadMoreButton(loadMoreSelector);

              if (loadMoreButton && loadMoreButton.offsetParent !== null) {
                try {
                  loadMoreButton.scrollIntoView({ behavior: 'smooth', block: 'center' });

                  setTimeout(() => {
                    loadMoreButton.click();
                    loadMoreClickCount++;
                    log(`Đã click nút "Xem thêm" (lần ${loadMoreClickCount})`, '🔄');

                    // Store itemsBefore before waiting for new content
                    const itemsBeforeLoadMore = Utils.safeQueryAll(selector, container).length;

                    const waitForNewContent = () => {
                      let checkCount = 0;
                      const maxChecks = 30;

                      const checkInterval = setInterval(() => {
                        checkCount++;
                        const currentItems = Utils.safeQueryAll(selector, container);

                        if (currentItems.length > itemsBeforeLoadMore) {
                          clearInterval(checkInterval);
                          log(`Đã load thêm ${currentItems.length - itemsBeforeLoadMore} sản phẩm`, '✅');
                          setTimeout(() => {
                            scrapeCurrentProducts();
                          }, scrollDelay);
                          return;
                        }

                        if (checkCount >= maxChecks) {
                          clearInterval(checkInterval);
                          setTimeout(() => {
                            scrapeCurrentProducts();
                          }, scrollDelay);
                        }
                      }, 100);
                    };

                    waitForNewContent();
                  }, 500);
                  return;
                } catch (e) {
                  log(`Lỗi khi click "Xem thêm": ${e.message}`, '⚠️');
                }
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
              console.log('[PaginationHandler] Sending scrollComplete message (error):', {
                requestId: options.requestId,
                dataLength: finalProducts.length,
                maxProducts: maxProducts,
                error: error.message
              });
              chrome.runtime.sendMessage({
                action: 'scrollComplete',
                requestId: options.requestId,
                data: finalProducts,
                url: window.location.href,
                timestamp: new Date().toISOString()
              }).catch(err => {
                console.error('[PaginationHandler] Error sending scrollComplete message:', err);
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

