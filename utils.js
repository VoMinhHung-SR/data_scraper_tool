(() => {
  'use strict';

  // ============================================
  // 🔧 UTILITY FUNCTIONS (Backward Compatibility Layer)
  // ============================================
  // This file now delegates to the new modular structure
  // while maintaining backward compatibility
  
  window.DataScraperUtils = {
    // ============================================
    // DOM UTILITIES (delegate to dom-utils.js)
    // ============================================
    safeQuery: (selector, context = document) => {
      return window.DataScraperDOMUtils.safeQuery(selector, context);
    },

    safeQueryAll: (selector, context = document) => {
      return window.DataScraperDOMUtils.safeQueryAll(selector, context);
    },

    getText: (element, maxLength = null) => {
      return window.DataScraperDOMUtils.getText(element, maxLength);
    },

    findContainer: (containerSelector = null) => {
      return window.DataScraperDOMUtils.findContainer(containerSelector);
    },

    findParentContainer: (productContainer) => {
      return window.DataScraperDOMUtils.findParentContainer ? 
        window.DataScraperDOMUtils.findParentContainer(productContainer) : 
        (productContainer?.parentElement || productContainer);
    },

    isVisible: (element) => {
      return window.DataScraperDOMUtils.isVisible(element);
    },

    isInViewport: (element) => {
      return window.DataScraperDOMUtils.isInViewport(element);
    },

    // ============================================
    // SELECTOR UTILITIES (delegate to selector-utils.js)
    // ============================================
    findBestSelector: (selectors, minCount = 3) => {
      return window.DataScraperSelectorUtils.findBestSelector(selectors, minCount);
    },

    autoDetectProductSelector: () => {
      return window.DataScraperSelectorUtils.autoDetectProductSelector();
    },

    findNextPageButton: (customSelector = null) => {
      return window.DataScraperSelectorUtils.findNextPageButton(customSelector);
    },

    findLoadMoreButton: (customSelector = null, container = null) => {
      return window.DataScraperSelectorUtils.findLoadMoreButton(customSelector, container);
    },

    testSelector: (selector, sampleSize = 5) => {
      return window.DataScraperSelectorUtils.testSelector(selector, sampleSize);
    },

    // ============================================
    // EXTRACTION UTILITIES (delegate to extraction-utils.js)
    // ============================================
    extractProductInfo: (item, link) => {
      return window.DataScraperExtractionUtils.extractProductInfo(item, link);
    },

    extractName: (card, link) => {
      return window.DataScraperExtractionUtils.extractName(card, link);
    },

    extractPrice: (card) => {
      return window.DataScraperExtractionUtils.extractPrice(card);
    },

    extractImage: (card, link) => {
      return window.DataScraperExtractionUtils.extractImage(card, link);
    },

    extractPackage: (card) => {
      return window.DataScraperExtractionUtils.extractPackage(card);
    },

    extractSKU: (container) => {
      return window.DataScraperExtractionUtils.extractSKU(container);
    },

    extractBrand: (container) => {
      return window.DataScraperExtractionUtils.extractBrand(container);
    },

    extractSpecifications: (container) => {
      return window.DataScraperExtractionUtils.extractSpecifications(container);
    },

    cleanSectionText: (text) => {
      return window.DataScraperExtractionUtils.cleanSectionText(text);
    }
  };
})();