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
      
      // Set defaults: autoExportEnabled=true, manualExportFormat=csv
      chrome.storage.local.get(['autoExportEnabled', 'manualExportFormat'], (result) => {
        if (result.autoExportEnabled === undefined) {
          chrome.storage.local.set({ autoExportEnabled: true });
        }
        if (!result.manualExportFormat) {
          chrome.storage.local.set({ manualExportFormat: 'csv' });
        }
      });
      
      // Listen for details scraping completion
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Auto-export batch được xử lý trong background script
        // Không cần xử lý ở đây nữa để tránh hiện modal
        if (message.action === 'autoExportBatch') {
          // Just acknowledge - background script will handle it
          sendResponse({ success: true });
          return true;
        }
        
        if (message.action === 'detailsScrapingComplete') {
          const details = message.data || [];
          const failedLinks = message.failedLinks || [];
          
          if (!details || details.length === 0) {
            // Fallback: try to load from storage
            setTimeout(() => {
              const savedDetailData = window.PopupState.getDetailData();
              if (savedDetailData && savedDetailData.length > 0) {
                window.PopupDisplay.displayResults(savedDetailData, { 
                  maxProducts: savedDetailData.length 
                });
                window.PopupDisplay.showMessage(
                  `✅ Đã khôi phục ${savedDetailData.length} chi tiết sản phẩm`, 
                  'success'
                );
              } else {
                console.error('[PopupMain] No data found in storage');
                window.PopupDisplay.showMessage('Không tìm thấy dữ liệu. Vui lòng scrape lại.', 'error');
              }
            }, 500);
            sendResponse({ success: true });
            return true;
          }
          
          window.PopupState.setDetailData(details);
          if (failedLinks.length > 0 && window.PopupState.setFailedLinks) {
            window.PopupState.setFailedLinks(failedLinks);
          }
          
          // Force display results section with data
          if (details && details.length > 0) {
            window.PopupDisplay.displayResults(details, { 
              maxProducts: message.maxProducts || details.length 
            });
            
            // Check if manual export format was selected (from 1click button)
            // Auto-export is handled in content.js/background.js, not here
            chrome.storage.local.get(['manualExportFormat'], (result) => {
              const manualFormat = result.manualExportFormat;
              
              // Only export manually if format was selected (from 1click button)
              // Don't export here if auto-export is enabled (already handled in background)
              if (manualFormat && details.length > 0) {
                // Clear manual format after use
                chrome.storage.local.remove(['manualExportFormat'], () => {
                  // Export with selected format (no modal, format already chosen)
                  window.DataScraperExportHandler.exportData(manualFormat, details);
                });
              }
            });
          }
          
          // Hide processing status
          const processingStatus = document.getElementById('processingStatus');
          if (processingStatus) {
            processingStatus.style.display = 'none';
          }
          
          // Chỉ hiện 1 line message ngắn gọn
          const maxProducts = message.maxProducts || details.length;
          const failedCount = failedLinks.length || 0;
          const autoExportMsg = document.getElementById('autoExportCSV')?.checked 
            ? ' (đang tự động export...)' 
            : '';
          window.PopupDisplay.showMessage(
            `✅ Đã scrape thành công ${details.length}/${maxProducts} sản phẩm${autoExportMsg}` +
            (failedCount ? ` (❌ lỗi: ${failedCount})` : ''),
            'success'
          );
          
          sendResponse({ success: true });
        }
        return true;
      });
      
      // Restore and display saved data if exists (priority: detail > list)
      // Wait a bit to ensure loadSavedData is complete
      setTimeout(() => {
        const savedDetailData = window.PopupState.getDetailData();
        const savedListData = window.PopupState.getListData();
        
        // NEW WORKFLOW: Check if user clicked popup after scraping is complete (has badge)
        // If has data and badge, trigger export automatically
        chrome.storage.local.get(['autoExportEnabled', 'manualExportFormat', 'titleSlug'], (result) => {
          const autoExportEnabled = result.autoExportEnabled !== false; // Default true
          const manualExportFormat = result.manualExportFormat || 'csv'; // Default csv
          const titleSlug = result.titleSlug || '';
          
          // Check if we have scraped data and should trigger export
          if (savedDetailData && Array.isArray(savedDetailData) && savedDetailData.length > 0) {
            const totalItems = savedDetailData.length;
            
            // Check if export was already done or auto-export is in progress
            chrome.storage.local.get(['exportCompleted', 'currentExportBatch', 'autoExportEnabled'], (exportCheck) => {
              const isAutoExportEnabled = exportCheck.autoExportEnabled !== false; // Default true
              const isExportCompleted = exportCheck.exportCompleted === true;
              const isAutoExportInProgress = exportCheck.currentExportBatch !== undefined;
              
              // If auto-export is enabled and > 100 items, auto-export should have been triggered
              // Don't export again if already completed or in progress
              if (isExportCompleted || (isAutoExportEnabled && totalItems > 100 && isAutoExportInProgress)) {
                // Clear badge tick xanh khi export đã hoàn thành
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  if (tabs && tabs.length > 0 && tabs[0].id) {
                    chrome.runtime.sendMessage({
                      action: 'clearBadge',
                      tabId: tabs[0].id
                    });
                  }
                });
                // Already exported or auto-exporting, just show success message
                window.PopupDisplay.displayResults(savedDetailData, { 
                  maxProducts: savedDetailData.length 
                });
                const message = isAutoExportInProgress 
                  ? `✅ Đã scrape ${totalItems} sản phẩm. Đang tự động export...`
                  : `✅ Đã scrape và export thành công ${totalItems} sản phẩm. Hoàn tất!`;
                window.PopupDisplay.showMessage(message, 'success');
                return;
              }
              
              // If auto-export is enabled and > 100 items, don't trigger manual export
              // Auto-export should have been triggered from content.js
              if (isAutoExportEnabled && totalItems > 100) {
                window.PopupDisplay.displayResults(savedDetailData, { 
                  maxProducts: savedDetailData.length 
                });
                window.PopupDisplay.showMessage(
                  `✅ Đã scrape ${totalItems} sản phẩm. Auto-export đang chạy...`, 
                  'success'
                );
                return;
              }
              
              // Check if badge exists (scraping is complete) - trigger export
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs.length > 0 && tabs[0].id) {
                  // Check badge by trying to get badge text
                  chrome.action.getBadgeText({ tabId: tabs[0].id }, (badgeText) => {
                    const hasBadge = badgeText && badgeText.length > 0;
                    
                    if (hasBadge || true) { // Always trigger export when popup is opened with data
                      // Show loading modal
                      const loadingModal = document.getElementById('exportLoadingModal');
                      const loadingText = document.getElementById('exportLoadingText');
                      if (loadingModal) {
                        loadingModal.style.display = 'flex';
                        if (loadingText) {
                          loadingText.textContent = `Đang export ${totalItems} sản phẩm...`;
                        }
                      }
                      
                      // Trigger export with format
                      setTimeout(() => {
                        window.DataScraperExportHandler.exportData(manualExportFormat, savedDetailData);
                      }, 500);
                    } else {
                      // No badge, just show data
                      window.PopupDisplay.displayResults(savedDetailData, { 
                        maxProducts: savedDetailData.length 
                      });
                      window.PopupDisplay.showMessage(
                        `✅ Đã scrape ${totalItems} sản phẩm. Click lại để export.`, 
                        'success'
                      );
                    }
                  });
                }
              });
            });
          } else if (savedListData && Array.isArray(savedListData) && savedListData.length > 0) {
            // List data - just show
            window.PopupDisplay.displayResults(savedListData, { 
              maxProducts: savedListData.length 
            });
            window.PopupDisplay.showMessage(
              `✅ Đã khôi phục ${savedListData.length} sản phẩm trong danh sách từ lần scrape trước`, 
              'success'
            );
          }
        });
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
        // Show format selection modal
        window.DataScraperExportHandler.exportData(null, data);
      });
    }

    const exportCSVBtn = document.getElementById('exportCSV');
    if (exportCSVBtn) {
      exportCSVBtn.addEventListener('click', () => {
        const data = window.PopupState.getData();
        // Show format selection modal
        window.DataScraperExportHandler.exportData(null, data);
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

    // Auto-check export checkbox when maxProducts > 100 (but allow check/uncheck if <= 100)
    const maxProductsInput = document.getElementById('maxProducts');
    const autoExportCheckbox = document.getElementById('autoExportCSV');
    if (maxProductsInput && autoExportCheckbox) {
      let preventUncheckHandler = null;
      
      const updateCheckboxState = () => {
        const value = parseInt(maxProductsInput.value) || 0;
        
        // Remove previous prevent handler if exists
        if (preventUncheckHandler) {
          autoExportCheckbox.removeEventListener('click', preventUncheckHandler);
          preventUncheckHandler = null;
        }
        
        if (value > 100) {
          // Auto-check if > 100
          autoExportCheckbox.checked = true;
          // Save auto-export state to storage
          chrome.storage.local.set({ autoExportEnabled: true });
          
          // Prevent uncheck when > 100
          preventUncheckHandler = (e) => {
            if (!autoExportCheckbox.checked) {
              // If trying to uncheck, prevent it and keep checked
              e.preventDefault();
              autoExportCheckbox.checked = true;
            }
          };
          autoExportCheckbox.addEventListener('click', preventUncheckHandler);
          
          // Update label to show it's auto-enabled
          const label = autoExportCheckbox.closest('label');
          if (label) {
            const span = label.querySelector('span');
            if (span) {
              span.style.color = '#666';
              span.style.fontStyle = 'italic';
            }
          }
        } else {
          // Allow check/uncheck freely if <= 100
          // Save auto-export state to storage
          chrome.storage.local.set({ autoExportEnabled: autoExportCheckbox.checked });
          
          // Reset label style
          const label = autoExportCheckbox.closest('label');
          if (label) {
            const span = label.querySelector('span');
            if (span) {
              span.style.color = '';
              span.style.fontStyle = '';
            }
          }
        }
      };
      
      // Listen to checkbox changes
      autoExportCheckbox.addEventListener('change', () => {
        const value = parseInt(maxProductsInput.value) || 0;
        // Only save if <= 100 (if > 100, it's always true)
        if (value <= 100) {
          chrome.storage.local.set({ autoExportEnabled: autoExportCheckbox.checked });
        }
      });
      
      // Check on load
      updateCheckboxState();
      
      // Check on change
      maxProductsInput.addEventListener('input', updateCheckboxState);
    }

    // Export format modal handlers
    setupExportFormatModal();
    
    // Export complete modal handlers
    setupExportCompleteModal();
    
    // Export loading modal handlers
    setupExportLoadingModal();
  }
  
  /**
   * Setup export loading modal
   */
  function setupExportLoadingModal() {
    // Modal will be shown/hidden by export handler
    // No user interaction needed
  }

  /**
   * Setup export format selection modal
   */
  function setupExportFormatModal() {
    const formatModal = document.getElementById('exportFormatModal');
    const cancelBtn = document.getElementById('cancelExportFormat');
    const confirmBtn = document.getElementById('confirmExportFormat');
    let selectedFormat = 'csv'; // Default

    // Format option selection
    if (formatModal) {
      const options = formatModal.querySelectorAll('.modal-option[data-format]');
      options.forEach(option => {
        option.addEventListener('click', () => {
          options.forEach(opt => opt.classList.remove('selected'));
          option.classList.add('selected');
          selectedFormat = option.dataset.format;
        });
      });

      // Set default selection
      const defaultOption = formatModal.querySelector('.modal-option[data-format="csv"]');
      if (defaultOption) {
        defaultOption.classList.add('selected');
      }
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (formatModal) formatModal.style.display = 'none';
        window.DataScraperExportHandler._resetExportState();
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (formatModal) formatModal.style.display = 'none';
        // Use pending data if available (from auto-export), otherwise get from state
        const data = window.DataScraperExportHandler._pendingExportData || window.PopupState.getData();
        if (data && data.length > 0) {
          window.DataScraperExportHandler._pendingExportData = null; // Clear
          window.DataScraperExportHandler.exportData(selectedFormat, data);
        }
      });
    }
  }

  /**
   * Setup export complete modal
   */
  function setupExportCompleteModal() {
    const completeModal = document.getElementById('exportCompleteModal');
    const closeBtn = document.getElementById('closeExportComplete');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (completeModal) completeModal.style.display = 'none';
      });
    }

    if (completeModal) {
      completeModal.addEventListener('click', (e) => {
        if (e.target === completeModal) {
          completeModal.style.display = 'none';
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

