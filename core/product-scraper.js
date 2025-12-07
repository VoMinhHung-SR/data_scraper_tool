(() => {
  'use strict';

  // ============================================
  // 🛍️ PRODUCT SCRAPER
  // ============================================
  // Product list scraping (simple, pagination, scroll)
  window.DataScraperProductScraper = {
    /**
     * Simple product scraping (single page)
     * @returns {Array}
     */
    scrapeProducts: () => {
      const Utils = window.DataScraperUtils;
      const log = window.DataScraperLog;
      
      try {
        const productSelectors = [
          '.product',
          '.product-item',
          '.product-card',
          '[class*="product"]',
          '[data-product]'
        ];

        for (const selector of productSelectors) {
          const elements = Utils.safeQueryAll(selector);
          if (elements.length > 0) {
            const products = elements.map(el => {
              const product = {
                name: Utils.getText(Utils.safeQuery('h1, h2, h3, .product-name, [class*="name"]', el)),
                price: Utils.getText(Utils.safeQuery('.price, [class*="price"]', el)),
                image: Utils.safeQuery('img', el)?.src || '',
                link: Utils.safeQuery('a', el)?.href || '',
                description: Utils.getText(Utils.safeQuery('.description, [class*="desc"]', el))
              };
              return product;
            }).filter(p => p.name || p.price);

            log(`Scraped ${products.length} products`, '🛍️');
            return products;
          }
        }

        return [];
      } catch (error) {
        log(`Lỗi khi scrape products: ${error.message}`, '❌');
        return [];
      }
    },

    /**
     * Scrape products with pagination
     * @param {Object} options - Options
     * @returns {Promise<Array>}
     */
    scrapeProductsWithPagination: async (options = {}) => {
      const PaginationHandler = window.DataScraperPaginationHandler;
      return PaginationHandler.scrapeWithPagination(options);
    },

    /**
     * Scrape products with scroll
     * @param {Object} options - Options
     * @returns {Promise<Array>}
     */
    scrapeProductsWithScroll: async (options = {}) => {
      const PaginationHandler = window.DataScraperPaginationHandler;
      return PaginationHandler.scrapeWithScroll(options);
    }
  };
})();

