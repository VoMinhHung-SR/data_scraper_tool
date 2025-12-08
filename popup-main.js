(() => {
  'use strict';

  // ============================================
  // 🚀 POPUP MAIN
  // ============================================
  // Main entry point for popup

  /**
   * Initialize popup
   */
  async function init() {
    try {
      const tab = await window.PopupState.init();
      setupEventListeners(tab);
      window.PopupDisplay.loadPageInfo(tab);
      
      // Listen for details scraping completion
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'detailsScrapingComplete') {
          window.PopupState.setData(message.data);
          window.PopupDisplay.displayResults(message.data);
          window.PopupDisplay.showMessage(`Đã scrape thành công ${message.data.length} chi tiết sản phẩm!`, 'success');
          sendResponse({ success: true });
        }
        return true;
      });
    } catch (error) {
      console.error('Init error:', error);
      window.PopupDisplay.showMessage('Lỗi khởi tạo: ' + error.message, 'error');
    }
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners(tab) {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const tabName = tabBtn.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        tabBtn.classList.add('active');
        const targetTab = document.getElementById(`${tabName}Tab`);
        if (targetTab) targetTab.classList.add('active');
      });
    });

    // Quick scrape buttons (Generic)
    const quickScrapes = {
      'scrapeTable': () => window.DataScraperGenericHandlers.handleQuickScrape('table', tab),
      'scrapeLinks': () => window.DataScraperGenericHandlers.handleQuickScrape('links', tab),
      'scrapeImages': () => window.DataScraperGenericHandlers.handleQuickScrape('images', tab),
      'scrapeProducts': () => window.DataScraperGenericHandlers.handleQuickScrape('products', tab)
    };
    
    Object.entries(quickScrapes).forEach(([id, handler]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    });

    // Generic handlers
    const autoDetectBtn = document.getElementById('autoDetectSelector');
    if (autoDetectBtn) {
      autoDetectBtn.addEventListener('click', () => window.DataScraperGenericHandlers.handleAutoDetect(tab));
    }

    const testBtn = document.getElementById('testSelector');
    if (testBtn) {
      testBtn.addEventListener('click', () => window.DataScraperGenericHandlers.handleTestSelector(tab));
    }

    const scrapeCustomBtn = document.getElementById('scrapeCustom');
    if (scrapeCustomBtn) {
      scrapeCustomBtn.addEventListener('click', () => window.DataScraperGenericHandlers.handleCustomScrape(tab));
    }

    const highlightBtn = document.getElementById('highlightSelector');
    if (highlightBtn) {
      highlightBtn.addEventListener('click', () => window.DataScraperGenericHandlers.handleHighlight(tab));
    }

    // E-commerce handlers
    const scrapeManyBtn = document.getElementById('scrapeManyProducts');
    if (scrapeManyBtn) {
      scrapeManyBtn.addEventListener('click', () => window.DataScraperEcommerceHandlers.handleScrapeManyProducts(tab));
    }

    const scrapePaginationBtn = document.getElementById('scrapeWithPagination');
    if (scrapePaginationBtn) {
      scrapePaginationBtn.addEventListener('click', () => window.DataScraperEcommerceHandlers.handleScrapeWithPagination(tab));
    }

    const scrapeDetailBtn = document.getElementById('scrapeProductDetail');
    if (scrapeDetailBtn) {
      scrapeDetailBtn.addEventListener('click', () => window.DataScraperEcommerceHandlers.handleScrapeProductDetail(tab));
    }
    
    const scrapeDetailsFromListBtn = document.getElementById('scrapeDetailsFromList');
    if (scrapeDetailsFromListBtn) {
      scrapeDetailsFromListBtn.addEventListener('click', () => window.DataScraperEcommerceHandlers.handleScrapeDetailsFromList(tab));
    }

    const scrapeAPIBtn = document.getElementById('scrapeFromAPI');
    if (scrapeAPIBtn) {
      scrapeAPIBtn.addEventListener('click', () => window.DataScraperEcommerceHandlers.handleScrapeFromAPI(tab));
    }

    const scrapeLongChauBtn = document.getElementById('scrapeLongChauAPI');
    if (scrapeLongChauBtn) {
      scrapeLongChauBtn.addEventListener('click', () => window.DataScraperEcommerceHandlers.handleScrapeLongChauAPI(tab));
    }

    // Export buttons
    const exportJSONBtn = document.getElementById('exportJSON');
    if (exportJSONBtn) {
      exportJSONBtn.addEventListener('click', () => {
        const data = window.PopupState.getData();
        window.DataScraperExportHandler.exportData('json', data);
      });
    }

    const exportCSVBtn = document.getElementById('exportCSV');
    if (exportCSVBtn) {
      exportCSVBtn.addEventListener('click', () => {
        const data = window.PopupState.getData();
        window.DataScraperExportHandler.exportData('csv', data);
      });
    }

    const clearBtn = document.getElementById('clearResults');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        window.PopupState.clear();
        window.PopupDisplay.clearResults();
      });
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

