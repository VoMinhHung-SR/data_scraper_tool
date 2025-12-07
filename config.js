(() => {
  'use strict';

  // ============================================
  // ⚙️ CONFIG & LOGGING
  // ============================================
  window.DataScraperConfig = {
    verbose: true
  };

  window.DataScraperLog = (msg, icon = '✅') => {
    if (window.DataScraperConfig.verbose) {
      console.log(`${icon} [DataScraper] ${msg}`);
    }
  };
})();

