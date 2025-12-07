(() => {
  'use strict';

  // Use modules from config.js and utils.js
  const Utils = window.DataScraperUtils;
  const log = window.DataScraperLog;
  const API = window.DataScraperAPI;

  if (!Utils || !log) {
    console.error('[DataScraper] Modules not loaded! Check manifest.json');
    return;
  }

  // ============================================
  // 📊 DATA SCRAPER
  // ============================================
  const Scraper = {
    // Scrape theo selector
    scrapeBySelector: (selector, options = {}) => {
      const { attribute = null, textContent = true, multiple = true, filter = null } = options;

      try {
        const elements = Utils.safeQueryAll(selector);
        if (!elements.length) {
          log(`Không tìm thấy element với selector: ${selector}`, '⚠️');
          return [];
        }

        const results = elements.map(el => {
          let value = null;
          if (attribute) {
            value = el.getAttribute(attribute);
          } else if (textContent) {
            value = Utils.getText(el);
          } else {
            value = el.innerHTML?.trim() || '';
          }

          return {
            selector,
            value,
            html: el.outerHTML.substring(0, 200)
          };
        });

        const filtered = filter ? results.filter(filter) : results;
        log(`Scraped ${filtered.length} items từ ${selector}`, '📊');
        return multiple ? filtered : filtered[0];
      } catch (error) {
        log(`Lỗi khi scrape ${selector}: ${error.message}`, '❌');
        return multiple ? [] : null;
      }
    },

    // Scrape table
    scrapeTable: (tableSelector = 'table') => {
      try {
        const table = Utils.safeQuery(tableSelector);
        if (!table) {
          log(`Không tìm thấy table với selector: ${tableSelector}`, '⚠️');
          return [];
        }

        const headers = Utils.safeQueryAll('thead th, thead td, tr:first-child th, tr:first-child td', table)
          .map(th => Utils.getText(th));

        const rows = Utils.safeQueryAll('tbody tr, tr:not(:first-child)', table)
          .map(tr => {
            const cells = Utils.safeQueryAll('td, th', tr).map(td => Utils.getText(td));
            
            if (headers.length) {
              const rowObj = {};
              headers.forEach((header, idx) => {
                rowObj[header || `Column${idx + 1}`] = cells[idx] || '';
              });
              return rowObj;
            }
            return cells;
          });

        log(`Scraped ${rows.length} rows từ table`, '📊');
        return rows;
      } catch (error) {
        log(`Lỗi khi scrape table: ${error.message}`, '❌');
        return [];
      }
    },

    // Scrape links
    scrapeLinks: (containerSelector = 'body') => {
      try {
        const container = Utils.safeQuery(containerSelector) || document.body;
        const links = Utils.safeQueryAll('a[href]', container)
          .map(a => ({
            text: Utils.getText(a),
            href: a.href,
            title: a.title || ''
          }))
          .filter(link => link.href && !link.href.startsWith('javascript:'));

        log(`Scraped ${links.length} links`, '🔗');
        return links;
      } catch (error) {
        log(`Lỗi khi scrape links: ${error.message}`, '❌');
        return [];
      }
    },

    // Scrape images
    scrapeImages: (containerSelector = 'body') => {
      try {
        const container = Utils.safeQuery(containerSelector) || document.body;
        const images = Utils.safeQueryAll('img[src]', container)
          .map(img => ({
            src: img.src,
            alt: img.alt || '',
            title: img.title || '',
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height
          }))
          .filter(img => img.src);

        log(`Scraped ${images.length} images`, '🖼️');
        return images;
      } catch (error) {
        log(`Lỗi khi scrape images: ${error.message}`, '❌');
        return [];
      }
    },

    // Scrape products (e-commerce)
    scrapeProducts: () => {
      try {
        const productSelectors = [
          '.product', '.product-item', '.product-card', 
          '[class*="product"]', '[data-product]'
        ];

        for (const selector of productSelectors) {
          const elements = Utils.safeQueryAll(selector);
          if (elements.length > 0) {
            const products = elements.map(el => {
              const product = {
                name: Utils.getText(Utils.safeQuery('h1, h2, h3, .product-name, [class*="name"]', el)),
                price: Utils.getText(Utils.safeQuery('.price, [class*="price"]', el)),
                image: Utils.safeQuery('img', el)?.src || '',
                link: Utils.safeQuery('a', el)?.href || '',
                description: Utils.getText(Utils.safeQuery('.description, [class*="desc"]', el))
              };
              return product;
            }).filter(p => p.name || p.price);

            log(`Scraped ${products.length} products`, '🛍️');
            return products;
          }
        }

        return [];
      } catch (error) {
        log(`Lỗi khi scrape products: ${error.message}`, '❌');
        return [];
      }
    },

    // Scrape products với pagination (next page)
    scrapeProductsWithPagination: async (options = {}) => {
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
        let selector = productSelector;
        let container = null;
        let productsPerPage = 0;

        // Initialize
        const initialize = () => {
          if (!selector) {
            const selectors = [
              '.grid.grid-cols-2 > *',
              '.grid[class*="grid-cols"] > *',
              '[class*="grid"][class*="gap"] > *',
              '.grid a[href*="/thuc-pham-chuc-nang/"][href$=".html"]',
              '.grid a[href*=".html"]',
              'a[href*="/thuc-pham-chuc-nang/"][href$=".html"]',
              'a[href*="/duoc-my-pham/"][href$=".html"]',
              'a[href*="/thuoc/"][href$=".html"]',
              'a[href*=".html"]',
              '[class*="product"] a[href]',
              '.product-card a[href]',
              '.product-item a[href]',
              'article a[href]',
              'div[class*="item"] a[href$=".html"]',
              'li a[href$=".html"]'
            ];
            
            const result = Utils.findBestSelector(selectors);
            if (result.selector) {
              selector = result.selector;
              log(`Tự động chọn selector: ${selector} (${result.count} sản phẩm)`, '🔍');
            }
          }

          container = Utils.findContainer(containerSelector);
          if (containerSelector) {
            log(`Sử dụng container: ${containerSelector}`, '📦');
          } else if (container !== document.body) {
            log('Tự động tìm thấy grid container', '📦');
          }
        };

        // Scrape current page
        const scrapeCurrentPage = () => {
          try {
            if (!selector) {
              log('Không tìm thấy selector sản phẩm', '⚠️');
              resolve(Array.from(products.values()));
              return;
            }

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
            let pageProducts = 0;
            items.forEach((item) => {
              try {
                const link = item.tagName === 'A' ? item : Utils.safeQuery('a[href*=".html"], a[href*="/thuc-pham-chuc-nang/"]', item);
                if (!link || !link.href || products.has(link.href)) return;

                const info = Utils.extractProductInfo(item, link);
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

                if (product.name && product.name !== 'N/A' && product.name.length > 5 && product.link) {
                  products.set(link.href, product);
                  pageProducts++;
                }
              } catch (e) {
                // Skip invalid item
              }
            });

            const currentCount = products.size;
            if (currentPage === 1) {
              productsPerPage = pageProducts;
              log(`Trang 1: ${pageProducts} sản phẩm/trang`, '📊');
            }

            log(`Trang ${currentPage}: ${pageProducts} sản phẩm mới, Tổng: ${currentCount}/${maxProducts}`, '📊');

            // Check if we have enough products
            if (currentCount >= maxProducts) {
              log(`Đã đạt đủ ${maxProducts} sản phẩm sau ${currentPage} trang`, '✅');
              chrome.storage.local.remove(['paginationState']);
              resolve(Array.from(products.values()).slice(0, maxProducts));
              return;
            }

            // Find next page button
            const nextPageButton = Utils.findNextPageButton(nextPageSelector);
            if (!nextPageButton) {
              log(`Không tìm thấy nút next page. Đã scrape ${currentCount} sản phẩm từ ${currentPage} trang`, '⏹️');
              chrome.storage.local.remove(['paginationState']);
              resolve(Array.from(products.values()));
              return;
            }

            // Check max pages
            if (currentPage >= maxPages) {
              log(`Đã đạt tối đa ${maxPages} trang. Đã scrape ${currentCount} sản phẩm`, '⏹️');
              chrome.storage.local.remove(['paginationState']);
              resolve(Array.from(products.values()));
              return;
            }

            // Click next page
            currentPage++;
            const currentUrl = window.location.href;
            log(`Chuyển sang trang ${currentPage}...`, '🔄');
            
            try {
              // Store state before navigation
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
                  requestId: options.requestId || Date.now().toString()
                }
              });

              // Click next page button
              if (nextPageButton.href) {
                // Navigate to next page (will reload content script)
                window.location.href = nextPageButton.href;
                // Don't resolve here - let the new page's content script continue
                return;
              } else {
                // AJAX pagination - click and wait for content update
                nextPageButton.click();
                
                const waitForContentUpdate = () => {
                  let checkCount = 0;
                  const maxChecks = 50;
                  const initialItemCount = items.length;
                  
                  const checkInterval = setInterval(() => {
                    checkCount++;
                    
                    // Re-query items to see if new ones appeared
                    let currentItems = [];
                    if (selector.startsWith('>')) {
                      currentItems = Array.from(container.children);
                    } else {
                      currentItems = Utils.safeQueryAll(selector, container);
                    }
                    
                    // Check if URL changed (SPA navigation)
                    const urlChanged = window.location.href !== currentUrl;
                    
                    // Check if we have new items or URL changed
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
                      chrome.storage.local.remove(['paginationState']);
                      resolve(Array.from(products.values()));
                    }
                  }, 100);
                };

                waitForContentUpdate();
              }
            } catch (e) {
              log(`Lỗi khi click next page: ${e.message}`, '❌');
              chrome.storage.local.remove(['paginationState']);
              resolve(Array.from(products.values()));
            }
          } catch (error) {
            log(`Lỗi khi scrape trang ${currentPage}: ${error.message}`, '❌');
            resolve(Array.from(products.values()));
          }
        };

        // Initialize and start
        initialize();
        if (!selector) {
          resolve([]);
          return;
        }

        // Generate request ID for tracking
        const requestId = Date.now().toString();
        options.requestId = requestId;

        // Clear any old pagination state
        chrome.storage.local.remove(['paginationState']);

        scrapeCurrentPage();
      });
    },

    // Scrape products với auto-scroll và "Xem thêm" button
    scrapeProductsWithScroll: async (options = {}) => {
      const {
        maxProducts = 100,
        scrollDelay = 1000,
        maxScrolls = 50,
        productSelector = null,
        containerSelector = null,
        loadMoreSelector = null,
        useLoadMore = true // Ưu tiên dùng "Xem thêm" button
      } = options;

      return new Promise((resolve) => {
        const products = new Map();
        let scrollCount = 0;
        let lastProductCount = 0;
        let noNewProductsCount = 0;
        let loadMoreClickCount = 0;
        let selector = productSelector;
        let container = null;

        // Initialize selector and container
        const initialize = () => {
          if (!selector) {
            const selectors = [
              '.grid.grid-cols-2 > *',
              '.grid[class*="grid-cols"] > *',
              '[class*="grid"][class*="gap"] > *',
              '.grid a[href*="/thuc-pham-chuc-nang/"][href$=".html"]',
              '.grid a[href*=".html"]',
              'a[href*="/thuc-pham-chuc-nang/"][href$=".html"]',
              'a[href*="/duoc-my-pham/"][href$=".html"]',
              'a[href*="/thuoc/"][href$=".html"]',
              'a[href*=".html"]',
              '[class*="product"] a[href]',
              '.product-card a[href]',
              '.product-item a[href]',
              'article a[href]',
              'div[class*="item"] a[href$=".html"]',
              'li a[href$=".html"]'
            ];
            
            const result = Utils.findBestSelector(selectors);
            if (result.selector) {
              selector = result.selector;
              log(`Tự động chọn selector: ${selector} (${result.count} sản phẩm)`, '🔍');
            }
          }

          container = Utils.findContainer(containerSelector);
          if (containerSelector) {
            log(`Sử dụng container: ${containerSelector}`, '📦');
          } else if (container !== document.body) {
            log('Tự động tìm thấy grid container', '📦');
          }
        };

        const scrapeCurrentProducts = () => {
          try {
            if (!selector) {
              log('Không tìm thấy selector sản phẩm', '⚠️');
              resolve(Array.from(products.values()));
              return;
            }

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

            const itemsBefore = items.length;

            // Process items
            items.forEach((item) => {
              try {
                const link = item.tagName === 'A' ? item : Utils.safeQuery('a[href*=".html"], a[href*="/thuc-pham-chuc-nang/"]', item);
                if (!link || !link.href || products.has(link.href)) return;

                const info = Utils.extractProductInfo(item, link);
                const product = {
                  name: info.name || 'N/A',
                  price: info.price,
                  image: info.image,
                  link: link.href,
                  package: info.package,
                  description: '',
                  sku: ''
                };

                if (product.name && product.name !== 'N/A' && product.name.length > 5 && product.link) {
                  products.set(link.href, product);
                }
              } catch (e) {
                // Skip invalid item
              }
            });

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

            // Ưu tiên tìm và click "Xem thêm" button
            if (useLoadMore) {
              const loadMoreButton = Utils.findLoadMoreButton(loadMoreSelector);
              
              if (loadMoreButton && loadMoreButton.offsetParent !== null) {
                try {
                  // Scroll to button first
                  loadMoreButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  
                  setTimeout(() => {
                    loadMoreButton.click();
                    loadMoreClickCount++;
                    log(`Đã click nút "Xem thêm" (lần ${loadMoreClickCount})`, '🔄');
                    
                    // Wait for new content to load
                    const waitForNewContent = () => {
                      let checkCount = 0;
                      const maxChecks = 30; // 3 seconds
                      
                      const checkInterval = setInterval(() => {
                        checkCount++;
                        
                        // Re-query items to see if new ones appeared
                        let currentItems = [];
                        if (selector.startsWith('>')) {
                          currentItems = Array.from(container.children);
                        } else {
                          currentItems = Utils.safeQueryAll(selector, container);
                        }
                        
                        // Check if we have more items than before
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
                          // Continue anyway
                          setTimeout(() => {
                            scrapeCurrentProducts();
                          }, scrollDelay);
                        }
                      }, 100);
                    };

                    waitForNewContent();
                  }, 500); // Wait a bit after scroll
                  return;
                } catch (e) {
                  log(`Lỗi khi click "Xem thêm": ${e.message}`, '⚠️');
                  // Continue with scroll
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

        // Initialize and start
        initialize();
        if (!selector) {
          resolve([]);
          return;
        }
        scrapeCurrentProducts();
      });
    },

    // Scrape chi tiết sản phẩm từ trang detail (ưu tiên API, fallback DOM)
    scrapeProductDetail: async () => {
      try {
        log(`Bắt đầu scrape product detail từ: ${window.location.href}`, '🔍');
        
        // Bước 1: Extract SKU từ URL hoặc DOM để gọi API
        let sku = '';
        const urlMatch = window.location.pathname.match(/\/([^\/]+)\.html$/);
        if (urlMatch) {
          // Try to extract SKU from URL slug or DOM
          const fullText = Utils.getText(document.body);
          const skuMatch = fullText.match(/\b\d{6,8}\b/);
          if (skuMatch) {
            sku = skuMatch[0];
            log(`Tìm thấy SKU từ body: ${sku}`, '🔍');
          }
        }
        
        // Extract SKU từ DOM nếu chưa có - ưu tiên data-test-id="sku"
        if (!sku) {
          const skuEl = Utils.safeQuery('[data-test-id="sku"]');
          if (skuEl) {
            sku = Utils.getText(skuEl).trim();
            log(`Tìm thấy SKU từ [data-test-id="sku"]: ${sku}`, '🔍');
          }
        }
        
        if (!sku) {
          const productInfoContainer = Utils.safeQuery('[data-lcpr="prr-id-product-detail-product-information"]') ||
                                       Utils.safeQuery('[class*="product-detail"]') ||
                                       document.body;
          const fullText = Utils.getText(productInfoContainer);
          const skuMatch = fullText.match(/\b\d{6,8}\b/);
          if (skuMatch) {
            sku = skuMatch[0];
            log(`Tìm thấy SKU từ regex: ${sku}`, '🔍');
          } else {
            sku = Utils.getText(Utils.safeQuery('[class*="sku"], [class*="code"]', productInfoContainer));
            if (sku) log(`Tìm thấy SKU từ class: ${sku}`, '🔍');
          }
        }

        // Bước 2: Ưu tiên scrape từ API nếu có SKU
        if (sku && API?.scrapeProductDetailBySKU) {
          log(`Đang scrape từ API với SKU: ${sku}`, '🌐');
          try {
            const apiDetail = await API.scrapeProductDetailBySKU(sku);
            if (apiDetail && apiDetail.sku) {
              log(`Đã lấy chi tiết từ API: ${apiDetail.name || apiDetail.sku}`, '✅');
              return apiDetail;
            }
            log(`API không trả về data, fallback về DOM`, '⚠️');
          } catch (apiError) {
            log(`Lỗi API: ${apiError.message}, fallback về DOM`, '⚠️');
          }
        } else {
          log(`Không tìm thấy SKU hoặc API không khả dụng, scrape từ DOM`, '⚠️');
        }

        // Bước 3: Fallback về DOM scraping
        const domData = Scraper.scrapeProductDetailFromDOM();
        if (domData) {
          log(`Đã scrape từ DOM: ${domData.name || domData.sku || 'unknown'}`, '✅');
        } else {
          log(`Không thể scrape từ DOM`, '❌');
        }
        return domData;
      } catch (error) {
        log(`Lỗi khi scrape chi tiết: ${error.message}`, '❌');
        console.error('Scrape product detail error:', error);
        // Fallback về DOM nếu API fail
        return Scraper.scrapeProductDetailFromDOM();
      }
    },

    // Helper: Extract content từ section detail-content
    extractDetailSection: (sectionId, className = null) => {
      // Ưu tiên 1: Tìm theo class name nếu có
      let section = null;
      if (className) {
        section = Utils.safeQuery(`.${className}, [class*="${className}"]`);
      }
      
      // Ưu tiên 2: Tìm theo ID
      if (!section && sectionId) {
        section = Utils.safeQuery(`#${sectionId}, [id="${sectionId}"]`);
      }
      
      // Nếu không tìm thấy, return ""
      if (!section) {
        log(`Không tìm thấy section: ${sectionId || className || 'unknown'}`, '⚠️');
        return '';
      }

      // Thử expand section nếu bị collapse (click vào heading)
      try {
        const heading = Utils.safeQuery('h2, h3, h4', section);
        if (heading) {
          // Kiểm tra xem section có bị collapse không (có thể check style hoặc class)
          const contentDiv = Utils.safeQuery('div > div', section);
          const isCollapsed = !contentDiv || 
                             contentDiv.style.display === 'none' || 
                             contentDiv.offsetHeight === 0 ||
                             section.classList.contains('collapsed');
          
          if (isCollapsed) {
            // Thử click vào heading để expand
            heading.click();
            // Đợi một chút để content load
            setTimeout(() => {}, 100);
          }
        }
      } catch (e) {
        // Ignore errors khi expand
      }

      // Clone để không ảnh hưởng DOM gốc
      const content = section.cloneNode(true);
      
      // Remove heading nếu có
      const heading = Utils.safeQuery('h2, h3, h4', content);
      if (heading) {
        heading.remove();
      }
      
      // Remove các element không cần thiết
      const removeSelectors = ['button', '[class*="toggle"]', '[class*="collapse"]', '[class*="expand"]', '[class*="css-"]'];
      removeSelectors.forEach(sel => {
        Utils.safeQueryAll(sel, content).forEach(el => el.remove());
      });
      
      let text = '';
      
      // Tìm div con chứa nội dung (thường là div đầu tiên sau heading)
      const contentDiv = Utils.safeQuery('div > div', content) || content;
      
      // Extract từ paragraphs (ưu tiên) - loại bỏ các câu hỏi "là gì?", table headers
      const paragraphs = Utils.safeQueryAll('p', contentDiv);
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          // Bỏ qua nếu paragraph nằm trong table
          if (p.closest('table')) {
            return;
          }
          
          const pText = Utils.getText(p).trim();
          // Loại bỏ các text là heading, câu hỏi "là gì?", table headers, và các text ngắn
          if (pText && 
              pText.length > 10 && 
              !pText.match(/^(Mô tả|Thành phần|Công dụng|Cách dùng|Tác dụng phụ|Lưu ý|Bảo quản|Đối tượng|Thông tin)/i) &&
              !pText.match(/là\s+gì\?/i) && // Loại bỏ "X là gì?"
              !pText.match(/Thành\s+phần\s+cho/i) && // Loại bỏ "Thành phần cho 1 viên"
              !pText.match(/Thông\s+tin\s+thành\s+phần/i) && // Loại bỏ "Thông tin thành phần"
              !pText.match(/Hàm\s+lượng/i) && // Loại bỏ "Hàm lượng"
              !pText.match(/^\d+mg$/i) && // Loại bỏ "180mg", "40mg"
              !pText.match(/^[:\s]*$/)) {
            text += pText + '\n';
          }
        });
      }
      
      // Extract từ lists (bỏ qua nếu nằm trong table)
      const lists = Utils.safeQueryAll('ul, ol', contentDiv);
      lists.forEach(list => {
        // Bỏ qua nếu list nằm trong table
        if (list.closest('table')) {
          return;
        }
        
        const items = Utils.safeQueryAll('li', list);
        items.forEach(li => {
          const liText = Utils.getText(li).trim();
          if (liText && liText.length > 5) {
            text += '• ' + liText + '\n';
          }
        });
      });
      
      // Extract từ các div có nội dung trực tiếp (nếu không có p/ul)
      // BỎ QUA table và các div chứa table
      if (!text.trim()) {
        const directDivs = Utils.safeQueryAll('div', contentDiv);
        directDivs.forEach(div => {
          // Bỏ qua div có table hoặc nằm trong table
          if (div.querySelector('table') || div.closest('table')) {
            return;
          }
          
          // Bỏ qua div có children phức tạp
          const hasComplexChildren = div.querySelector('p, ul, ol, table, h1, h2, h3, h4');
          if (!hasComplexChildren) {
            const divText = Utils.getText(div).trim();
            // Lấy div có text dài hơn 10 ký tự và không phải là heading, không phải table content
            if (divText && divText.length > 10 && 
                !divText.match(/^(Mô tả|Thành phần|Công dụng|Cách dùng|Tác dụng phụ|Lưu ý|Bảo quản)/i) &&
                !divText.match(/Thành\s+phần\s+cho/i) &&
                !divText.match(/Thông\s+tin\s+thành\s+phần/i) &&
                !divText.match(/Hàm\s+lượng/i)) {
              text += divText + '\n';
            }
          }
        });
      }
      
      // Fallback: lấy toàn bộ text từ contentDiv nếu vẫn chưa có
      if (!text.trim()) {
        text = Utils.getText(contentDiv).trim();
        // Loại bỏ heading text nếu có
        if (heading) {
          const headingText = Utils.getText(heading);
          text = text.replace(new RegExp(headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
        }
        // Loại bỏ các text không liên quan
        text = text
          .replace(/Mô\s+tả\s+sản\s+phẩm/gi, '')
          .replace(/Thành\s+phần\s+(của|cho)/gi, '')
          .replace(/Công\s+dụng\s+của/gi, '')
          .replace(/Cách\s+dùng\s+/gi, '')
          .replace(/Tác\s+dụng\s+phụ/gi, '')
          .replace(/Lưu\s+ý/gi, '')
          .replace(/Bảo\s+quản/gi, '')
          .replace(/Thông\s+tin\s+thành\s+phần/gi, '')
          .replace(/Hàm\s+lượng/gi, '')
          .replace(/.+là\s+gì\?/gi, '') // Loại bỏ "X là gì?"
          .replace(/^\d+mg$/gim, '') // Loại bỏ các số đơn lẻ như "180mg", "40mg"
          .replace(/^Nano\s+Cao\s+/gim, '') // Loại bỏ "Nano Cao" đứng đầu dòng
          .trim();
      }
      
      return text.trim();
    },

    // Scrape chi tiết từ DOM (fallback)
    scrapeProductDetailFromDOM: () => {
      try {
        const productInfoContainer = Utils.safeQuery('[data-lcpr="prr-id-product-detail-product-information"]') ||
                                     Utils.safeQuery('[class*="product-detail"]') ||
                                     document.body;
        
        const fullText = Utils.getText(productInfoContainer);
        
        // Extract name - ưu tiên các selector cụ thể
        let name = '';
        const nameSelectors = [
          'h1',
          '[data-test-id="product-name"]',
          '[class*="product-name"]',
          '[class*="product-title"]',
          'div:first-child', // Fallback cho div đầu tiên có text dài
        ];
        for (const sel of nameSelectors) {
          const nameEl = Utils.safeQuery(sel, productInfoContainer);
          if (nameEl) {
            const nameText = Utils.getText(nameEl).trim();
            // Lọc bỏ các text không phải tên sản phẩm
            if (nameText && nameText.length > 10 && !nameText.match(/^\d+$/) && !nameText.includes('đánh giá')) {
              name = nameText.split('\n')[0].trim(); // Lấy dòng đầu tiên
              break;
            }
          }
        }
        // Fallback: tìm div có text dài nhất không chứa button/price
        if (!name) {
          const allDivs = Utils.safeQueryAll('div', productInfoContainer);
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
        
        // Extract SKU - ưu tiên data-test-id="sku"
        let sku = '';
        const skuEl = Utils.safeQuery('[data-test-id="sku"]', productInfoContainer);
        if (skuEl) {
          sku = Utils.getText(skuEl).trim();
        } else {
          // Fallback: tìm số 6-8 chữ số
          const skuMatch = fullText.match(/\b\d{6,8}\b/);
          if (skuMatch) {
            sku = skuMatch[0];
          } else {
            sku = Utils.getText(Utils.safeQuery('[class*="sku"], [class*="code"]', productInfoContainer));
          }
        }
        
        // Extract brand - ưu tiên div.font-medium hoặc text sau "Thương hiệu:"
        let brand = '';
        const brandEl = Utils.safeQuery('div.font-medium', productInfoContainer);
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
            brand = brandMatch[1].trim().split(/\s+/)[0]; // Chỉ lấy từ đầu tiên
          }
        }
        
        // Extract price - ưu tiên data-test="price"
        let price = '';
        const priceEl = Utils.safeQuery('[data-test="price"]', productInfoContainer);
        if (priceEl) {
          price = Utils.getText(priceEl).trim();
        } else {
          // Fallback: tìm span có price pattern
          const priceSpan = Utils.safeQuery('span[class*="font-semibold"], span[class*="font-bold"]', productInfoContainer);
          if (priceSpan) {
            const priceText = Utils.getText(priceSpan);
            const priceMatch = priceText.match(/(\d+[.,]?\d*\s*[₫đ])/);
            if (priceMatch) {
              price = priceMatch[1].trim();
            }
          }
        }
        
        // Extract package size - ưu tiên data-test="unit" hoặc từ specifications
        let packageSize = '';
        const unitEl = Utils.safeQuery('[data-test="unit"]', productInfoContainer);
        if (unitEl) {
          packageSize = Utils.getText(unitEl).trim();
        } else {
          // Fallback: tìm từ specifications hoặc regex
          const packageMatch = fullText.match(/(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp)\s*(x\s*)?\d+[^\n\r]*/i);
          if (packageMatch) {
            packageSize = packageMatch[0].trim();
          }
        }
        
        // Extract rating và reviews - tìm các span cụ thể
        let rating = '';
        let reviewCount = '';
        let commentCount = '';
        
        // Tìm rating (số sao)
        const ratingEl = Utils.safeQuery('span[class*="inline-flex"]', productInfoContainer);
        if (ratingEl) {
          const ratingText = Utils.getText(ratingEl).trim();
          const ratingMatch = ratingText.match(/^(\d+)$/);
          if (ratingMatch) {
            rating = ratingMatch[1];
          }
        }
        
        // Tìm review count và comment count
        const reviewSpans = Utils.safeQueryAll('span[class*="text-blue"]', productInfoContainer);
        reviewSpans.forEach(span => {
          const text = Utils.getText(span).trim();
          const reviewMatch = text.match(/(\d+)\s*đánh\s+giá/i);
          const commentMatch = text.match(/(\d+)\s*bình\s+luận/i);
          if (reviewMatch) {
            reviewCount = reviewMatch[1];
          }
          if (commentMatch) {
            commentCount = commentMatch[1];
          }
        });
        
        // Extract category path - từ link hoặc text
        let categoryPath = '';
        const categoryLink = Utils.safeQuery('a[href*="/thuc-pham-chuc-nang/"]', productInfoContainer);
        if (categoryLink) {
          categoryPath = Utils.getText(categoryLink).trim();
        } else {
          const categoryP = Utils.safeQuery('p.text-body1', productInfoContainer);
          if (categoryP) {
            categoryPath = Utils.getText(categoryP).trim();
          } else {
            const breadcrumb = Utils.safeQuery('[class*="breadcrumb"]');
            if (breadcrumb) {
              categoryPath = Utils.getText(breadcrumb).replace(/\s+/g, ' > ').trim();
            }
          }
        }
        
        // Extract images - ưu tiên img có src từ cdn.nhathuoclongchau.com.vn
        let mainImage = '';
        const imageSelectors = [
          'img[src*="cdn.nhathuoclongchau.com.vn"]',
          'img[class*="gallery-img"]',
          'img[class*="product-image"]',
          'img[class*="main-image"]',
          'img[src*="product"]'
        ];
        for (const sel of imageSelectors) {
          const imgEl = Utils.safeQuery(sel, productInfoContainer);
          if (imgEl && imgEl.src && imgEl.src.includes('cdn.nhathuoclongchau.com.vn') && !imgEl.src.includes('Badge') && !imgEl.src.includes('smalls')) {
            mainImage = imgEl.src;
            break;
          }
        }
        
        // Extract all images - loại bỏ duplicate và badge images
        // Normalize URL để loại bỏ duplicate (cùng ảnh nhưng khác size)
        const normalizeImageUrl = (url) => {
          if (!url) return '';
          // Loại bỏ size parameters để so sánh
          return url.replace(/\/unsafe\/\d+x\d+\/filters:quality\(\d+\)\//, '/unsafe/');
        };
        
        const allImageElements = Utils.safeQueryAll('img[src*="cdn.nhathuoclongchau.com.vn"]', productInfoContainer);
        const imageSet = new Set(); // Dùng Set để loại bỏ duplicate (theo normalized URL)
        const images = [];
        
        // Thêm mainImage trước nếu có
        if (mainImage) {
          const normalizedMain = normalizeImageUrl(mainImage);
          if (normalizedMain && !imageSet.has(normalizedMain)) {
            imageSet.add(normalizedMain);
            images.push(mainImage);
          }
        }
        
        // Thêm các images khác (loại bỏ badge, smalls, và duplicate)
        allImageElements.forEach(img => {
          const src = img.src;
          if (src && 
              src.includes('cdn.nhathuoclongchau.com.vn') && 
              !src.includes('Badge') && 
              !src.includes('smalls')) {
            const normalizedSrc = normalizeImageUrl(src);
            if (normalizedSrc && !imageSet.has(normalizedSrc)) {
              imageSet.add(normalizedSrc);
              images.push(src);
            }
          }
        });
        
        // ============================================
        // EXTRACT CÁC SECTION TỪ detail-content-*
        // Ưu tiên tìm theo heading text để đảm bảo đúng section
        // ============================================
        
        // Helper: Tìm section theo class name (ưu tiên) hoặc heading text
        // Return null nếu không tìm thấy (KHÔNG dùng defaultId)
        const findSectionByClassOrHeading = (className, headingPattern, defaultId) => {
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
        
        // Extract description (detail-content-0) - Mô tả sản phẩm
        // CHỈ lấy từ section description, KHÔNG lấy từ ingredient hoặc các section khác
        // Nếu không tìm thấy section description → return ""
        let description = '';
        const descSectionId = findSectionByClassOrHeading('description', /Mô\s+tả\s+sản\s+phẩm/i, 'detail-content-0');
        
        // CHỈ extract nếu tìm thấy section description thực sự
        if (descSectionId) {
          // Tìm section description - đảm bảo có class="description"
          const descSection = Utils.safeQuery(`.description, [class*="description"]`);
          
          if (descSection) {
            // Đảm bảo đây là section description, không phải ingredient hoặc section khác
            const sectionClass = descSection.className || '';
            const sectionId = descSection.id || '';
            
            // CHỈ extract nếu có class="description" (không phải ingredient, usage, etc.)
            if (sectionClass.includes('description') && !sectionClass.includes('ingredient') && !sectionClass.includes('usage')) {
              description = Scraper.extractDetailSection(descSectionId, 'description');
              
              // Loại bỏ các text không phải description
              if (description) {
                const cleanedDesc = description
                  .split('\n')
                  .map(line => line.trim())
                  .filter(line => 
                    line.length > 20 && 
                    !line.match(/là\s+gì\?/i) && 
                    !line.match(/^(Mô tả|Thành phần|Công dụng|Cách dùng|Tác dụng phụ|Lưu ý|Bảo quản)/i) &&
                    !line.match(/Thành\s+phần\s+cho/i) && // Loại bỏ "Thành phần cho 1 viên"
                    !line.match(/Thông\s+tin\s+thành\s+phần/i) && // Loại bỏ "Thông tin thành phần"
                    !line.match(/Hàm\s+lượng/i) // Loại bỏ "Hàm lượng"
                  )
                  .join('\n')
                  .trim();
                
                description = cleanedDesc || '';
              }
            }
          }
        }
        
        // KHÔNG có fallback - nếu không tìm thấy section description thì return ""
        // Đảm bảo return "" nếu không tìm thấy
        description = description || '';
        
        // Extract specifications từ table hoặc structured data TRƯỚC (để dùng sau)
        const specifications = {};
        Utils.safeQueryAll('[class*="spec"] tr, [class*="attribute"] tr, table tr, [class*="info"] tr', productInfoContainer).forEach(row => {
          const cells = Utils.safeQueryAll('td, th', row);
          if (cells.length >= 2) {
            const key = Utils.getText(cells[0]).trim().replace(/[:\s]+$/, '');
            const value = Utils.getText(cells[1]).trim();
            if (key && value && key !== value && !key.includes('Chọn')) {
              specifications[key] = value;
            }
          }
        });
        
        // Extract từ các div có label-value pattern
        Utils.safeQueryAll('[class*="info-item"], [class*="detail-item"]', productInfoContainer).forEach(item => {
          const label = Utils.getText(Utils.safeQuery('[class*="label"], [class*="title"]', item));
          const value = Utils.getText(Utils.safeQuery('[class*="value"], [class*="content"]', item));
          if (label && value && !label.includes('Chọn')) {
            specifications[label] = value;
          }
        });
        
        // Extract ingredient (detail-content-1) - Thành phần
        let ingredient = '';
        const ingredientSectionId = findSectionByClassOrHeading('ingredient', /Thành\s+phần/i, 'detail-content-1');
        if (ingredientSectionId) {
          // Đảm bảo section có class="ingredient"
          const ingredientSection = Utils.safeQuery(`.ingredient, [class*="ingredient"]`);
          if (ingredientSection && (ingredientSection.id === ingredientSectionId || ingredientSection.className.includes('ingredient'))) {
            ingredient = Scraper.extractDetailSection(ingredientSectionId, 'ingredient');
          }
        }
        // Fallback: từ specifications
        if (!ingredient && specifications['Thành phần']) {
          ingredient = specifications['Thành phần'];
        }
        // Đảm bảo return "" nếu không tìm thấy
        ingredient = ingredient || '';
        
        // Extract usage (detail-content-2) - Công dụng
        let usage = '';
        const usageSectionId = findSectionByClassOrHeading('usage', /Công\s+dụng/i, 'detail-content-2');
        if (usageSectionId) {
          // Đảm bảo section có class="usage"
          const usageSection = Utils.safeQuery(`.usage, [class*="usage"]`);
          if (usageSection && (usageSection.id === usageSectionId || usageSection.className.includes('usage'))) {
            usage = Scraper.extractDetailSection(usageSectionId, 'usage');
          }
        }
        // Đảm bảo return "" nếu không tìm thấy
        usage = usage || '';
        
        // Extract dosage (detail-content-3) - Cách dùng
        let dosage = '';
        const dosageSectionId = findSectionByClassOrHeading('dosage', /Cách\s+dùng/i, 'detail-content-3');
        if (dosageSectionId) {
          // Đảm bảo section có class="dosage"
          const dosageSection = Utils.safeQuery(`.dosage, [class*="dosage"]`);
          if (dosageSection && (dosageSection.id === dosageSectionId || dosageSection.className.includes('dosage'))) {
            dosage = Scraper.extractDetailSection(dosageSectionId, 'dosage');
          }
        }
        // Đảm bảo return "" nếu không tìm thấy
        dosage = dosage || '';
        
        // Extract adverseEffect (detail-content-4) - Tác dụng phụ
        let adverseEffect = '';
        const adverseSectionId = findSectionByClassOrHeading('adverseEffect', /Tác\s+dụng\s+phụ/i, 'detail-content-4');
        if (adverseSectionId) {
          // Đảm bảo section có class="adverseEffect"
          const adverseSection = Utils.safeQuery(`.adverseEffect, [class*="adverseEffect"]`);
          if (adverseSection && (adverseSection.id === adverseSectionId || adverseSection.className.includes('adverseEffect'))) {
            adverseEffect = Scraper.extractDetailSection(adverseSectionId, 'adverseEffect');
          }
        }
        
        // Kiểm tra xem có phải là preservation không (nếu có "nơi khô", "bảo quản" thì không phải adverseEffect)
        if (adverseEffect && (
          adverseEffect.match(/nơi\s+khô/i) || 
          adverseEffect.match(/bảo\s+quản/i) ||
          adverseEffect.match(/nhiệt\s+độ/i) ||
          adverseEffect.match(/tránh\s+ánh\s+sáng/i)
        )) {
          // Đây là preservation, không phải adverseEffect
          adverseEffect = '';
        }
        
        // Đảm bảo return "" nếu không tìm thấy
        adverseEffect = adverseEffect || '';
        
        // Extract careful (detail-content-5) - Lưu ý
        let careful = '';
        const carefulSectionId = findSectionByClassOrHeading('careful', /Lưu\s+ý/i, 'detail-content-5');
        if (carefulSectionId) {
          // Đảm bảo section có class="careful"
          const carefulSection = Utils.safeQuery(`.careful, [class*="careful"]`);
          if (carefulSection && (carefulSection.id === carefulSectionId || carefulSection.className.includes('careful'))) {
            careful = Scraper.extractDetailSection(carefulSectionId, 'careful');
          }
        }
        // Đảm bảo return "" nếu không tìm thấy
        careful = careful || '';
        
        // Extract preservation (detail-content-6) - Bảo quản
        let preservation = '';
        const preservationSectionId = findSectionByClassOrHeading('preservation', /Bảo\s+quản/i, 'detail-content-6');
        if (preservationSectionId) {
          // Đảm bảo section có class="preservation"
          const preservationSection = Utils.safeQuery(`.preservation, [class*="preservation"]`);
          if (preservationSection && (preservationSection.id === preservationSectionId || preservationSection.className.includes('preservation'))) {
            preservation = Scraper.extractDetailSection(preservationSectionId, 'preservation');
          }
        }
        // Đảm bảo return "" nếu không tìm thấy
        preservation = preservation || '';
        
        // Extract thông tin bổ sung từ specifications trước, fallback về regex
        let registrationNumber = '';
        let origin = '';
        let manufacturer = '';
        let shelfLife = '';
        
        // Ưu tiên từ specifications, fallback về regex
        if (specifications['Số đăng ký']) {
          registrationNumber = specifications['Số đăng ký'].split(/\s+/)[0];
        } else {
          const registrationMatch = fullText.match(/Số\s+đăng\s+ký[:\s]+([^\n\r]+)/i);
          if (registrationMatch) {
            registrationNumber = registrationMatch[1].trim().split(/\s+/)[0];
          }
        }
        
        if (specifications['Xuất xứ thương hiệu']) {
          origin = specifications['Xuất xứ thương hiệu'].split(/\s+/)[0];
        } else if (specifications['Nước sản xuất']) {
          origin = specifications['Nước sản xuất'].split(/\s+/)[0];
        } else {
          const originMatch = fullText.match(/Xuất\s+xứ\s+thương\s+hiệu[:\s]+([^\n\r]+)/i) || 
                             fullText.match(/Nước\s+sản\s+xuất[:\s]+([^\n\r]+)/i);
          if (originMatch) {
            origin = originMatch[1].trim().split(/\s+/)[0];
          }
        }
        
        if (specifications['Nhà sản xuất']) {
          manufacturer = specifications['Nhà sản xuất'].split('\n')[0];
        } else {
          const manufacturerMatch = fullText.match(/Nhà\s+sản\s+xuất[:\s]+([^\n\r]+)/i);
          if (manufacturerMatch) {
            manufacturer = manufacturerMatch[1].trim().split('\n')[0];
          }
        }
        
        if (specifications['Hạn sử dụng']) {
          shelfLife = specifications['Hạn sử dụng'].split(/\s+/)[0];
        } else {
          const shelfLifeMatch = fullText.match(/Hạn\s+sử\s+dụng[:\s]+([^\n\r]+)/i);
          if (shelfLifeMatch) {
            shelfLife = shelfLifeMatch[1].trim().split(/\s+/)[0];
          }
        }
        
        if (specifications['Quy cách'] && !packageSize) {
          packageSize = specifications['Quy cách'];
        }
        
        const product = {
          name: (name || '').trim(),
          sku: (sku || '').trim(),
          brand: (brand || '').trim(),
          price: (price || '').trim(),
          packageSize: (packageSize || '').trim(),
          rating: (rating || '').trim(),
          reviewCount: (reviewCount || '').trim(),
          commentCount: (commentCount || '').trim(),
          reviews: reviewCount && commentCount ? `${reviewCount} đánh giá, ${commentCount} bình luận` : '',
          categoryPath: (categoryPath || '').trim(),
          image: (mainImage || '').trim(),
          images: Array.isArray(images) ? images.filter(img => img && typeof img === 'string' && img.trim()) : [],
          // Các section từ detail-content-*
          description: (description || '').trim(),
          ingredient: (ingredient || '').trim(),
          usage: (usage || '').trim(),
          dosage: (dosage || '').trim(),
          adverseEffect: (adverseEffect || '').trim(),
          careful: (careful || '').trim(),
          preservation: (preservation || '').trim(),
          // Thông tin bổ sung
          registrationNumber: (registrationNumber || '').trim(),
          origin: (origin || '').trim(),
          manufacturer: (manufacturer || '').trim(),
          shelfLife: (shelfLife || '').trim(),
          ingredients: (ingredient || specifications['Thành phần'] || '').trim(), // Alias cho ingredient, fallback từ specifications
          specifications: specifications || {},
          url: (window.location.href || '').trim(),
          scrapedAt: new Date().toISOString(),
          source: 'DOM'
        };

        // Đảm bảo có ít nhất name hoặc sku
        if (!product.name && !product.sku) {
          log(`Không tìm thấy name hoặc sku, thử extract lại...`, '⚠️');
          // Thử extract lại name từ title hoặc h1
          if (!product.name) {
            product.name = document.title || Utils.getText(Utils.safeQuery('h1')) || '';
          }
          // Thử extract lại sku từ URL
          if (!product.sku) {
            const urlSkuMatch = window.location.href.match(/\/(\d{6,8})\.html/);
            if (urlSkuMatch) {
              product.sku = urlSkuMatch[1];
            }
          }
        }

        if (product.name || product.sku) {
          log(`Đã scrape chi tiết từ DOM: ${product.name || product.sku}`, '📊');
          return product;
        } else {
          log(`Không thể scrape chi tiết: không tìm thấy name hoặc sku`, '❌');
          return null;
        }
      } catch (error) {
        log(`Lỗi khi scrape từ DOM: ${error.message}`, '❌');
        console.error('Error details:', error);
        return null;
      }
    },

    // Scrape detail cho nhiều products từ list URLs (dùng storage state)
    scrapeProductDetailsFromList: async (productLinks, options = {}) => {
      const { maxDetails = 100 } = options;
      const links = Array.isArray(productLinks) ? productLinks : [];
      const total = Math.min(links.length, maxDetails);
      
      if (total === 0) {
        log('Không có link nào để scrape', '⚠️');
        return [];
      }

      // Normalize links
      const normalizedLinks = links.slice(0, total).map(link => 
        typeof link === 'string' ? link : (link.link || link.url || '')
      ).filter(link => link && link.includes('.html'));

      if (normalizedLinks.length === 0) {
        log('Không có link hợp lệ', '⚠️');
        return [];
      }

      // Lưu state vào storage để auto-scrape khi navigate
      const stateKey = 'scrapeDetailsState';
      const state = {
        links: normalizedLinks,
        currentIndex: 0,
        details: [],
        startedAt: Date.now()
      };
      
      await new Promise(resolve => {
        chrome.storage.local.set({ [stateKey]: state }, () => {
          log(`Đã lưu ${normalizedLinks.length} links vào storage. Bắt đầu navigate...`, '💾');
          resolve();
        });
      });

      // Navigate to first product (auto-scrape sẽ tiếp tục)
      const firstLink = normalizedLinks[0];
      log(`Chuyển đến sản phẩm đầu tiên: ${firstLink}`, '🔄');
      window.location.href = firstLink;
      
      // Return empty - details will be collected via storage and sent to popup
      return [];
    },

    // Scrape từ API
    scrapeFromAPI: async (options = {}) => {
      const { apiUrl = null, maxProducts = 100, interceptMode = true } = options;

      return new Promise((resolve) => {
        try {
          if (apiUrl) {
            fetch(apiUrl)
              .then(response => response.json())
              .then(data => {
                const products = Scraper.formatAPIProducts(data);
                resolve(products.slice(0, maxProducts));
              })
              .catch(error => {
                log(`Lỗi khi gọi API: ${error.message}`, '❌');
                resolve([]);
              });
            return;
          }

          if (interceptMode) {
            const originalFetch = window.fetch;
            const apiProducts = [];

            window.fetch = function(...args) {
              const url = args[0];
              
              if (typeof url === 'string' && (
                (url.includes('/api/') && url.includes('product')) ||
                url.includes('productlist') ||
                (url.includes('search') && url.includes('product'))
              )) {
                log(`Phát hiện API call: ${url}`, '🔍');
                
                return originalFetch.apply(this, args)
                  .then(response => {
                    const clonedResponse = response.clone();
                    clonedResponse.json().then(data => {
                      const products = Array.isArray(data) ? data : (data.data || []);
                      products.forEach(product => {
                        if (product.sku || product.name) {
                          apiProducts.push(product);
                        }
                      });
                      log(`Đã intercept ${apiProducts.length} sản phẩm từ API`, '📊');
                    }).catch(() => {});
                    return response;
                  });
              }
              
              return originalFetch.apply(this, args);
            };

              setTimeout(() => {
                window.fetch = originalFetch;
                if (apiProducts.length > 0) {
                  const formatted = apiProducts.map(p => API?.formatProduct(p)).filter(p => p);
                  resolve(formatted.slice(0, maxProducts));
                } else {
                  Scraper.findAPIInWindow(resolve, maxProducts);
                }
              }, 3000);
          } else {
            Scraper.findAPIInWindow(resolve, maxProducts);
          }
        } catch (error) {
          log(`Lỗi khi scrape từ API: ${error.message}`, '❌');
          resolve([]);
        }
      });
    },

    // Tìm API data trong window (fallback)
    findAPIInWindow: (resolve, maxProducts) => {
      try {
        const possibleKeys = ['__NEXT_DATA__', 'window.__INITIAL_STATE__', 'window.products', 'window.productList'];
        
        for (const key of possibleKeys) {
          try {
            const data = eval(key);
            if (data && (Array.isArray(data) || (data.products && Array.isArray(data.products)))) {
              const products = Array.isArray(data) ? data : data.products;
              if (products.length > 0) {
                const formatted = products.map(p => API?.formatProduct(p)).filter(p => p);
                log(`Tìm thấy ${formatted.length} sản phẩm trong ${key}`, '✅');
                resolve(formatted.slice(0, maxProducts));
                return;
              }
            }
          } catch (e) {
            // Skip
          }
        }
        
        resolve([]);
      } catch (error) {
        log(`Lỗi khi tìm API trong window: ${error.message}`, '❌');
        resolve([]);
      }
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

        log(`Scraped ${results.length} custom items`, '📊');
        return results;
      } catch (error) {
        log(`Lỗi khi scrape custom: ${error.message}`, '❌');
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
  // 📡 USE HANDLERS FROM handlers/ folder
  // ============================================
  const MessageHandler = window.DataScraperMessageHandler;
  const HighlightManager = window.DataScraperHighlightManager;

  // ============================================
  // 📡 MAIN MESSAGE LISTENER
  // ============================================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrape') {
      return MessageHandler.handleScrape(request, sendResponse);
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
  if (window.location.href.includes('.html') && window.location.href.includes('/thuc-pham-chuc-nang/')) {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0];
      
      if (typeof url === 'string' && (
        url.includes('/api/') && (url.includes('product') || url.includes('sku'))
      )) {
        log(`Phát hiện API call product detail: ${url}`, '🔍');
        
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
                log(`Đã lưu product detail từ API`, '💾');
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
      const currentUrl = window.location.href;
      
      // Check if current page is a product detail page
      if (currentUrl.includes('.html') && currentUrl.includes('/thuc-pham-chuc-nang/')) {
        log(`Phát hiện trang detail, đang scrape...`, '🔍');
        
        // Wait for page ready
        const scrapeAndContinue = async () => {
          const detail = await Scraper.scrapeProductDetail();
          if (detail) {
            state.details.push(detail);
            log(`Đã scrape ${state.details.length}/${state.links.length}: ${detail.name || detail.sku}`, '✅');
          }
          
          state.currentIndex++;
          
          // Check if done
          if (state.currentIndex >= state.links.length) {
            chrome.storage.local.remove(['scrapeDetailsState']);
            log(`Hoàn thành scrape ${state.details.length} chi tiết!`, '🎉');
            
            // Send result to popup
            chrome.runtime.sendMessage({
              action: 'detailsScrapingComplete',
              data: state.details,
              timestamp: new Date().toISOString()
            });
            return;
          }
          
          // Navigate to next product
          const nextLink = typeof state.links[state.currentIndex] === 'string' 
            ? state.links[state.currentIndex] 
            : state.links[state.currentIndex].link || state.links[state.currentIndex].url;
          
          if (nextLink) {
            chrome.storage.local.set({ scrapeDetailsState: state }, () => {
              log(`Chuyển đến sản phẩm ${state.currentIndex + 1}/${state.links.length}...`, '🔄');
              setTimeout(() => {
                window.location.href = nextLink;
              }, 1000);
            });
          }
        };
        
        if (document.readyState === 'complete') {
          setTimeout(scrapeAndContinue, 2000);
        } else {
          window.addEventListener('load', () => {
            setTimeout(scrapeAndContinue, 2000);
          });
        }
      }
    }
  });

  // ============================================
  // 🔄 PAGINATION STATE RECOVERY
  // ============================================
  // Check if we need to continue pagination from previous page
  chrome.storage.local.get(['paginationState'], (result) => {
    if (result.paginationState) {
      const state = result.paginationState;
      log(`Phát hiện pagination state, tiếp tục từ trang ${state.currentPage}...`, '🔄');
      
      // Restore products
      const products = new Map(state.products);
      
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
        
        let currentPage = state.currentPage;
        const container = Utils.findContainer(containerSelector);
        
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
              const link = item.tagName === 'A' ? item : Utils.safeQuery('a[href*=".html"], a[href*="/thuc-pham-chuc-nang/"]', item);
              if (!link || !link.href || products.has(link.href)) return;

              const info = Utils.extractProductInfo(item, link);
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

              if (product.name && product.name !== 'N/A' && product.name.length > 5 && product.link) {
                products.set(link.href, product);
              }
            } catch (e) {
              // Skip
            }
          });

          const currentCount = products.size;
          log(`Trang ${currentPage}: Tổng ${currentCount}/${maxProducts}`, '📊');

          // Check completion
          if (currentCount >= maxProducts || currentPage >= maxPages) {
            chrome.storage.local.remove(['paginationState']);
            const finalProducts = Array.from(products.values()).slice(0, maxProducts);
            log(`Hoàn thành: ${finalProducts.length} sản phẩm từ ${currentPage} trang`, '✅');
            
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

          // Find and click next page
          const nextButton = Utils.findNextPageButton(nextPageSelector);
          if (!nextButton) {
            chrome.storage.local.remove(['paginationState']);
            const finalProducts = Array.from(products.values());
            log(`Không còn trang tiếp theo. Tổng: ${finalProducts.length} sản phẩm`, '⏹️');
            
            chrome.runtime.sendMessage({
              action: 'paginationComplete',
              requestId: requestId,
              data: finalProducts,
              url: window.location.href,
              timestamp: new Date().toISOString()
            });
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
          log(`Lỗi: ${error.message}`, '❌');
          chrome.storage.local.remove(['paginationState']);
        }
      };

      // Wait for page ready
      if (document.readyState === 'complete') {
        setTimeout(continueScraping, 1000);
      } else {
        window.addEventListener('load', () => {
          setTimeout(continueScraping, 1000);
        });
      }
    }
  });

  log('Data Scraper content script loaded ✅');
})();
