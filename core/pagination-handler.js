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
     * Common: Scrape products from current page
     * @param {string} selector - Product selector
     * @param {Element} container - Container element
     * @param {Map} products - Products map (to avoid duplicates)
     * @param {number} currentPage - Current page number (for pagination)
     * @returns {number} Number of new products scraped
     */
    _scrapeCurrentPage: (selector, container, products, currentPage = 0) => {
      const Utils = window.DataScraperUtils;
      const ExtractionUtils = window.DataScraperExtractionUtils;
      
      if (!selector) return 0;

      // Find items
      let items = [];
      if (selector.startsWith('>')) {
        items = Array.from(container.children);
      } else if (selector.includes('a[href]') || selector.includes('a[')) {
        items = Utils.safeQueryAll(selector, container);
      } else {
        items = Utils.safeQueryAll(selector, container);
        if (items.length === 0 && container !== document.body) {
          items = Utils.safeQueryAll(selector);
        }
      }

      // Process items
      let newProducts = 0;
      items.forEach((item) => {
        try {
          const link = item.tagName === 'A' ? item : Utils.safeQuery('a[href*=".html"], a[href*="/thuc-pham-chuc-nang/"]', item);
          if (!link || !link.href || products.has(link.href)) return;

          const info = ExtractionUtils.extractProductInfo(item, link);
          const product = {
            name: info.name || 'N/A',
            price: info.price,
            image: info.image,
            link: link.href,
            package: info.package,
            description: '',
            sku: ''
          };

          if (currentPage > 0) {
            product.page = currentPage;
          }

          if (product.name && product.name !== 'N/A' && product.name.length > 5 && product.link) {
            products.set(link.href, product);
            newProducts++;
          }
        } catch (e) {
          // Skip invalid item
        }
      });

      return newProducts;
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

        // Scrape current page
        const scrapeCurrentPage = () => {
          try {
            const pageProducts = window.DataScraperPaginationHandler._scrapeCurrentPage(
              selector,
              container,
              products,
              currentPage
            );

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
              log(`Không tìm thấy nút next page. Đã scrape ${currentCount} sản phẩm từ ${currentPage} trang`, '⏹️');
              StateManager.clearPaginationState();
              resolve(Array.from(products.values()));
              return;
            }

            // Check max pages
            if (currentPage >= maxPages) {
              log(`Đã đạt tối đa ${maxPages} trang. Đã scrape ${currentCount} sản phẩm`, '⏹️');
              StateManager.clearPaginationState();
              resolve(Array.from(products.values()));
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
                    resolve(Array.from(products.values()));
                  }
                }, 100);
              };

              waitForContentUpdate();
            }
          } catch (error) {
            log(`Lỗi khi scrape trang ${currentPage}: ${error.message}`, '❌');
            StateManager.clearPaginationState();
            resolve(Array.from(products.values()));
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

        // Scrape current products
        const scrapeCurrentProducts = () => {
          try {
            const itemsBefore = Utils.safeQueryAll(selector, container).length;
            const pageProducts = window.DataScraperPaginationHandler._scrapeCurrentPage(
              selector,
              container,
              products,
              0
            );

            const currentCount = products.size;
            log(`Đã scrape ${currentCount} sản phẩm (scroll ${scrollCount}, load more: ${loadMoreClickCount})`, '📊');

            // Check stop conditions
            if (currentCount >= maxProducts) {
              log(`Đã đạt đủ ${maxProducts} sản phẩm`, '✅');
              resolve(Array.from(products.values()).slice(0, maxProducts));
              return;
            }

            if (currentCount === lastProductCount) {
              noNewProductsCount++;
              if (noNewProductsCount >= 3) {
                log('Không còn sản phẩm mới, dừng', '⏹️');
                resolve(Array.from(products.values()));
                return;
              }
            } else {
              noNewProductsCount = 0;
            }

            lastProductCount = currentCount;
            scrollCount++;

            if (scrollCount >= maxScrolls) {
              log(`Đã scroll tối đa ${maxScrolls} lần`, '⏹️');
              resolve(Array.from(products.values()));
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

                    const waitForNewContent = () => {
                      let checkCount = 0;
                      const maxChecks = 30;

                      const checkInterval = setInterval(() => {
                        checkCount++;
                        const currentItems = Utils.safeQueryAll(selector, container);

                        if (currentItems.length > itemsBefore) {
                          clearInterval(checkInterval);
                          log(`Đã load thêm ${currentItems.length - itemsBefore} sản phẩm`, '✅');
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
            resolve(Array.from(products.values()));
          }
        };

        scrapeCurrentProducts();
      });
    }
  };
})();

