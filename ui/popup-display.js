(() => {
  'use strict';

  // ============================================
  // 🎨 POPUP DISPLAY
  // ============================================
  window.PopupDisplay = {
    /**
     * Display results
     */
    displayResults: function(data) {
      const resultsSection = document.getElementById('resultsSection');
      const statsDiv = document.getElementById('stats');
      const previewDiv = document.getElementById('resultPreview');

      if (!resultsSection || !statsDiv || !previewDiv) return;

      resultsSection.style.display = 'block';

      // Stats
      const count = Array.isArray(data) ? data.length : 1;
      const dataSize = new Blob([JSON.stringify(data)]).size;
      statsDiv.innerHTML = `
        <div class="stat">
          <div class="stat-value">${count}</div>
          <div>Items</div>
        </div>
        <div class="stat">
          <div class="stat-value">${window.PopupDisplay.formatBytes(dataSize)}</div>
          <div>Size</div>
        </div>
      `;

      // Preview
      if (Array.isArray(data) && data.length > 0) {
        const preview = data.slice(0, 5).map((item, idx) => {
          const content = typeof item === 'object' 
            ? JSON.stringify(item, null, 2).substring(0, 150)
            : String(item).substring(0, 150);
          return `<div class="result-item"><strong>#${idx + 1}:</strong> ${window.PopupDisplay.escapeHtml(content)}</div>`;
        }).join('');
        
        previewDiv.innerHTML = data.length > 5
          ? preview + `<div style="text-align: center; padding: 10px; color: #666;">... và ${data.length - 5} items khác</div>`
          : preview;
      } else if (data) {
        const content = typeof data === 'object' 
          ? JSON.stringify(data, null, 2)
          : String(data);
        previewDiv.innerHTML = `<div class="result-item">${window.PopupDisplay.escapeHtml(content)}</div>`;
      } else {
        previewDiv.innerHTML = '<div class="result-item">Không có dữ liệu</div>';
      }
    },

    /**
     * Show message
     */
    showMessage: function(text, type = 'success') {
      const messageDiv = document.getElementById('message');
      if (!messageDiv) return;

      messageDiv.className = type;
      messageDiv.textContent = text;
      messageDiv.style.display = 'block';

      // Clear previous timeout
      if (window.PopupState.messageTimeout) {
        clearTimeout(window.PopupState.messageTimeout);
      }

      if (type !== 'loading') {
        window.PopupState.messageTimeout = setTimeout(() => {
          messageDiv.style.display = 'none';
          window.PopupState.messageTimeout = null;
        }, 3000);
      }
    },

    /**
     * Load page info
     */
    loadPageInfo: function(tab) {
      if (!tab || !tab.id) return;
      
      chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script might not be loaded yet, ignore silently
          if (chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
            return;
          }
          console.warn('Load page info error:', chrome.runtime.lastError.message);
          return;
        }
        if (response) {
          const pageInfoEl = document.getElementById('pageInfo');
          if (pageInfoEl) {
            pageInfoEl.innerHTML = `
              <div class="url">${window.PopupDisplay.escapeHtml(response.url || '')}</div>
              <div style="margin-top: 5px; color: #999;">${window.PopupDisplay.escapeHtml(response.title || '')}</div>
            `;
          }
        }
      });
    },

    /**
     * Clear results
     */
    clearResults: function() {
      const resultsSection = document.getElementById('resultsSection');
      if (resultsSection) resultsSection.style.display = 'none';
      
      const customSelector = document.getElementById('customSelector');
      if (customSelector) customSelector.value = '';
      
      const customAttribute = document.getElementById('customAttribute');
      if (customAttribute) customAttribute.value = '';
      
      if (window.PopupState.currentTab && window.PopupState.currentTab.id) {
        chrome.tabs.sendMessage(window.PopupState.currentTab.id, { action: 'clearHighlight' });
      }
    },

    /**
     * Utility: Escape HTML
     */
    escapeHtml: function(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    /**
     * Utility: Format bytes
     */
    formatBytes: function(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
  };
})();

