(() => {
  'use strict';

  // ============================================
  // 🔍 POPUP SCRAPE
  // ============================================
  // Common scraping logic
  window.PopupScrape = {
    /**
     * Scrape function
     */
    scrape: function(type, options = {}, tab = null) {
      const currentTab = tab || window.PopupState.currentTab;
      
      if (!currentTab || !currentTab.id) {
        window.PopupDisplay.showMessage('Không thể truy cập tab', 'error');
        return;
      }

      window.PopupDisplay.showMessage('Đang scrape...', 'loading');

      chrome.tabs.sendMessage(currentTab.id, {
        action: 'scrape',
        type,
        options
      }, this.handleResponse);
    },

    /**
     * Handle scrape response
     */
    handleResponse: function(response) {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        if (errorMsg.includes('Receiving end does not exist')) {
          window.PopupDisplay.showMessage('Content script chưa được load. Vui lòng reload trang và thử lại.', 'error');
        } else {
          window.PopupDisplay.showMessage('Lỗi: ' + errorMsg, 'error');
        }
        return;
      }

      if (response?.success) {
        window.PopupState.setData(response.data);
        window.PopupDisplay.displayResults(response.data);
        const count = Array.isArray(response.data) ? response.data.length : 1;
        window.PopupDisplay.showMessage(`Đã scrape thành công ${count} items`, 'success');
      } else {
        window.PopupDisplay.showMessage('Lỗi: ' + (response?.error || 'Unknown error'), 'error');
      }
    }
  };
})();

