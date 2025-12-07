(() => {
  'use strict';

  // ============================================
  // 🎨 HIGHLIGHT MANAGER
  // ============================================
  window.DataScraperHighlightManager = {
    // Private state
    _elements: [],

    /**
     * Highlight a single element
     * @param {Element} element - Element to highlight
     */
    highlight: (element) => {
      if (!element) return;
      element.style.outline = '3px solid #4CAF50';
      element.style.outlineOffset = '2px';
      window.DataScraperHighlightManager._elements.push(element);
    },

    /**
     * Clear all highlights
     */
    clear: () => {
      window.DataScraperHighlightManager._elements.forEach(el => {
        if (el && el.style) {
          el.style.outline = '';
          el.style.outlineOffset = '';
        }
      });
      window.DataScraperHighlightManager._elements = [];
    },

    /**
     * Highlight elements by selector
     * @param {string} selector - CSS selector
     * @returns {number} Number of elements highlighted
     */
    highlightBySelector: (selector) => {
      const DOMUtils = window.DataScraperDOMUtils;
      
      // Clear previous highlights
      window.DataScraperHighlightManager.clear();
      
      if (!selector) return 0;

      try {
        const elements = DOMUtils.safeQueryAll(selector);
        elements.forEach(el => window.DataScraperHighlightManager.highlight(el));
        return elements.length;
      } catch (error) {
        console.error('[HighlightManager] Error highlighting:', error);
        return 0;
      }
    }
  };
})();

