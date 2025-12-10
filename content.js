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
      try {
        const domData = Scraper.scrapeProductDetailFromDOM();
        if (domData && (domData.name || domData.sku)) {
          return domData;
        }
        
        return null;
      } catch (error) {
        return Scraper.scrapeProductDetailFromDOM();
      }
    },

    extractDetailSection: (sectionId, className = null) => {
      let section = null;
      if (className) {
        section = Utils.safeQuery(`.${className}, [class*="${className}"]`);
      }
      
      if (!section && sectionId) {
        section = Utils.safeQuery(`#${sectionId}, [id="${sectionId}"]`);
      }
      
      if (!section) {
        return '';
      }

      try {
        const heading = Utils.safeQuery('h2, h3, h4', section);
        if (heading) {
          const contentDiv = Utils.safeQuery('div > div', section);
          const isCollapsed = !contentDiv || 
                             contentDiv.style.display === 'none' || 
                             contentDiv.offsetHeight === 0 ||
                             section.classList.contains('collapsed');
          
          if (isCollapsed) {
            heading.click();
            setTimeout(() => {}, 100);
          }
        }
      } catch (e) {
      }

      const content = section.cloneNode(true);
      
      const heading = Utils.safeQuery('h2, h3, h4', content);
      if (heading) {
        heading.remove();
      }
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
        // Extract category and categorySlug from breadcrumb
        let categoryPath = '';
        let categorySlug = '';
        let category = [];
        
        // Try product detail breadcrumb first (more specific)
        const productBreadcrumb = Utils.safeQuery('[data-lcpr="prr-id-product-detail-breadcrumb"]') ||
                                   Utils.safeQuery('[data-lcpr="prr-id-category-breadcrumb"]') ||
                                   Utils.safeQuery('ol[class*="breadcrumb"]') ||
                                   Utils.safeQuery('[class*="breadcrumb"]');
        
        if (productBreadcrumb) {
          const breadcrumbLinks = Utils.safeQueryAll('a', productBreadcrumb);
          if (breadcrumbLinks.length > 0) {
            // Extract category path and slugs from breadcrumb links
            const categoryNames = [];
            const categorySlugs = [];
            
            breadcrumbLinks.forEach(link => {
              const linkText = Utils.getText(link).trim();
              const linkHref = link.href || '';
              
              // Skip "Trang chủ" (Homepage)
              if (linkText && !linkText.match(/trang\s+chủ|homepage/i)) {
                categoryNames.push(linkText);
                
                // Extract slug from href - flexible for any category path
                if (linkHref) {
                  try {
                    const urlObj = new URL(linkHref);
                    const pathSegments = urlObj.pathname.split('/').filter(p => p && !p.includes('.html') && !p.includes('.'));
                    
                    if (pathSegments.length > 0) {
                      // Use the last segment as slug (or all segments for nested categories)
                      categorySlugs.push(pathSegments[pathSegments.length - 1]);
        } else {
                      // Fallback: extract from URL path
                      const pathMatch = linkHref.match(/\/([^\/]+)\/?$/);
                      if (pathMatch && !pathMatch[1].includes('.')) {
                        categorySlugs.push(pathMatch[1]);
                      }
                    }
                  } catch (e) {
                    // Fallback: extract from URL path
                    const pathMatch = linkHref.match(/\/([^\/]+)\/?$/);
                    if (pathMatch && !pathMatch[1].includes('.')) {
                      categorySlugs.push(pathMatch[1]);
                    }
                  }
                }
              }
            });
            
            if (categoryNames.length > 0) {
              categoryPath = categoryNames.join(' > ');
              categorySlug = categorySlugs.join('/');
              category = categoryNames.map((name, idx) => ({
                name: name,
                slug: categorySlugs[idx] || ''
              }));
            }
          } else {
            // Fallback: extract from breadcrumb text
            const breadcrumbText = Utils.getText(productBreadcrumb);
            if (breadcrumbText) {
              const parts = breadcrumbText.split('/').map(p => p.trim()).filter(p => p && !p.match(/trang\s+chủ|homepage/i));
              if (parts.length > 0) {
                categoryPath = parts.join(' > ');
                category = parts.map(name => ({ name: name, slug: '' }));
              }
            }
          }
        }
        
        // Fallback: try category link - flexible for any category
        if (!categoryPath) {
          // Find any link that looks like a category link (has path segments, no .html)
          const allLinks = Utils.safeQueryAll('a[href]', productInfoContainer);
          for (const categoryLink of allLinks) {
            const href = categoryLink.href || '';
            // Accept same-domain or relative links that look like category paths (no .html, has path segments)
            const isSameSite = href.startsWith('http') ? href.includes(window.location.host) : true;
            if (href && isSameSite && 
                !href.includes('.html') && 
                href.match(/\/[^\/]+\/[^\/]+$/)) {
              categoryPath = Utils.getText(categoryLink).trim();
              if (categoryPath) {
                try {
                  const urlObj = new URL(href);
                  const pathSegments = urlObj.pathname.split('/').filter(p => p);
                  if (pathSegments.length > 0) {
                    categorySlug = pathSegments[pathSegments.length - 1];
                    category = [{ name: categoryPath, slug: categorySlug }];
                    break;
                  }
                } catch (e) {
                  // Skip invalid URL
                }
              }
            }
          }
        }
        
        // Fallback: try category from table
        if (!categoryPath) {
          const categoryRow = Utils.safeQuery('tr.content-container, tr[class*="category"]', productInfoContainer);
          if (categoryRow) {
            const rowText = Utils.getText(categoryRow);
            const categoryMatch = rowText.match(/Danh\s+mục[:\s]+([^\n\r]+)/i);
            if (categoryMatch) {
              categoryPath = categoryMatch[1].trim();
              category = [{ name: categoryPath, slug: '' }];
            }
          }
        }
        
        // Fallback: extract from URL - flexible for any category path
        if (!categoryPath && window.location.pathname) {
          const pathParts = window.location.pathname.split('/').filter(p => p && !p.includes('.html') && !p.includes('.'));
          if (pathParts.length > 0) {
            // Use all path parts as category (no filtering - accept any category)
            categoryPath = pathParts.join(' > ');
            categorySlug = pathParts.join('/');
            category = pathParts.map(name => ({ name: name, slug: name }));
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
        
        // Extract ingredients (detail-content-1) - Thành phần
        let ingredients = '';
        const ingredientSectionId = findSectionByClassOrHeading('ingredient', /Thành\s+phần/i, 'detail-content-1');
        if (ingredientSectionId) {
          // Đảm bảo section có class="ingredient"
          const ingredientSection = Utils.safeQuery(`.ingredient, [class*="ingredient"]`);
          if (ingredientSection && (ingredientSection.id === ingredientSectionId || ingredientSection.className.includes('ingredient'))) {
            // Ưu tiên extract từ table (lấy danh sách tên thành phần)
            const table = Utils.safeQuery('table', ingredientSection);
            if (table) {
              const rows = Utils.safeQueryAll('tr', table);
              const ingredientList = [];
              
              rows.forEach(row => {
                const cells = Utils.safeQueryAll('td', row);
                // Lấy tên thành phần từ cell đầu tiên (bỏ qua header)
                if (cells.length > 0) {
                  const name = Utils.getText(cells[0]).trim();
                  // Bỏ qua header và các text không phải tên thành phần
                  if (name && 
                      name.length > 2 &&
                      !name.match(/^(Thông tin thành phần|Hàm lượng|Thành phần cho)/i)) {
                    ingredientList.push(name);
                  }
                }
              });
              
              if (ingredientList.length > 0) {
                ingredients = ingredientList.join(', ');
              }
            }
            
            // Fallback: extract toàn bộ section nếu không có table
            if (!ingredients) {
              ingredients = Scraper.extractDetailSection(ingredientSectionId, 'ingredient');
            }
          }
        }
        // Fallback: từ specifications
        if (!ingredients && specifications['Thành phần']) {
          ingredients = specifications['Thành phần'];
        }
        // Đảm bảo return "" nếu không tìm thấy
        ingredients = ingredients || '';
        
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
        
        // Build link từ URL
        const url = window.location.href || '';
        const urlMatch = url.match(/\/([^\/]+)\.html$/);
        const slug = urlMatch ? urlMatch[1] : '';
        const link = slug ? `https://nhathuoclongchau.com.vn/${slug}` : url;
        
        // Build flat structure trước (backward compatibility)
        const flatProduct = {
          name: (name || '').trim(),
          sku: (sku || '').trim(),
          brand: (brand || '').trim(),
          price: (price || '').trim(),
          packageSize: (packageSize || '').trim(),
          rating: (rating || '').trim(),
          reviewCount: (reviewCount || '').trim(),
          commentCount: (commentCount || '').trim(),
          reviews: reviewCount && commentCount ? `${reviewCount} đánh giá, ${commentCount} bình luận` : '',
          category: Array.isArray(category) && category.length > 0 ? category : [],
          categoryPath: (categoryPath || '').trim(),
          categorySlug: (categorySlug || '').trim(),
          image: (mainImage || '').trim(),
          images: Array.isArray(images) ? images.filter(img => img && typeof img === 'string' && img.trim()) : [],
          // Các section từ detail-content-*
          description: (description || '').trim(),
          ingredients: (ingredients || '').trim(),
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
          specifications: specifications || {},
          url: url.trim(),
          link: link.trim(),
          scrapedAt: new Date().toISOString(),
          source: 'DOM',
          slug: slug
        };
        
        // Format theo cấu trúc nhóm (database-friendly) nếu có formatter
        const ProductFormatter = window.DataScraperProductFormatter;
        const product = ProductFormatter ? ProductFormatter.formatProductDetail(flatProduct) : flatProduct;

        const getField = (obj, path) => {
          const parts = path.split('.');
          let value = obj;
          for (const part of parts) {
            value = value?.[part];
            if (value === undefined) return '';
          }
          return value || '';
        };

        const setField = (obj, path, value) => {
          const parts = path.split('.');
          let current = obj;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = value;
        };

        let productName = getField(product, ProductFormatter ? 'basicInfo.name' : 'name');
        let productSku = getField(product, ProductFormatter ? 'basicInfo.sku' : 'sku');
        
        if (!productName && !productSku) {
          const extractedName = document.title || Utils.getText(Utils.safeQuery('h1')) || '';
          const urlSkuMatch = window.location.href.match(/\/(\d{6,8})\.html/);
          const extractedSku = urlSkuMatch ? urlSkuMatch[1] : '';
          
          if (extractedName) {
            setField(product, ProductFormatter ? 'basicInfo.name' : 'name', extractedName);
            productName = extractedName;
          }
          
          if (extractedSku) {
            setField(product, ProductFormatter ? 'basicInfo.sku' : 'sku', extractedSku);
            productSku = extractedSku;
          }
        }

        return (productName || productSku) ? product : null;
      } catch (error) {
        return null;
      }
    },

    // Scrape detail cho nhiều products từ list URLs (dùng storage state)
    scrapeProductDetailsFromList: async (productLinks, options = {}) => {
      const { maxDetails = 100 } = options;
      const links = Array.isArray(productLinks) ? productLinks : [];
      const total = Math.min(links.length, maxDetails);
      
      if (total === 0) {
        return [];
      }

      // Normalize links
      const normalizedLinks = links.slice(0, total).map(link => 
        typeof link === 'string' ? link : (link.link || link.url || '')
      ).filter(link => link && link.includes('.html'));

      if (normalizedLinks.length === 0) {
        return [];
      }

      // Lưu state vào storage để auto-scrape khi navigate
      const stateKey = 'scrapeDetailsState';
      const state = {
        links: normalizedLinks,
        currentIndex: 0,
        details: [],
        maxDetails: maxDetails, // Store maxDetails limit
        forceAPI: options.forceAPI || false, // Store forceAPI option
        startedAt: Date.now()
      };
      
      // Create progress indicator
      if (window.DataScraperProgressIndicator) {
        window.DataScraperProgressIndicator.create();
        window.DataScraperProgressIndicator.update(0);
      }
      
      await new Promise(resolve => {
        chrome.storage.local.set({ [stateKey]: state }, () => {
          resolve();
        });
      });

      // Navigate to first product (auto-scrape sẽ tiếp tục)
      const firstLink = normalizedLinks[0];
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
      const currentUrl = window.location.href;
      
      // Check if current page is a product detail page (flexible URL check)
      // Accept any .html page
      const isProductPage = currentUrl.includes('.html');
      
      if (isProductPage) {
        
        // Update progress indicator
        const total = state.links.length;
        const current = state.currentIndex + 1;
        const percent = Math.round((current / total) * 100);
        if (window.DataScraperProgressIndicator) {
          window.DataScraperProgressIndicator.update(percent);
        }
        
        // Wait for page ready
        const scrapeAndContinue = async () => {
          try {
            // Check if forceAPI is set in state
            const forceAPI = state.forceAPI || false;
            const detail = await Scraper.scrapeProductDetail(forceAPI);
          if (detail) {
            state.details.push(detail);
              
              // Update progress after scrape
              const newPercent = Math.round((state.details.length / total) * 100);
              if (window.DataScraperProgressIndicator) {
                window.DataScraperProgressIndicator.update(newPercent);
              }
            } else {
            }
          } catch (error) {
          }
          
          state.currentIndex++;
          
          // Check if we've reached maxDetails limit or end of links
          if (state.currentIndex >= state.links.length || state.details.length >= (state.maxDetails || state.links.length)) {
            chrome.storage.local.remove(['scrapeDetailsState']);
            
            // Show completion indicator
            if (window.DataScraperProgressIndicator) {
              window.DataScraperProgressIndicator.complete();
            }
            
            // Save to storage first (fallback if popup is closed)
            chrome.storage.local.set({
              'scraper_detail_data': {
                data: state.details,
                timestamp: Date.now(),
                count: state.details.length,
                type: 'detail',
                maxProducts: state.maxDetails || state.details.length
              }
            }, () => {
            });
            
            // Send result to popup with retry mechanism
            const sendResult = (retryCount = 0) => {
            chrome.runtime.sendMessage({
              action: 'detailsScrapingComplete',
              data: state.details,
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
          const nextLink = typeof state.links[state.currentIndex] === 'string' 
            ? state.links[state.currentIndex] 
            : state.links[state.currentIndex].link || state.links[state.currentIndex].url;
          
          if (nextLink) {
            chrome.storage.local.set({ scrapeDetailsState: state }, () => {
              setTimeout(() => {
                window.location.href = nextLink;
              }, 1500);
            });
          } else {
            chrome.storage.local.remove(['scrapeDetailsState']);
            
            // Save to storage first (fallback if popup is closed)
            chrome.storage.local.set({
              'scraper_detail_data': {
                data: state.details,
                timestamp: Date.now(),
                count: state.details.length,
                type: 'detail',
                maxProducts: state.maxDetails || state.details.length
              }
            });
            
            // Send partial results
            chrome.runtime.sendMessage({
              action: 'detailsScrapingComplete',
              data: state.details,
              maxProducts: state.maxDetails || state.details.length,
              timestamp: new Date().toISOString()
            }, (response) => {
              if (chrome.runtime.lastError) {
              }
            });
          }
        };
        
        if (document.readyState === 'complete') {
          setTimeout(scrapeAndContinue, 2500);
        } else {
          window.addEventListener('load', () => {
            setTimeout(scrapeAndContinue, 2500);
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

          if (currentCount >= maxProducts || currentPage >= maxPages) {
            chrome.storage.local.remove(['paginationState']);
            const finalProducts = Array.from(products.values()).slice(0, maxProducts);
            
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
            const finalProducts = Array.from(products.values());
            
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

})();
