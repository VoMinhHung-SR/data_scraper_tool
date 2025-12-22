(() => {
  'use strict';

  // ============================================
  // 🔍 GENERIC HANDLERS (Dùng cho mọi trang web)
  // ============================================
  window.DataScraperGenericHandlers = {
    /**
     * Helper: Validate tab access
     */
    _validateTab: function(tab) {
      if (!tab || !tab.id) {
        window.PopupDisplay.showMessage('Không thể truy cập tab', 'error');
        return false;
      }
      return true;
    },

    /**
     * Handle auto-detect selector
     */
    handleAutoDetect: function(tab) {
      if (!this._validateTab(tab)) return;
      
      chrome.tabs.sendMessage(tab.id, { action: 'autoDetectSelector' }, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          if (errorMsg.includes('Receiving end does not exist')) {
            window.PopupDisplay.showMessage('Content script chưa được load. Vui lòng reload trang và thử lại.', 'error');
          } else {
            window.PopupDisplay.showMessage('Lỗi: ' + errorMsg, 'error');
          }
          return;
        }
        
        const selectorInput = document.getElementById('productSelector');
        const infoDiv = document.getElementById('selectorInfo');
        
        if (response?.success && response.selector) {
          if (selectorInput) selectorInput.value = response.selector;
          if (infoDiv) {
            infoDiv.innerHTML = 
              `✅ Tự động tìm thấy: <strong>${response.count}</strong> sản phẩm với selector: <code>${window.PopupDisplay.escapeHtml(response.selector)}</code>`;
          }
          window.PopupDisplay.showMessage(`Đã tìm thấy ${response.count} sản phẩm`, 'success');
        } else {
          if (infoDiv) {
            infoDiv.innerHTML = `⚠️ Không tìm thấy selector tự động. Vui lòng nhập thủ công.`;
          }
          window.PopupDisplay.showMessage('Không tìm thấy selector tự động', 'error');
        }
      });
    },

    /**
     * Handle test selector
     */
    handleTestSelector: function(tab) {
      if (!this._validateTab(tab)) return;
      
      const selectorInput = document.getElementById('productSelector');
      const selector = selectorInput?.value.trim();
      
      if (!selector) {
        window.PopupDisplay.showMessage('Vui lòng nhập CSS selector', 'error');
        return;
      }
      
      chrome.tabs.sendMessage(tab.id, { action: 'testSelector', selector }, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          if (errorMsg.includes('Receiving end does not exist')) {
            window.PopupDisplay.showMessage('Content script chưa được load. Vui lòng reload trang và thử lại.', 'error');
          } else {
            window.PopupDisplay.showMessage('Lỗi: ' + errorMsg, 'error');
          }
          return;
        }
        
        const infoDiv = document.getElementById('selectorInfo');
        if (!infoDiv) return;
        
        if (response?.success) {
          let html = `✅ Tìm thấy <strong>${response.count}</strong> sản phẩm<br>`;
          if (response.sample && response.sample.length > 0) {
            html += '<div style="margin-top: 5px; font-size: 10px;">Mẫu: ';
            response.sample.forEach((item, idx) => {
              const name = window.PopupDisplay.escapeHtml(item.name || item.href || 'N/A');
              html += `<div style="padding: 3px; background: #f0f0f0; margin: 2px 0; border-radius: 3px;">${idx + 1}. ${name}</div>`;
            });
            html += '</div>';
          }
          infoDiv.innerHTML = html;
          window.PopupDisplay.showMessage(`Test thành công: ${response.count} sản phẩm`, 'success');
        } else {
          infoDiv.innerHTML = `❌ Lỗi: ${window.PopupDisplay.escapeHtml(response?.error || 'Unknown error')}`;
          window.PopupDisplay.showMessage('Lỗi khi test selector', 'error');
        }
      });
    },

    /**
     * Handle custom scrape
     */
    handleCustomScrape: function(tab) {
      if (!this._validateTab(tab)) return;

      const selectorInput = document.getElementById('customSelector');
      const attributeInput = document.getElementById('customAttribute');
      
      const selector = selectorInput?.value.trim();
      if (!selector) {
        window.PopupDisplay.showMessage('Vui lòng nhập CSS selector', 'error');
        return;
      }
      
      const attribute = attributeInput?.value.trim();
      
      window.PopupScrape.scrape('selector', { selector, attribute }, tab);
    },

    /**
     * Handle highlight
     */
    handleHighlight: function(tab) {
      if (!this._validateTab(tab)) return;

      const selectorInput = document.getElementById('customSelector');
      const selector = selectorInput?.value.trim();
      
      if (!selector) {
        window.PopupDisplay.showMessage('Vui lòng nhập CSS selector', 'error');
        return;
      }
      
      chrome.tabs.sendMessage(tab.id, { action: 'highlight', selector }, (response) => {
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
          window.PopupDisplay.showMessage(`Đã highlight ${response.count} elements`, 'success');
        }
      });
    },

    /**
     * Handle quick scrape (table, links, images, products - simple)
     */
    handleQuickScrape: function(type, tab) {
      if (!this._validateTab(tab)) return;

      window.PopupScrape.scrape(type, {}, tab);
    }
  };
})();

