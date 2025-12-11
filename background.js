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
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadFile') {
      return DownloadHandler.handleDownload(request, sendResponse);
    }

    // Forward pagination completion to all tabs (popup might be listening)
    if (request.action === 'paginationComplete') {
      // Only show badge for standalone list; skip if this is part of 1-click list+detail (requestId starts with listAndDetails_)
      const isListAndDetails = request.requestId && String(request.requestId).startsWith('listAndDetails_');
      if (!isListAndDetails && sender?.tab?.id) showDoneBadge(sender.tab.id);
      // Broadcast to all tabs - popup will catch it
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, request).catch(() => {
            // Tab might not have content script, ignore
          });
        });
      });
      sendResponse({ success: true });
      return false;
    }

    if (request.action === 'scrollComplete') {
      const isListAndDetails = request.requestId && String(request.requestId).startsWith('listAndDetails_');
      if (!isListAndDetails && sender?.tab?.id) showDoneBadge(sender.tab.id);
      return false;
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
      console.error('❌ Download error:', downloadDelta.error.current);
    }
  });

})();
