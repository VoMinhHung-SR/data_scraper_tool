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
          saveAs: true
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
      
      // For listAndDetails requests, don't show badge and don't consume message
      // Let message propagate to popup listener
      if (isListAndDetails) {
        // Don't process, don't consume - let message reach popup
        return; // Return undefined - message will propagate to popup
      }
      
      // For standalone list scraping, show badge
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
      
      // For listAndDetails requests, don't show badge and don't consume message
      // Let message propagate to popup listener
      if (isListAndDetails) {
        // Don't process, don't consume - let message reach popup
        return; // Return undefined - message will propagate to popup
      }
      
      // For standalone list scraping, show badge
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

    if (request.action === 'detailsScrapingComplete') {
      if (sender?.tab?.id) showDoneBadge(sender.tab.id);
      return false;
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
    if (downloadDelta.state && downloadDelta.state.current === 'complete') {
      console.log('✅ Download completed:', downloadDelta.id);
    } else if (downloadDelta.error && downloadDelta.error.current) {
      const error = downloadDelta.error.current;
      // USER_CANCELED is not an error - user just canceled the download dialog
      if (error === 'USER_CANCELED') {
        console.log('ℹ️ Download canceled by user:', downloadDelta.id);
      } else {
        console.error('❌ Download error:', error);
      }
    }
  });

})();
