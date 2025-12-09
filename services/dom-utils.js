(() => {
  'use strict';

  // ============================================
  // 🔧 DOM UTILITIES
  // ============================================
  // Simple cache for query results (cleared on page navigation)
  const _queryCache = new Map();
  const CACHE_MAX_SIZE = 50;
  
  // Clear cache when page changes
  let _lastUrl = window.location.href;
  const checkUrlChange = () => {
    if (window.location.href !== _lastUrl) {
      _queryCache.clear();
      _lastUrl = window.location.href;
    }
  };
  
  window.DataScraperDOMUtils = {
    /**
     * Safe query selector with caching
     * @param {string} selector - CSS selector
     * @param {Element|Document} context - Context element
     * @param {boolean} useCache - Whether to use cache (default: false for dynamic content)
     * @returns {Element|null}
     */
    safeQuery: (selector, context = document, useCache = false) => {
      checkUrlChange();
      
      // Only cache document-level queries (not context-specific)
      if (useCache && context === document) {
        const cacheKey = `query:${selector}`;
        if (_queryCache.has(cacheKey)) {
          return _queryCache.get(cacheKey);
        }
      }
      
      try {
        const result = context.querySelector(selector);
        
        // Cache result if enabled and cache not full
        if (useCache && context === document && _queryCache.size < CACHE_MAX_SIZE) {
          _queryCache.set(`query:${selector}`, result);
        }
        
        return result;
      } catch (e) {
        return null;
      }
    },

    /**
     * Safe query selector all
     * @param {string} selector - CSS selector
     * @param {Element|Document} context - Context element
     * @param {boolean} useCache - Whether to use cache (default: false for dynamic content)
     * @returns {Array<Element>}
     */
    safeQueryAll: (selector, context = document, useCache = false) => {
      checkUrlChange();
      
      // Only cache document-level queries (not context-specific)
      if (useCache && context === document) {
        const cacheKey = `queryAll:${selector}`;
        if (_queryCache.has(cacheKey)) {
          return _queryCache.get(cacheKey);
        }
      }
      
      try {
        const result = Array.from(context.querySelectorAll(selector));
        
        // Cache result if enabled and cache not full
        if (useCache && context === document && _queryCache.size < CACHE_MAX_SIZE) {
          _queryCache.set(`queryAll:${selector}`, result);
        }
        
        return result;
      } catch (e) {
        return [];
      }
    },
    
    /**
     * Clear query cache (useful when DOM changes significantly)
     */
    clearCache: () => {
      _queryCache.clear();
    },

    /**
     * Extract text content safely
     * @param {Element} element - DOM element
     * @param {number|null} maxLength - Maximum length to return
     * @returns {string}
     */
    getText: (element, maxLength = null) => {
      if (!element) return '';
      const text = element.textContent?.trim() || '';
      return maxLength ? text.substring(0, maxLength) : text;
    },

    /**
     * Find container element
     * @param {string|null} containerSelector - Custom container selector
     * @returns {Element}
     */
    findContainer: (containerSelector = null) => {
      if (containerSelector) {
        const container = window.DataScraperDOMUtils.safeQuery(containerSelector);
        if (container) {
          // Verify container has product links inside
          const hasLinks = container.querySelectorAll('a[href*=".html"]').length > 0;
          if (hasLinks) return container;
          // If no links, try to find a better container
        }
      }

      // Auto-detect grid containers - try more specific selectors first
      const gridSelectors = [
        '.grid.grid-cols-2',
        '.grid[class*="grid-cols-2"]',
        '.grid[class*="grid-cols"]',
        '[class*="grid"][class*="grid-cols"]',
        '[class*="grid"][class*="gap"]',
        '.grid'
      ];
      
      for (const sel of gridSelectors) {
        const containers = window.DataScraperDOMUtils.safeQueryAll(sel);
        // Find container with most product links
        let bestContainer = null;
        let maxLinks = 0;
        
        for (const container of containers) {
          const linkCount = container.querySelectorAll('a[href*=".html"]').length;
          if (linkCount > maxLinks) {
            maxLinks = linkCount;
            bestContainer = container;
          }
        }
        
        if (bestContainer && maxLinks > 0) {
          return bestContainer;
        }
      }
      
      return document.body;
    },

    /**
     * Check if element is visible
     * @param {Element} element - DOM element
     * @returns {boolean}
     */
    isVisible: (element) => {
      if (!element) return false;
      return element.offsetParent !== null;
    },

    /**
     * Check if element is in viewport
     * @param {Element} element - DOM element
     * @returns {boolean}
     */
    isInViewport: (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
    }
  };
})();

