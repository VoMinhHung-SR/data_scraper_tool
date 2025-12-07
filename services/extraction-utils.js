(() => {
  'use strict';

  // ============================================
  // 🎯 EXTRACTION UTILITIES
  // ============================================
  window.DataScraperExtractionUtils = {
    /**
     * Extract product info from element
     * @param {Element} item - Product item element
     * @param {Element} link - Link element
     * @returns {{name: string, price: string, image: string, package: string}}
     */
    extractProductInfo: (item, link) => {
      const DOMUtils = window.DataScraperDOMUtils;
      const card = item.tagName !== 'A' ? item : item.closest('div, article, li, section') || item;
      
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
      
      // Fallback: extract from link text
      if (!name && link) {
        const linkText = DOMUtils.getText(link);
        const lines = linkText.split('\n').map(l => l.trim()).filter(l => l);
        name = lines[0]?.replace(/\d+\.?\d*\s*[₫đ]/g, '').trim() || '';
      }

      return name;
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

      return packageInfo;
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
      
      return sku.trim();
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
          const key = DOMUtils.getText(cells[0]).trim().replace(/[:\s]+$/, '');
          const value = DOMUtils.getText(cells[1]).trim();
          if (key && value && key !== value && !key.includes('Chọn')) {
            specifications[key] = value;
          }
        }
      });
      
      // Extract from label-value divs
      DOMUtils.safeQueryAll('[class*="info-item"], [class*="detail-item"]', container).forEach(item => {
        const label = DOMUtils.getText(DOMUtils.safeQuery('[class*="label"], [class*="title"]', item));
        const value = DOMUtils.getText(DOMUtils.safeQuery('[class*="value"], [class*="content"]', item));
        if (label && value && !label.includes('Chọn')) {
          specifications[label] = value;
        }
      });
      
      return specifications;
    },

    /**
     * Clean section text (remove unwanted content)
     * @param {string} text - Text to clean
     * @returns {string}
     */
    cleanSectionText: (text) => {
      if (!text) return '';
      
      return text
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

