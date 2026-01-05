(() => {
  'use strict';

  // ============================================
  // 🔧 DETAIL EXTRACTORS (Helper Functions)
  // ============================================
  // Helper functions for product detail extraction
  // Extracted from content.js for better organization

  window.DataScraperDetailExtractors = {
    /**
     * Extract price information from container
     */
    extractPriceInfo: (container, Utils) => {
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
    },

    /**
     * Normalize unit code
     */
    normalizeUnitCode: (unitName) => {
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
    },

    /**
     * Extract value from row with specific label
     */
    extractSpecValue: (labelPattern, container, Utils) => {
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
    },

    /**
     * Find section by class name or heading text
     */
    findSectionByClassOrHeading: (className, headingPattern, defaultId, Utils) => {
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
    },

    /**
     * Extract basic info (name, sku, brand, slug)
     */
    extractBasicInfo: (container, Utils) => {
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
    }
  };
})();
