(() => {
  'use strict';

  // ============================================
  // 🎯 EXTRACTION UTILITIES
  // ============================================
  // Cache for category extraction (avoid redundant DOM queries)
  let _categoryCache = null;
  let _categoryCacheTimestamp = 0;
  const CATEGORY_CACHE_TTL = 5000; // 5 seconds cache
  
  window.DataScraperExtractionUtils = {
    /**
     * Extract product info from element
     * @param {Element} item - Product item element
     * @param {Element} link - Link element
     * @returns {{name: string, price: string, image: string, package: string}}
     */
    extractProductInfo: (item, link) => {
      const DOMUtils = window.DataScraperDOMUtils;
      
      // Find the best card container
      // If item is already a card-like element, use it
      // Otherwise, find the closest container that likely contains product info
      let card = item;
      
      if (item.tagName === 'A') {
        // If item is a link, find its parent container (product card)
        // For grid layouts, product card is usually the direct parent or grandparent
        const parent = item.parentElement;
        const grandParent = parent?.parentElement;
        
        // Check if parent is a direct child of a grid container
        if (parent && parent.parentElement && 
            (parent.parentElement.classList.toString().includes('grid') ||
             parent.parentElement.classList.toString().includes('grid-cols'))) {
          card = parent;
        } else if (parent) {
          card = parent;
        } else {
          card = item.closest('div, article, li, section') || item;
        }
      } else {
        // If item is not a link, it might already be the card
        card = item;
      }
      
      // Extract name
      const name = window.DataScraperExtractionUtils.extractName(card, link);
      
      // Extract price
      const price = window.DataScraperExtractionUtils.extractPrice(card);
      
      // Extract image
      const image = window.DataScraperExtractionUtils.extractImage(card, link);
      
      // Extract package info
      const packageInfo = window.DataScraperExtractionUtils.extractPackage(card);

      return { name, price, image, package: packageInfo };
    },

    /**
     * Extract product name
     * @param {Element} card - Card element
     * @param {Element} link - Link element
     * @returns {string}
     */
    extractName: (card, link) => {
      const DOMUtils = window.DataScraperDOMUtils;
      
      // Try heading first
      const heading = DOMUtils.safeQuery('h1, h2, h3, h4, h5, h6', card);
      let name = heading ? DOMUtils.getText(heading) : '';
      
      // Try product name selectors
      if (!name) {
        const nameSelectors = [
          '[class*="product-name"]',
          '[class*="product-title"]',
          '[data-test-id="product-name"]',
          'div[class*="name"]',
          'span[class*="name"]'
        ];
        for (const sel of nameSelectors) {
          const nameEl = DOMUtils.safeQuery(sel, card);
          if (nameEl) {
            const nameText = DOMUtils.getText(nameEl).trim();
            if (nameText && nameText.length > 5) {
              name = nameText.split('\n')[0].trim();
              break;
            }
          }
        }
      }
      
      // Fallback: extract from link text
      if (!name && link) {
        const linkText = DOMUtils.getText(link);
        const lines = linkText.split('\n').map(l => l.trim()).filter(l => l);
        // Try to find the longest line that looks like a product name
        for (const line of lines) {
          const cleanLine = line.replace(/\d+\.?\d*\s*[₫đ]/g, '').trim();
          if (cleanLine.length > 5 && !cleanLine.match(/^(Chọn|Mua|Xem|Thêm)/i)) {
            name = cleanLine;
            break;
          }
        }
        // If still no name, use first line
        if (!name && lines.length > 0) {
          name = lines[0]?.replace(/\d+\.?\d*\s*[₫đ]/g, '').trim() || '';
        }
      }
      
      // Final fallback: extract from card text (find longest text that doesn't look like price/button)
      if (!name || name.length < 3) {
        const cardText = DOMUtils.getText(card);
        const lines = cardText.split('\n').map(l => l.trim()).filter(l => l && l.length > 5);
        
        // For /thuoc/ pages, product name is usually the first substantial line
        // that contains product name keywords and doesn't look like price/button
        for (const line of lines) {
          // Skip if it looks like price, button text, category, or package info
          if (!line.match(/^\d+[.,]?\d*\s*[₫đ]/) && 
              !line.match(/^(Chọn|Mua|Xem|Thêm|Tư vấn)/i) &&
              !line.match(/^Trang\s+chủ/i) &&
              !line.match(/^(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp)\s*\d+/i) &&
              !line.match(/^\d+\s*(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp)/i)) {
            // For /thuoc/ pages, product names often start with "Thuốc" or contain product keywords
            if (line.match(/^(Thuốc|Gel|Viên|Kem|Dung dịch|Nước|Bột)/i) || 
                line.length > 10) {
              name = line;
              break;
            }
          }
        }
        
        // If still no name, try to find the longest line that looks like a product name
        if (!name || name.length < 3) {
          let longestLine = '';
          for (const line of lines) {
            if (line.length > longestLine.length && 
                !line.match(/^\d+[.,]?\d*\s*[₫đ]/) && 
                !line.match(/^(Chọn|Mua|Xem|Thêm|Tư vấn|Hộp|Gói|Vỉ)/i)) {
              longestLine = line;
            }
          }
          if (longestLine.length > 5) {
            name = longestLine;
          }
        }
      }

      // Final cleanup: remove any remaining emoji/icons
      if (name) {
        name = window.DataScraperDOMUtils.removeEmojiAndIcons(name);
      }

      return name || '';
    },

    /**
     * Extract price
     * @param {Element} card - Card element
     * @returns {string}
     */
    extractPrice: (card) => {
      const DOMUtils = window.DataScraperDOMUtils;
      let price = '';
      
      // Try font-semibold span first (common pattern)
      const priceSpan = DOMUtils.safeQuery('span.font-semibold, [class*="font-semibold"]', card);
      if (priceSpan) {
        const priceText = DOMUtils.getText(priceSpan);
        if (priceText.match(/\d+\.?\d*\s*[₫đ]/)) {
          price = priceText.trim();
        }
      }
      
      // Try exact price match
      if (!price) {
        const priceElements = DOMUtils.safeQueryAll('*', card);
        for (const el of priceElements) {
          if (el.tagName.toLowerCase() === 'button' || el.closest('button')) continue;
          const text = DOMUtils.getText(el).trim();
          if (text.match(/^\d+[.,]?\d*\s*[₫đ]$/)) {
            price = text;
            break;
          }
        }
      }

      // Try price pattern (with more context)
      if (!price) {
        const priceElements = DOMUtils.safeQueryAll('*', card);
        for (const el of priceElements) {
          if (el.tagName.toLowerCase() === 'button' || el.closest('button')) continue;
          const text = DOMUtils.getText(el).trim();
          if (text.match(/\d+\.?\d*\s*[₫đ]/) && !text.toLowerCase().includes('chọn mua')) {
            const priceMatch = text.match(/(\d+[.,]?\d*\s*[₫đ])/);
            if (priceMatch) {
              price = priceMatch[1].trim();
              break;
            }
          }
        }
      }

      // Clean up price: remove emoji/icons
      if (price) {
        price = window.DataScraperDOMUtils.removeEmojiAndIcons(price);
      }

      return price;
    },

    /**
     * Extract image
     * @param {Element} card - Card element
     * @param {Element} link - Link element
     * @returns {string}
     */
    extractImage: (card, link) => {
      const DOMUtils = window.DataScraperDOMUtils;
      const img = DOMUtils.safeQuery('img', card) || DOMUtils.safeQuery('img', link);
      return img?.src || '';
    },

    /**
     * Extract package info
     * @param {Element} card - Card element
     * @returns {string}
     */
    extractPackage: (card) => {
      const DOMUtils = window.DataScraperDOMUtils;
      let packageInfo = '';
      
      // Try specific package selectors
      const packageP = DOMUtils.safeQuery('p[class*="bg-layer-gray"], p[class*="layer-gray"]', card);
      if (packageP) {
        const packageText = DOMUtils.getText(packageP).trim();
        if (/^(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp)/i.test(packageText)) {
          packageInfo = packageText;
        }
      }
      
      // Try label span
      if (!packageInfo) {
        const packageSpan = DOMUtils.safeQuery('span[class*="text-label2"], span[class*="text-label"]', card);
        if (packageSpan) {
          const packageText = DOMUtils.getText(packageSpan).trim();
          if (/^\/\s*(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp)/i.test(packageText)) {
            packageInfo = packageText;
          }
        }
      }
      
      // Try regex on card text (excluding buttons)
      if (!packageInfo) {
        const cardClone = card.cloneNode(true);
        DOMUtils.safeQueryAll('button, [role="button"]', cardClone).forEach(btn => {
          const btnText = DOMUtils.getText(btn).toLowerCase();
          if (btnText.includes('chọn mua') || btnText.includes('mua')) {
            btn.remove();
          }
        });
        const cardText = DOMUtils.getText(cardClone);
        const packageMatch = cardText.match(/(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp)\s*(x\s*)?\d+[^đ]*/i);
        if (packageMatch) {
          packageInfo = packageMatch[0].trim();
        }
      }

      // Clean up package info: remove emoji/icons
      if (packageInfo) {
        packageInfo = window.DataScraperDOMUtils.removeEmojiAndIcons(packageInfo);
      }

      return packageInfo;
    },

    /**
     * Extract category from breadcrumb on list pages
     * @param {boolean} useCache - Whether to use cached result (default: true)
     * @returns {{category: Array, categoryPath: string, categorySlug: string}}
     */
    extractCategoryFromBreadcrumb: (useCache = true) => {
      // Return cached result if available and fresh
      if (useCache && _categoryCache && (Date.now() - _categoryCacheTimestamp) < CATEGORY_CACHE_TTL) {
        return _categoryCache;
      }
      
      const DOMUtils = window.DataScraperDOMUtils;
      let categoryPath = '';
      let categorySlug = '';
      let category = [];
      
      // Try category breadcrumb first (for list pages)
      const categoryBreadcrumb = DOMUtils.safeQuery('[data-lcpr="prr-id-category-breadcrumb"]') ||
                                  DOMUtils.safeQuery('ol[class*="breadcrumb"]') ||
                                  DOMUtils.safeQuery('[class*="breadcrumb"]');
      
      if (categoryBreadcrumb) {
        const breadcrumbLinks = DOMUtils.safeQueryAll('a', categoryBreadcrumb);
        if (breadcrumbLinks.length > 0) {
          // Extract category path and slugs from breadcrumb links
          const categoryNames = [];
          const categorySlugs = [];
          
          breadcrumbLinks.forEach(link => {
            const linkText = DOMUtils.getText(link).trim();
            const linkHref = link.href || '';
            
            // Skip "Trang chủ" (Homepage)
            if (linkText && !linkText.match(/trang\s+chủ|homepage/i)) {
              categoryNames.push(linkText);
              
              // Extract slug from href - flexible for any category path
              if (linkHref) {
                // Extract all path segments (not just specific categories)
                // Pattern: /category1/category2/category3/...
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
          const breadcrumbText = DOMUtils.getText(categoryBreadcrumb);
          if (breadcrumbText) {
            const parts = breadcrumbText.split('/').map(p => p.trim()).filter(p => p && !p.match(/trang\s+chủ|homepage/i));
            if (parts.length > 0) {
              categoryPath = parts.join(' > ');
              category = parts.map(name => ({ name: name, slug: '' }));
            }
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
      
      const result = { category, categoryPath, categorySlug };
      
      // Cache the result
      _categoryCache = result;
      _categoryCacheTimestamp = Date.now();
      
      return result;
    },
    
    /**
     * Clear category cache (useful when navigating to new page)
     */
    clearCategoryCache: () => {
      _categoryCache = null;
      _categoryCacheTimestamp = 0;
    },

    /**
     * Extract SKU from container
     * @param {Element} container - Container element
     * @returns {string}
     */
    extractSKU: (container) => {
      const DOMUtils = window.DataScraperDOMUtils;
      let sku = '';
      
      // Try data-test-id="sku" first
      const skuEl = DOMUtils.safeQuery('[data-test-id="sku"]', container);
      if (skuEl) {
        sku = DOMUtils.getText(skuEl).trim();
      } else {
        // Fallback: find 6-8 digit number
        const fullText = DOMUtils.getText(container);
        const skuMatch = fullText.match(/\b\d{6,8}\b/);
        if (skuMatch) {
          sku = skuMatch[0];
        } else {
          sku = DOMUtils.getText(DOMUtils.safeQuery('[class*="sku"], [class*="code"]', container));
        }
      }
      
      // Clean up SKU: remove emoji/icons
      sku = sku.trim();
      if (sku) {
        sku = window.DataScraperDOMUtils.removeEmojiAndIcons(sku);
      }
      
      return sku;
    },

    /**
     * Extract brand from container
     * @param {Element} container - Container element
     * @returns {string}
     */
    extractBrand: (container) => {
      const DOMUtils = window.DataScraperDOMUtils;
      let brand = '';
      
      // Try div.font-medium first
      const brandEl = DOMUtils.safeQuery('div.font-medium', container);
      if (brandEl) {
        const brandText = DOMUtils.getText(brandEl);
        const brandMatch = brandText.match(/Thương\s+hiệu[:\s]+([^\n\r]+)/i);
        if (brandMatch) {
          brand = brandMatch[1].trim();
        } else {
          brand = brandText.replace(/Thương\s+hiệu[:\s]*/gi, '').trim();
        }
      } else {
        // Fallback: regex
        const fullText = DOMUtils.getText(container);
        const brandMatch = fullText.match(/Thương\s+hiệu[:\s]+([^\n\r]+)/i);
        if (brandMatch) {
          brand = brandMatch[1].trim().split(/\s+/)[0];
        }
      }
      
      // Clean up brand: remove emoji/icons
      if (brand) {
        brand = window.DataScraperDOMUtils.removeEmojiAndIcons(brand);
      }
      
      return brand;
    },

    /**
     * Extract specifications from container
     * @param {Element} container - Container element
     * @returns {Object}
     */
    extractSpecifications: (container) => {
      const DOMUtils = window.DataScraperDOMUtils;
      const specifications = {};
      
      // Extract from table rows
      DOMUtils.safeQueryAll('[class*="spec"] tr, [class*="attribute"] tr, table tr, [class*="info"] tr', container).forEach(row => {
        const cells = DOMUtils.safeQueryAll('td, th', row);
        if (cells.length >= 2) {
          let key = DOMUtils.getText(cells[0]).trim().replace(/[:\s]+$/, '');
          let value = DOMUtils.getText(cells[1]).trim();
          
          // Remove emoji/icons from key and value
          key = window.DataScraperDOMUtils.removeEmojiAndIcons(key);
          value = window.DataScraperDOMUtils.removeEmojiAndIcons(value);
          
          if (key && value && key !== value && !key.includes('Chọn')) {
            specifications[key] = value;
          }
        }
      });
      
      // Extract from label-value divs
      DOMUtils.safeQueryAll('[class*="info-item"], [class*="detail-item"]', container).forEach(item => {
        let label = DOMUtils.getText(DOMUtils.safeQuery('[class*="label"], [class*="title"]', item));
        let value = DOMUtils.getText(DOMUtils.safeQuery('[class*="value"], [class*="content"]', item));
        
        // Remove emoji/icons from label and value
        label = window.DataScraperDOMUtils.removeEmojiAndIcons(label);
        value = window.DataScraperDOMUtils.removeEmojiAndIcons(value);
        
        if (label && value && !label.includes('Chọn')) {
          specifications[label] = value;
        }
      });
      
      return specifications;
    },

    /**
     * Clean section text (remove unwanted content and emoji/icons)
     * @param {string} text - Text to clean
     * @returns {string}
     */
    cleanSectionText: (text) => {
      if (!text) return '';
      
      // First remove emoji/icons
      const DOMUtils = window.DataScraperDOMUtils;
      let cleaned = DOMUtils.removeEmojiAndIcons(text);
      
      return cleaned
        .split('\n')
        .map(line => line.trim())
        .filter(line => 
          line.length > 20 && 
          !line.match(/là\s+gì\?/i) && 
          !line.match(/^(Mô tả|Thành phần|Công dụng|Cách dùng|Tác dụng phụ|Lưu ý|Bảo quản)/i) &&
          !line.match(/Thành\s+phần\s+cho/i) &&
          !line.match(/Thông\s+tin\s+thành\s+phần/i) &&
          !line.match(/Hàm\s+lượng/i) &&
          !line.match(/^\d+mg$/i)
        )
        .join('\n')
        .trim();
    }
  };
})();

