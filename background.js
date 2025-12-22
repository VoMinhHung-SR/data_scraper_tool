(() => {
  'use strict';

  // ============================================
  // ⚙️ CONFIG
  // ============================================
  const CONFIG = {
    MAX_DATA_URL_SIZE: 2 * 1024 * 1024, // 2MB
  };

  // ============================================
  // 🔧 UTILITY FUNCTIONS
  // ============================================
  const Utils = {
    // Encode content to base64 data URL
    encodeToDataURL: (content, mimeType) => {
      try {
        const processedContent = mimeType.includes('csv') ? '\ufeff' + content : content;
        const base64Content = btoa(unescape(encodeURIComponent(processedContent)));
        return `data:${mimeType};charset=utf-8;base64,${base64Content}`;
      } catch (error) {
        throw new Error(`Failed to encode content: ${error.message}`);
      }
    },

    // Get content size in bytes
    getContentSize: (content) => {
      try {
        return new TextEncoder().encode(content).length;
      } catch (error) {
        // Fallback for older browsers
        return content.length * 2; // Approximate UTF-16 size
      }
    }
  };

  // ============================================
  // 📥 DOWNLOAD HANDLER
  // ============================================
  const DownloadHandler = {
    handleDownload: (request, sendResponse) => {
      try {
        const { content, filename, mimeType } = request;

        // Validate inputs
        if (!content || !filename || !mimeType) {
          sendResponse({
            success: false,
            error: 'Missing required parameters: content, filename, or mimeType'
          });
          return true;
        }

        // Check file size
        const contentSize = Utils.getContentSize(content);
        if (contentSize > CONFIG.MAX_DATA_URL_SIZE) {
          sendResponse({
            success: false,
            error: 'FILE_TOO_LARGE',
            message: `File quá lớn (${(contentSize / 1024 / 1024).toFixed(2)}MB). Vui lòng download từ popup.`
          });
          return true;
        }

        // Create data URL and download
        const dataUrl = Utils.encodeToDataURL(content, mimeType);
        
        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: false // Auto-save to default downloads folder
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            // USER_CANCELED is not really an error - user just canceled the dialog
            if (errorMsg.includes('USER_CANCELED')) {
              sendResponse({
                success: false,
                error: 'USER_CANCELED',
                message: 'User canceled download'
              });
            } else {
              sendResponse({
                success: false,
                error: errorMsg
              });
            }
          } else {
            sendResponse({
              success: true,
              downloadId: downloadId,
              size: contentSize
            });
          }
        });

        return true; // Keep channel open for async response
      } catch (error) {
        sendResponse({
          success: false,
          error: error.message
        });
        return true;
      }
    }
  };

  // ============================================
  // 📤 AUTO EXPORT HANDLER (Background)
  // ============================================
  const AutoExportHandler = {
    // Helper: Normalize text to slug format
    _normalizeToSlug: (text) => {
      return text.toLowerCase()
        .replace(/[,\s]+/g, '-')
        .replace(/[^a-z0-9\-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    },

    // Extract category slug from data
    // Converts "Thuốc/Thuốc giải độc, khử độc và hỗ trợ cai nghiện" 
    // to "thuoc-thuocgiaidoc-khudoc-hotrocainghien"
    extractCategorySlug: (data) => {
      if (!data?.length) return 'products';
      
      const firstItem = data[0];
      if (!firstItem) return 'products';
      
      // Priority 1: Use categorySlug if available
      if (firstItem.categorySlug) {
        return firstItem.categorySlug
          .split(/[\/>]/)
          .map(c => AutoExportHandler._normalizeToSlug(c.trim()))
          .filter(c => c)
          .join('-');
      }
      
      // Priority 2: Extract from categoryPath
      if (firstItem.categoryPath) {
        return firstItem.categoryPath
          .split(/[\/>]/)
          .map(c => c.trim())
          .filter(c => c && !c.match(/trang\s+chủ|homepage/i))
          .map(c => AutoExportHandler._normalizeToSlug(c))
          .join('-');
      }
      
      // Priority 3: Extract from category array
      if (Array.isArray(firstItem.category) && firstItem.category.length > 0) {
        return firstItem.category
          .map(c => AutoExportHandler._normalizeToSlug((c.slug || c.name || c).toString()))
          .filter(c => c)
          .join('-');
      }
      
      // Priority 4: Extract from URL
      if (firstItem.link) {
        const match = firstItem.link.match(/\/([^\/]+)\/[^\/]+\.html/);
        if (match) {
          return AutoExportHandler._normalizeToSlug(match[1]);
        }
      }
      
      return 'products';
    },

    // Convert data to CSV
    convertToCSV: (data) => {
      if (!data || data.length === 0) return '';
      
      // Collect all headers from data
      const headers = new Set();
      data.forEach(item => {
        if (item && typeof item === 'object') {
          const flatten = (obj, prefix = '') => {
            Object.keys(obj).forEach(key => {
              const value = obj[key];
              const newKey = prefix ? `${prefix}.${key}` : key;
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                flatten(value, newKey);
              } else {
                headers.add(newKey);
              }
            });
          };
          flatten(item);
        }
      });
      
      const headerArray = Array.from(headers);
      const rows = [headerArray.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',')];
      
      data.forEach(item => {
        if (!item || typeof item !== 'object') {
          rows.push(headerArray.map(() => '""').join(','));
          return;
        }
        
        const flatten = (obj, prefix = '') => {
          const result = {};
          Object.keys(obj).forEach(key => {
            const value = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              Object.assign(result, flatten(value, newKey));
            } else {
              result[newKey] = value;
            }
          });
          return result;
        };
        
        const flattened = flatten(item);
        const row = headerArray.map(h => {
          const value = flattened[h];
          if (value === null || value === undefined) return '""';
          const str = String(value).replace(/"/g, '""');
          return `"${str}"`;
        });
        rows.push(row.join(','));
      });
      
      return '\ufeff' + rows.join('\n'); // BOM for Excel
    },

    // Handle auto export in background
    handleAutoExport: (data, batchInfo) => {
      try {
        // Get titleSlug from storage (priority), fallback to extractCategorySlug
        chrome.storage.local.get(['titleSlug'], (result) => {
          let categorySlug = '';
          if (result.titleSlug) {
            // Convert "thuoc/thuoc-dieu-tri-ung-thu" to "thuoc-thuoc-dieu-tri-ung-thu"
            categorySlug = result.titleSlug.replace(/\//g, '-');
          } else {
            // Fallback to extract from data
            categorySlug = AutoExportHandler.extractCategorySlug(data);
          }
          
          // Generate filename
          const filename = categorySlug 
            ? `scraped-data-${categorySlug}-${batchInfo.startIndex}-${batchInfo.endIndex}.csv`
            : `scraped-data-${batchInfo.startIndex}-${batchInfo.endIndex}.csv`;
          
          // Continue with export...
          // Convert to CSV
          const csvContent = AutoExportHandler.convertToCSV(data);
          
          if (!csvContent || csvContent.length === 0) {
            console.error('[AutoExportHandler] Empty CSV content');
            return;
          }
          
          // Check file size (max 50MB for data URL)
          const contentSize = Utils.getContentSize(csvContent);
          const sizeInMB = contentSize / (1024 * 1024);
          
          if (sizeInMB > 50) {
            console.error(`[AutoExportHandler] File too large: ${sizeInMB.toFixed(2)}MB`);
            return;
          }
          
          // Create data URL (service worker không hỗ trợ blob URL)
          const dataUrl = Utils.encodeToDataURL(csvContent, 'text/csv');
          
          // Download file với delay 1s
          setTimeout(() => {
            chrome.downloads.download({
              url: dataUrl,
              filename: filename,
              saveAs: false // Auto-save to default downloads folder
            }, (downloadId) => {
              if (chrome.runtime.lastError) {
                console.error('[AutoExportHandler] Download error:', chrome.runtime.lastError);
              } else {
                // Clear batch info after download
                chrome.storage.local.remove(['currentExportBatch']);
              }
            });
          }, 1000); // Delay 1s trước khi export
        });
      } catch (error) {
        console.error('[AutoExportHandler] ❌ Error:', error);
      }
    }
  };

  // Helper function for auto export
  function handleAutoExportInBackground(data, batchInfo) {
    AutoExportHandler.handleAutoExport(data, batchInfo);
  }

  // ============================================
  // 🚀 INITIALIZATION
  // ============================================
  // ✅ BADGE HELPERS
  // ============================================
  const setBadge = (tabId, text, color) => {
    if (!chrome.action || !tabId) return;
    chrome.action.setBadgeText({ text, tabId });
    if (color) {
      chrome.action.setBadgeBackgroundColor({ color, tabId });
    }
  };

  const showDoneBadge = (tabId) => setBadge(tabId, '✓', '#4CAF50');
  const clearBadge = (tabId) => setBadge(tabId, '', undefined);

  // Clear badge on install/update
  chrome.runtime.onInstalled.addListener(() => {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(t => clearBadge(t.id));
    });
  });

  // ============================================
  // 📡 MESSAGE LISTENER
  // ============================================
  // Note: In Chrome extension, messages from content script go to background script first.
  // If background script processes the message, it may not automatically propagate to popup.
  // We need to ensure popup listeners can receive messages by not consuming them.
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadFile') {
      return DownloadHandler.handleDownload(request, sendResponse);
    }

    // Forward pagination completion to all tabs (popup might be listening)
    if (request.action === 'paginationComplete') {
      const isListAndDetails = request.requestId && String(request.requestId).startsWith('listAndDetails_');
      const isWorkflow = request.requestId && String(request.requestId).startsWith('workflow_');
      
      // For listAndDetails or workflow requests, don't show badge and don't consume message
      // Let message propagate to popup listener (workflow will continue to scrape details)
      if (isListAndDetails || isWorkflow) {
        // Don't process, don't consume - let message reach popup
        return; // Return undefined - message will propagate to popup
      }
      
      // For standalone list scraping, show done badge
      if (sender?.tab?.id) showDoneBadge(sender.tab.id);
      
      // Forward to all tabs (for content scripts that might be listening)
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, request).catch(() => {
            // Tab might not have content script, ignore
          });
        });
      });
      
      // Don't consume message - let it propagate to popup
      return; // Return undefined - message will propagate to popup
    }

    if (request.action === 'scrollComplete') {
      const isListAndDetails = request.requestId && String(request.requestId).startsWith('listAndDetails_');
      const isWorkflow = request.requestId && String(request.requestId).startsWith('workflow_');
      
      // For listAndDetails or workflow requests, don't show badge and don't consume message
      // Let message propagate to popup listener (workflow will continue to scrape details)
      if (isListAndDetails || isWorkflow) {
        // Don't process, don't consume - let message reach popup
        return; // Return undefined - message will propagate to popup
      }
      
      // For standalone list scraping, show done badge
      if (sender?.tab?.id) showDoneBadge(sender.tab.id);
      
      // Forward to all tabs (for content scripts that might be listening)
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, request).catch(() => {
            // Tab might not have content script, ignore
          });
        });
      });
      
      // Don't consume message - let it propagate to popup
      return; // Return undefined - don't consume, let message propagate
    }

    // Handle auto-export batch (mỗi 100 items) - xử lý trong background để hoạt động ngay cả khi popup đóng
    if (request.action === 'autoExportBatch') {
      // Validate data
      if (!request.data || !Array.isArray(request.data) || request.data.length === 0) {
        console.error('[Background] ❌ Invalid export data');
        sendResponse({ success: false, error: 'Invalid data' });
        return true;
      }
      
      // Prepare batch info
      const batchInfo = {
        startIndex: request.startIndex,
        endIndex: request.endIndex,
        batchNumber: request.batchNumber
      };
      
      // Store batch info (optional, for tracking)
      chrome.storage.local.set({ currentExportBatch: batchInfo }, () => {
        // Export directly in background - delay 1s đã được handle trong handleAutoExport
        handleAutoExportInBackground(request.data, batchInfo);
      });
      
      sendResponse({ success: true });
      return true; // Consume message
    }

    if (request.action === 'detailsScrapingComplete') {
      // Show done badge
      const tabId = sender?.tab?.id;
      if (tabId) {
        showDoneBadge(tabId);
      }
      return false;
    }
    
    // New action: show badge after export completes
    if (request.action === 'workflowComplete') {
      if (sender?.tab?.id) showDoneBadge(sender.tab.id);
      return false;
    }
    
    // Show badge when scraping is complete
    if (request.action === 'showScrapeCompleteBadge') {
      const tabId = sender?.tab?.id;
      if (tabId) {
        showDoneBadge(tabId);
      }
      return false; // Don't consume message
    }

    if (request.action === 'clearBadge') {
      const tabId = request.tabId || sender?.tab?.id;
      if (tabId) {
        clearBadge(tabId);
      }
      sendResponse({ success: true });
      return false;
    }

    if (request.action === 'clearAllBadges') {
      // Clear badge for all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            clearBadge(tab.id);
          }
        });
      });
      sendResponse({ success: true });
      return false;
    }
    
    // Unknown action
    sendResponse({ success: false, error: 'Unknown action' });
    return false;
  });

  // ============================================
  // 📥 DOWNLOAD COMPLETION HANDLER
  // ============================================
  chrome.downloads.onChanged.addListener((downloadDelta) => {
    if (downloadDelta.error && downloadDelta.error.current) {
      const error = downloadDelta.error.current;
      // USER_CANCELED is not an error - user just canceled the download dialog
      if (error !== 'USER_CANCELED') {
        console.error('❌ Download error:', error);
      }
    }
  });

})();
