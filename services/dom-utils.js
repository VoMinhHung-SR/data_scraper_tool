(() => {
  'use strict';

  // ============================================
  // 🔧 DOM UTILITIES
  // ============================================
  window.DataScraperDOMUtils = {
    /**
     * Safe query selector
     * @param {string} selector - CSS selector
     * @param {Element|Document} context - Context element
     * @returns {Element|null}
     */
    safeQuery: (selector, context = document) => {
      try {
        return context.querySelector(selector);
      } catch (e) {
        return null;
      }
    },

    /**
     * Safe query selector all
     * @param {string} selector - CSS selector
     * @param {Element|Document} context - Context element
     * @returns {Array<Element>}
     */
    safeQueryAll: (selector, context = document) => {
      try {
        return Array.from(context.querySelectorAll(selector));
      } catch (e) {
        return [];
      }
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
        if (container) return container;
      }

      // Auto-detect grid containers
      const gridSelectors = [
        '.grid.grid-cols-2',
        '.grid[class*="grid-cols"]',
        '[class*="grid"][class*="gap"]'
      ];
      
      for (const sel of gridSelectors) {
        const container = window.DataScraperDOMUtils.safeQuery(sel);
        if (container) return container;
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

