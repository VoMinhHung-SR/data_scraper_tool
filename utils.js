(() => {
  'use strict';

  // ============================================
  // 🔧 UTILITY FUNCTIONS
  // ============================================
  window.DataScraperUtils = {
    // Safe query selector
    safeQuery: (selector, context = document) => {
      try {
        return context.querySelector(selector);
      } catch (e) {
        return null;
      }
    },

    safeQueryAll: (selector, context = document) => {
      try {
        return Array.from(context.querySelectorAll(selector));
      } catch (e) {
        return [];
      }
    },

    // Extract text content safely
    getText: (element, maxLength = null) => {
      if (!element) return '';
      const text = element.textContent?.trim() || '';
      return maxLength ? text.substring(0, maxLength) : text;
    },

    // Find best selector from list
    findBestSelector: (selectors, minCount = 3) => {
      let bestSelector = null;
      let maxCount = 0;

      for (const sel of selectors) {
        try {
          const count = document.querySelectorAll(sel).length;
          if (count >= minCount && count > maxCount) {
            bestSelector = sel;
            maxCount = count;
          }
        } catch (e) {
          // Skip invalid selector
        }
      }

      return { selector: bestSelector, count: maxCount };
    },

    // Find container
    findContainer: (containerSelector) => {
      if (containerSelector) {
        const container = this.safeQuery(containerSelector);
        if (container) return container;
      }

      const gridSelectors = ['.grid.grid-cols-2', '.grid[class*="grid-cols"]', '[class*="grid"][class*="gap"]'];
      for (const sel of gridSelectors) {
        const container = this.safeQuery(sel);
        if (container) return container;
      }
      return document.body;
    },

    // Find "Xem thêm" / Load More button
    findLoadMoreButton: (customSelector = null) => {
      if (customSelector) {
        const button = window.DataScraperUtils.safeQuery(customSelector);
        if (button && button.offsetParent !== null) return button;
      }

      const allButtons = window.DataScraperUtils.safeQueryAll('button');
      const loadMoreButton = allButtons.find(el => {
        if (!el.offsetParent) return false;
        const text = window.DataScraperUtils.getText(el).toLowerCase().trim();
        const tagName = el.tagName.toLowerCase();
        if (tagName !== 'button' || el.href) return false;
        
        const parent = el.closest('nav, [class*="category"], [class*="menu"], [class*="sidebar"]');
        if (parent) return false;
        
        return text.startsWith('xem thêm') || text.startsWith('xem tiếp') || 
               text.startsWith('load more') || /xem\s+thêm\s+\d+/.test(text);
      });

      return loadMoreButton || null;
    },

    // Find next page button
    findNextPageButton: (customSelector = null) => {
      if (customSelector) {
        return window.DataScraperUtils.safeQuery(customSelector);
      }

      const selectors = [
        'a[aria-label*="next" i]', 'a[aria-label*="sau" i]',
        'button[aria-label*="next" i]', 'button[aria-label*="sau" i]',
        '[class*="next"]', '[class*="pagination-next"]',
        'a[href*="page="]', 'a[href*="p="]'
      ];

      for (const sel of selectors) {
        try {
          const buttons = window.DataScraperUtils.safeQueryAll(sel);
          for (const button of buttons) {
            if (button?.offsetParent) {
              const text = window.DataScraperUtils.getText(button).toLowerCase();
              if (text.includes('next') || text.includes('sau') || text === '>') {
                return button;
              }
            }
          }
        } catch (e) {}
      }

      const allLinks = window.DataScraperUtils.safeQueryAll('a, button');
      return allLinks.find(el => {
        const text = window.DataScraperUtils.getText(el).toLowerCase();
        return text.includes('trang sau') || text.includes('next') || 
               (text === '>' && el.href?.includes('page'));
      }) || null;
    },

    // Extract product info from element
    extractProductInfo: (item, link) => {
      const Utils = window.DataScraperUtils;
      const card = item.tagName !== 'A' ? item : item.closest('div, article, li, section') || item;
      
      // Extract name
      const heading = Utils.safeQuery('h1, h2, h3, h4, h5, h6', card);
      let name = heading ? Utils.getText(heading) : '';
      
      if (!name && link) {
        const linkText = Utils.getText(link);
        const lines = linkText.split('\n').map(l => l.trim()).filter(l => l);
        name = lines[0]?.replace(/\d+\.?\d*\s*[₫đ]/g, '').trim() || '';
      }

      // Extract price
      let price = '';
      const priceSpan = Utils.safeQuery('span.font-semibold, [class*="font-semibold"]', card);
      if (priceSpan) {
        const priceText = Utils.getText(priceSpan);
        if (priceText.match(/\d+\.?\d*\s*[₫đ]/)) {
          price = priceText.trim();
        }
      }
      
      if (!price) {
        const priceElements = Utils.safeQueryAll('*', card);
        for (const el of priceElements) {
          if (el.tagName.toLowerCase() === 'button' || el.closest('button')) continue;
          const text = Utils.getText(el).trim();
          if (text.match(/^\d+[.,]?\d*\s*[₫đ]$/)) {
            price = text;
            break;
          }
        }
      }

      if (!price) {
        const priceElements = Utils.safeQueryAll('*', card);
        for (const el of priceElements) {
          if (el.tagName.toLowerCase() === 'button' || el.closest('button')) continue;
          const text = Utils.getText(el).trim();
          if (text.match(/\d+\.?\d*\s*[₫đ]/) && !text.toLowerCase().includes('chọn mua')) {
            const priceMatch = text.match(/(\d+[.,]?\d*\s*[₫đ])/);
            if (priceMatch) {
              price = priceMatch[1].trim();
              break;
            }
          }
        }
      }

      // Extract image
      const img = Utils.safeQuery('img', card) || Utils.safeQuery('img', link);
      const image = img?.src || '';

      // Extract package info
      let packageInfo = '';
      const packageP = Utils.safeQuery('p[class*="bg-layer-gray"], p[class*="layer-gray"]', card);
      if (packageP) {
        const packageText = Utils.getText(packageP).trim();
        if (/^(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp)/i.test(packageText)) {
          packageInfo = packageText;
        }
      }
      
      if (!packageInfo) {
        const packageSpan = Utils.safeQuery('span[class*="text-label2"], span[class*="text-label"]', card);
        if (packageSpan) {
          const packageText = Utils.getText(packageSpan).trim();
          if (/^\/\s*(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp)/i.test(packageText)) {
            packageInfo = packageText;
          }
        }
      }
      
      if (!packageInfo) {
        const cardClone = card.cloneNode(true);
        Utils.safeQueryAll('button, [role="button"]', cardClone).forEach(btn => {
          const btnText = Utils.getText(btn).toLowerCase();
          if (btnText.includes('chọn mua') || btnText.includes('mua')) {
            btn.remove();
          }
        });
        const cardText = Utils.getText(cardClone);
        const packageMatch = cardText.match(/(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp)\s*(x\s*)?\d+[^đ]*/i);
        if (packageMatch) {
          packageInfo = packageMatch[0].trim();
        }
      }

      return { name, price, image, package: packageInfo };
    }
  };
})();

