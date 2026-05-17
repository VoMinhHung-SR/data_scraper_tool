(() => {
  'use strict';

  // ============================================
  // 📋 LIST SCRAPER
  // ============================================
  // Product list scraping logic (scrape multiple product details from URLs)
  window.DataScraperListScraper = {
    /**
     * Scrape detail cho nhiều products từ list URLs (dùng storage state)
     * Navigate qua từng URL và scrape detail, lưu vào storage
     */
    scrapeProductDetailsFromList: async (productLinks, options = {}) => {
      const { maxDetails = 100 } = options;
      const links = Array.isArray(productLinks) ? productLinks : [];
      const total = Math.min(links.length, maxDetails);
      
      if (total === 0) {
        return [];
      }

      // Normalize links
      let normalizedLinks = links.slice(0, total).map(link => 
        typeof link === 'string' ? link : (link.link || link.url || '')
      ).filter(link => link && link.includes('.html'));

      // Shuffle links to avoid predictable scraping patterns (bot detection)
      for (let i = normalizedLinks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [normalizedLinks[i], normalizedLinks[j]] = [normalizedLinks[j], normalizedLinks[i]];
      }

      if (normalizedLinks.length === 0) {
        return [];
      }

      // Lưu state vào storage để auto-scrape khi navigate
      const stateKey = 'scrapeDetailsState';
      const state = {
        links: normalizedLinks,
        currentIndex: 0,
        details: [],
        maxDetails: maxDetails, // Store maxDetails limit
        forceAPI: options.forceAPI || false, // Store forceAPI option
        delay: options.delay || 5000, // Store delay option
        startedAt: Date.now(),
        failedLinks: [],
        attempts: {},
        skip: options.skip || 0 // Store skip value to calculate actual item number (1-based)
      };
      
      // Create progress indicator
      if (window.DataScraperProgressIndicator) {
        window.DataScraperProgressIndicator.create();
        window.DataScraperProgressIndicator.update(0);
      }
      
      // Clear auto-export flags when starting new scrape
      await new Promise(resolve => {
        chrome.storage.local.remove(['autoExportTriggered', 'exportCompleted', 'currentExportBatch', 'autoExportBatchInfo'], () => {
          chrome.storage.local.set({ [stateKey]: state }, () => {
            resolve();
          });
        });
      });

      // Navigate to first product (auto-scrape sẽ tiếp tục)
      const firstLink = normalizedLinks[0];
      const baseDelay = options.delay || 5000;
      const jitter = Math.floor(Math.random() * 1500);
      
      setTimeout(() => {
        window.location.href = firstLink;
      }, baseDelay + jitter);
      
      // Return empty - details will be collected via storage and sent to popup
      return [];
    }
  };
})();
