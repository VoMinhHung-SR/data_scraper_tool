(() => {
  'use strict';

  // ============================================
  // 🔍 SELECTOR UTILITIES
  // ============================================
  window.DataScraperSelectorUtils = {
    /**
     * Find best selector from list
     * @param {Array<string>} selectors - List of selectors to test
     * @param {number} minCount - Minimum count required
     * @returns {{selector: string|null, count: number}}
     */
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

    /**
     * Auto-detect product selector
     * @returns {{selector: string|null, count: number}}
     */
    autoDetectProductSelector: () => {
      const selectors = [
        '.grid.grid-cols-2 > *',
        '.grid[class*="grid-cols"] > *',
        '[class*="grid"][class*="gap"] > *',
        '.grid a[href*=".html"]',
        'a[href*=".html"]',
        '[class*="product"] a[href]',
        '.product-card a[href]',
        '.product-item a[href]',
        'article a[href]',
        'div[class*="item"] a[href$=".html"]',
        'li a[href$=".html"]'
      ];
      
      return window.DataScraperSelectorUtils.findBestSelector(selectors);
    },

    /**
     * Find next page button
     * @param {string|null} customSelector - Custom selector
     * @returns {Element|null}
     */
    findNextPageButton: (customSelector = null) => {
      const DOMUtils = window.DataScraperDOMUtils;
      
      if (customSelector) {
        return DOMUtils.safeQuery(customSelector);
      }

      const selectors = [
        'a[aria-label*="next" i]',
        'a[aria-label*="sau" i]',
        'button[aria-label*="next" i]',
        'button[aria-label*="sau" i]',
        '[class*="next"]',
        '[class*="pagination-next"]',
        'a[href*="page="]',
        'a[href*="p="]'
      ];

      for (const sel of selectors) {
        try {
          const buttons = DOMUtils.safeQueryAll(sel);
          for (const button of buttons) {
            if (button?.offsetParent) {
              const text = DOMUtils.getText(button).toLowerCase();
              if (text.includes('next') || text.includes('sau') || text === '>') {
                return button;
              }
            }
          }
        } catch (e) {
          // Skip
        }
      }

      // Fallback: find by text
      const allLinks = DOMUtils.safeQueryAll('a, button');
      return allLinks.find(el => {
        const text = DOMUtils.getText(el).toLowerCase();
        return text.includes('trang sau') || text.includes('next') || 
               (text === '>' && el.href?.includes('page'));
      }) || null;
    },

    /**
     * Find "Xem thêm" / Load More button
     * @param {string|null} customSelector - Custom selector
     * @returns {Element|null}
     */
    findLoadMoreButton: (customSelector = null) => {
      const DOMUtils = window.DataScraperDOMUtils;
      
      if (customSelector) {
        const button = DOMUtils.safeQuery(customSelector);
        if (button && button.offsetParent !== null) return button;
      }

      const allButtons = DOMUtils.safeQueryAll('button');
      const loadMoreButton = allButtons.find(el => {
        if (!el.offsetParent) return false;
        const text = DOMUtils.getText(el).toLowerCase().trim();
        const tagName = el.tagName.toLowerCase();
        if (tagName !== 'button' || el.href) return false;
        
        // Ignore buttons in navigation/menu
        const parent = el.closest('nav, [class*="category"], [class*="menu"], [class*="sidebar"]');
        if (parent) return false;
        
        return text.startsWith('xem thêm') || 
               text.startsWith('xem tiếp') || 
               text.startsWith('load more') || 
               /xem\s+thêm\s+\d+/.test(text);
      });

      return loadMoreButton || null;
    },

    /**
     * Test selector and return sample results
     * @param {string} selector - CSS selector to test
     * @param {number} sampleSize - Number of samples to return
     * @returns {{success: boolean, count: number, sample: Array}}
     */
    testSelector: (selector, sampleSize = 5) => {
      const DOMUtils = window.DataScraperDOMUtils;
      
      try {
        const elements = DOMUtils.safeQueryAll(selector);
        const sample = elements.slice(0, sampleSize).map(el => {
          const href = el.href || DOMUtils.safeQuery('a', el.closest('div, article, li'))?.href || '';
          const card = el.closest('div, article, li') || el;
          
          return {
            name: DOMUtils.getText(
              DOMUtils.safeQuery('h1, h2, h3, [class*="title"], [class*="name"]', card),
              50
            ) || DOMUtils.getText(el, 50),
            href: href,
            hasPrice: !!DOMUtils.safeQuery('[class*="price"]', card),
            hasImage: !!(DOMUtils.safeQuery('img', card) || DOMUtils.safeQuery('img', el))
          };
        });
        
        return {
          success: true,
          count: elements.length,
          sample: sample
        };
      } catch (error) {
        return {
          success: false,
          count: 0,
          sample: [],
          error: error.message
        };
      }
    }
  };
})();

