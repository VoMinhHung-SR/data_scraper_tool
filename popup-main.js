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
        // Auto-export batch được xử lý trong background script
        // Không cần xử lý ở đây nữa để tránh hiện modal
        if (message.action === 'autoExportBatch') {
          // Just acknowledge - background script will handle it
          sendResponse({ success: true });
          return true;
        }
        
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
            
            // Check if manual export format was selected (from 1click button)
            // Auto-export is handled in content.js/background.js, not here
            chrome.storage.local.get(['manualExportFormat'], (result) => {
              const manualFormat = result.manualExportFormat;
              
              // Only export manually if format was selected (from 1click button)
              // Don't export here if auto-export is enabled (already handled in background)
              if (manualFormat && details.length > 0) {
                console.log('[PopupMain] Manual export (1click) - using format:', manualFormat);
                
                // Clear manual format after use
                chrome.storage.local.remove(['manualExportFormat'], () => {
                  // Export with selected format (no modal, format already chosen)
                  window.DataScraperExportHandler.exportData(manualFormat, details);
                });
              } else {
                console.log('[PopupMain] No manual export format found, skipping export (auto-export handled separately)');
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
          const autoExportMsg = document.getElementById('autoExportCSV')?.checked 
            ? ' (đang tự động export...)' 
            : '';
          window.PopupDisplay.showMessage(
            `✅ Đã scrape thành công ${details.length}/${maxProducts} sản phẩm${autoExportMsg}`, 
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
        
        // Check export state - if auto-export is in progress or completed, only show success message
        chrome.storage.local.get(['scraper_export_state', 'autoExportEnabled'], (exportResult) => {
          const exportState = exportResult.scraper_export_state || {};
          const autoExportEnabled = exportResult.autoExportEnabled;
          const hasExportState = exportState.lastExportedIndex !== undefined;
          const isAutoExportEnabled = autoExportEnabled === true || autoExportEnabled === undefined;
          
          // If auto-export is enabled and has export state, only show success message (no export modal)
          if (hasExportState && isAutoExportEnabled) {
            const lastExported = exportState.lastExportedIndex || 0;
            const totalLimit = exportState.totalLimit || 0;
            const isComplete = totalLimit > 0 && lastExported >= totalLimit;
            
            if (savedDetailData && Array.isArray(savedDetailData) && savedDetailData.length > 0) {
              console.log('[PopupMain] Auto-export in progress, showing success message only');
              window.PopupDisplay.displayResults(savedDetailData, { 
                maxProducts: savedDetailData.length 
              });
              
              if (isComplete) {
                window.PopupDisplay.showMessage(
                  `✅ Đã scrape và export thành công ${totalLimit} sản phẩm. Hoàn tất!`, 
                  'success'
                );
                // Show badge if workflow complete
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  if (tabs && tabs.length > 0 && tabs[0].id) {
                    chrome.runtime.sendMessage({
                      action: 'workflowComplete'
                    });
                  }
                });
              } else {
                window.PopupDisplay.showMessage(
                  `✅ Đã scrape ${savedDetailData.length} sản phẩm. Đã export ${lastExported}/${totalLimit} items. Đang tiếp tục...`, 
                  'success'
                );
              }
            } else if (savedListData && Array.isArray(savedListData) && savedListData.length > 0) {
              console.log('[PopupMain] Auto-export in progress, showing success message only');
              window.PopupDisplay.displayResults(savedListData, { 
                maxProducts: savedListData.length 
              });
              window.PopupDisplay.showMessage(
                `✅ Đã scrape ${savedListData.length} sản phẩm. Đã export ${lastExported}/${totalLimit} items. Đang tiếp tục...`, 
                'success'
              );
            }
            return; // Don't trigger export modal
          }
          
          // Normal restore (no auto-export or export state)
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

    // Auto-check and disable export checkbox when maxProducts > 100
    const maxProductsInput = document.getElementById('maxProducts');
    const autoExportCheckbox = document.getElementById('autoExportCSV');
    if (maxProductsInput && autoExportCheckbox) {
      const updateCheckboxState = () => {
        const value = parseInt(maxProductsInput.value) || 0;
        if (value > 100) {
          autoExportCheckbox.checked = true;
          autoExportCheckbox.disabled = true;
          // Save auto-export state to storage
          chrome.storage.local.set({ autoExportEnabled: true });
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
          autoExportCheckbox.disabled = false;
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
        chrome.storage.local.set({ autoExportEnabled: autoExportCheckbox.checked });
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

