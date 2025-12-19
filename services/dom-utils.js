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
     * Clean text: only keep letters, numbers, currency units, and punctuation
     * Remove: all emoji, icons, symbols (except allowed ones)
     * @param {string} text - Text to clean
     * @returns {string}
     */
    removeEmojiAndIcons: (text) => {
      if (!text) return '';
      
      let cleaned = '';
      
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const code = char.charCodeAt(0);
        
        // Keep ASCII characters (0-127) - includes Latin letters, numbers, basic punctuation
        if (code <= 127) {
          cleaned += char;
          continue;
        }
        
        // Handle surrogate pairs (emoji that use 2 code units) - skip them
        if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
          const nextCode = text.charCodeAt(i + 1);
          if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
            // This is a surrogate pair - skip it (it's likely an emoji)
            i++; // Skip the next character too
            continue;
          }
        }
        
        // For non-ASCII characters, only keep:
        // 1. Vietnamese characters (Latin Extended-A, Latin Extended-B, Latin Extended Additional)
        // 2. Currency symbols (₫ = 0x20AB, đ = 0x0111, Đ = 0x0110)
        // 3. Basic punctuation and spaces
        
        const isKeep = (
          // Vietnamese characters: Latin Extended-A (0100-017F) - includes đ, Đ
          (code >= 0x0100 && code <= 0x017F) ||
          // Vietnamese characters: Latin Extended-B (0180-024F)
          (code >= 0x0180 && code <= 0x024F) ||
          // Vietnamese characters: Latin Extended Additional (1E00-1EFF) - includes ă, â, ê, ô, ơ, ư, etc.
          (code >= 0x1E00 && code <= 0x1EFF) ||
          // Currency: ₫ (Vietnamese Dong)
          (code === 0x20AB) ||
          // Currency: đ (lowercase d with stroke)
          (code === 0x0111) ||
          // Currency: Đ (uppercase D with stroke)
          (code === 0x0110) ||
          // Basic punctuation and spaces (2000-206F)
          (code >= 0x2000 && code <= 0x206F) ||
          // General punctuation (2E00-2E7F)
          (code >= 0x2E00 && code <= 0x2E7F)
        );
        
        // Keep if it's in allowed ranges
        if (isKeep) {
          cleaned += char;
        }
        // Otherwise, skip it (it's emoji/icon/symbol)
      }
      
      // Clean up multiple spaces and trim
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      
      return cleaned;
    },

    /**
     * Extract text content safely (with emoji/icon removal)
     * @param {Element} element - DOM element
     * @param {number|null} maxLength - Maximum length to return
     * @param {boolean} removeEmoji - Whether to remove emoji/icons (default: true)
     * @returns {string}
     */
    getText: (element, maxLength = null, removeEmoji = true) => {
      if (!element) return '';
      let text = element.textContent?.trim() || '';
      
      // Remove emoji and icons if requested
      if (removeEmoji) {
        text = window.DataScraperDOMUtils.removeEmojiAndIcons(text);
      }
      
      return maxLength ? text.substring(0, maxLength) : text;
    },

    /**
     * Find container element for products
     * Returns the grid container, but also provides parent container for buttons
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
     * Find parent container that includes both products and load more button
     * This is useful when button is outside the product grid
     * @param {Element} productContainer - The product grid container
     * @returns {Element} Parent container or original container
     */
    findParentContainer: (productContainer) => {
      if (!productContainer || productContainer === document.body) {
        return document.body;
      }

      // Try to find parent section or container that likely contains both products and button
      const parentSelectors = [
        'section[class*="product"]',
        'section[id*="product"]',
        '[class*="product-section"]',
        '[id*="product-section"]',
        'section',
        'div[class*="container"]'
      ];

      let current = productContainer.parentElement;
      let depth = 0;
      const maxDepth = 5; // Limit search depth

      while (current && depth < maxDepth) {
        // Check if this parent has both products and potential load more button
        const hasProducts = current.querySelectorAll('a[href*=".html"]').length > 0;
        const hasButtons = current.querySelectorAll('button').length > 0;
        
        // If parent has both, it's likely the right container
        if (hasProducts && hasButtons) {
          // Check if it matches common parent patterns
          for (const sel of parentSelectors) {
            if (current.matches(sel)) {
              return current;
            }
          }
        }

        current = current.parentElement;
        depth++;
      }

      // Fallback: return parent of product container (one level up)
      return productContainer.parentElement || productContainer;
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

