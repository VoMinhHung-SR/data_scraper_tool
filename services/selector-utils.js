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
     * Generic function that works for any e-commerce site
     * @param {string|null} customSelector - Custom selector (optional, highest priority)
     * @param {Element|null} container - Container element to search within (optional, improves performance)
     * @returns {Element|null} Found button element or null
     */
    findLoadMoreButton: (customSelector = null, container = null) => {
      const DOMUtils = window.DataScraperDOMUtils;
      
      // Check if we're on Long Châu website
      const isLongChau = window.location.hostname.includes('nhathuoclongchau.com.vn') || 
                         window.location.hostname.includes('longchau.com.vn');
      
      // Search in both container and document to ensure we find button even if outside container
      // This is important because button might be in a sibling element or parent
      const searchContexts = container ? [container, document] : [document];
      
      // Priority 0: Try custom selector first (user-defined, highest priority)
      if (customSelector) {
        for (const searchContext of searchContexts) {
          try {
            const button = DOMUtils.safeQuery(customSelector, searchContext);
            if (button && button.offsetParent !== null) {
              // If container provided, prefer button within container, but accept outside if not found
              if (!container || container.contains(button) || searchContext === document) {
                return button;
              }
            }
          } catch (e) {
            // Continue to next search context
          }
        }
      }

      // Priority 0.5: Hardcode selector for Long Châu (specific optimization)
      if (isLongChau) {
        // Long Châu specific selectors (hardcoded for reliability)
        const longChauSelectors = [
          'button.mt-3.flex.w-full.items-center.justify-center.p-\\[10px\\]', // Exact match
          'button.mt-3.flex.w-full', // Partial match
          'button.mt-3[class*="flex"][class*="w-full"]', // Flexible match
          'button.mt-3', // Fallback to simple
        ];
        
        for (const sel of longChauSelectors) {
          for (const searchContext of searchContexts) {
            try {
              const buttons = DOMUtils.safeQueryAll(sel, searchContext);
              for (const btn of buttons) {
                if (container && !container.contains(btn) && searchContext === container) continue;
                if (!btn.offsetParent) continue;
                
                const text = DOMUtils.getText(btn).toLowerCase().trim();
                // Match "Xem thêm" or "Xem thêm X sản phẩm"
                if (/xem\s+thêm/i.test(text)) {
                  return btn;
                }
              }
            } catch (e) {
              continue;
            }
          }
        }
      }

      // Priority 1: Try common CSS class patterns (generic, reusable for any site)
      const specificSelectors = [
        'button.mt-3', // Common Tailwind CSS pattern (matches user's button)
        'button[class*="mt-3"]', // Partial class match
        'button[class*="load-more"]', // Generic load-more pattern
        'button[class*="load"]', // Generic load pattern
      ];
      
      for (const sel of specificSelectors) {
        for (const searchContext of searchContexts) {
          try {
            const buttons = DOMUtils.safeQueryAll(sel, searchContext);
            for (const btn of buttons) {
              // If container provided, prefer button within container, but accept outside if not found in container
              if (container && !container.contains(btn) && searchContext === container) continue;
              
              if (!btn.offsetParent) continue;
              const text = DOMUtils.getText(btn).toLowerCase().trim();
              if (/xem\s+thêm|load\s+more/i.test(text)) {
                return btn;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }

      // Priority 2: Fallback - Find all buttons and filter by text pattern (generic, works for any site)
      // This ensures the function works even if CSS patterns don't match
      for (const searchContext of searchContexts) {
        const allButtons = DOMUtils.safeQueryAll('button', searchContext);
        
        for (const btn of allButtons) {
          try {
            // If container provided, prefer button within container, but accept outside if not found in container
            if (container && !container.contains(btn) && searchContext === container) continue;
            
            // Basic visibility check
            if (!btn.offsetParent) continue;
            
            const rect = btn.getBoundingClientRect();
            if (rect.height === 0 || rect.width === 0) continue;
            
            // Get text and check if it matches common "load more" patterns (generic, multilingual)
            const text = DOMUtils.getText(btn).toLowerCase().trim();
            
            // Match common patterns: "xem thêm", "xem thêm 188 sản phẩm", "load more", etc.
            // This pattern works for Vietnamese and English sites
            if (/xem\s+thêm|load\s+more|show\s+more|see\s+more/i.test(text)) {
              // Skip if disabled or hidden
              const style = window.getComputedStyle(btn);
              if (style.display === 'none' || style.visibility === 'hidden') continue;
              if (btn.disabled) continue;
              
              return btn;
            }
          } catch (e) {
            continue;
          }
        }
      }

      return null;
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

