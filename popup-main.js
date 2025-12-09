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
          console.log('[PopupMain] Received detailsScrapingComplete:', {
            dataLength: message.data?.length || 0,
            maxProducts: message.maxProducts,
            hasData: !!message.data
          });
          
          const details = message.data || [];
          
          if (!details || details.length === 0) {
            console.warn('[PopupMain] No details data received, checking storage...');
            // Fallback: try to load from storage
            setTimeout(() => {
              const savedDetailData = window.PopupState.getDetailData();
              if (savedDetailData && savedDetailData.length > 0) {
                console.log('[PopupMain] Found data in storage, displaying...');
                window.PopupDisplay.displayResults(savedDetailData, { 
                  maxProducts: savedDetailData.length 
                });
                window.PopupDisplay.showMessage(
                  `✅ Đã khôi phục ${savedDetailData.length} chi tiết sản phẩm`, 
                  'success'
                );
              } else {
                console.error('[PopupMain] No data found in storage either');
                window.PopupDisplay.showMessage('Không tìm thấy dữ liệu. Vui lòng scrape lại.', 'error');
              }
            }, 500);
            sendResponse({ success: true });
            return true;
          }
          
          console.log('[PopupMain] Setting detail data and displaying...', details.length);
          window.PopupState.setDetailData(details);
          
          // Force display results section with data
          if (details && details.length > 0) {
            console.log('[PopupMain] Calling displayResults with', details.length, 'items');
            window.PopupDisplay.displayResults(details, { 
              maxProducts: message.maxProducts || details.length 
            });
          }
          
          // Hide processing status
          const processingStatus = document.getElementById('processingStatus');
          if (processingStatus) {
            processingStatus.style.display = 'none';
          }
          
          // Chỉ hiện 1 line message ngắn gọn
          const maxProducts = message.maxProducts || details.length;
          window.PopupDisplay.showMessage(
            `✅ Đã scrape thành công ${details.length}/${maxProducts} sản phẩm`, 
            'success'
          );
          
          sendResponse({ success: true });
        }
        return true;
      });
      
      // Restore and display saved data if exists (priority: detail > list)
      // Wait a bit to ensure loadSavedData is complete
      setTimeout(() => {
        console.log('[PopupMain] Checking for saved data to restore...');
        const savedDetailData = window.PopupState.getDetailData();
        const savedListData = window.PopupState.getListData();
        
        console.log('[PopupMain] Saved data:', {
          detailLength: savedDetailData?.length || 0,
          listLength: savedListData?.length || 0
        });
        
        if (savedDetailData && Array.isArray(savedDetailData) && savedDetailData.length > 0) {
          console.log('[PopupMain] Restoring detail data:', savedDetailData.length, 'items');
          // Restore detail data and show modal
          window.PopupDisplay.displayResults(savedDetailData, { 
            maxProducts: savedDetailData.length 
          });
          window.PopupDisplay.showMessage(
            `✅ Đã khôi phục ${savedDetailData.length} chi tiết sản phẩm từ lần scrape trước`, 
            'success'
          );
        } else if (savedListData && Array.isArray(savedListData) && savedListData.length > 0) {
          console.log('[PopupMain] Restoring list data:', savedListData.length, 'items');
          // Restore list data and show modal
          window.PopupDisplay.displayResults(savedListData, { 
            maxProducts: savedListData.length 
          });
          window.PopupDisplay.showMessage(
            `✅ Đã khôi phục ${savedListData.length} sản phẩm trong danh sách từ lần scrape trước`, 
            'success'
          );
        } else {
          console.log('[PopupMain] No saved data to restore');
        }
      }, 500); // Increase timeout to ensure DOM is ready
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

    const scrapeListAndDetailsBtn = document.getElementById('scrapeListAndDetails');
    if (scrapeListAndDetailsBtn) {
      scrapeListAndDetailsBtn.addEventListener('click', () => window.DataScraperEcommerceHandlers.handleScrapeListAndDetails(tab));
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

    // Close results modal button
    const closeResultsModalBtn = document.getElementById('closeResultsModal');
    if (closeResultsModalBtn) {
      closeResultsModalBtn.addEventListener('click', () => {
        const resultsModal = document.getElementById('resultsModal');
        if (resultsModal) {
          resultsModal.style.display = 'none';
          resultsModal.classList.remove('active');
        }
      });
    }

    // Close results modal when clicking outside
    const resultsModal = document.getElementById('resultsModal');
    if (resultsModal) {
      resultsModal.addEventListener('click', (e) => {
        if (e.target === resultsModal) {
          resultsModal.style.display = 'none';
          resultsModal.classList.remove('active');
        }
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

