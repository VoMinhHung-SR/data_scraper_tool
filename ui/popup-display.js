(() => {
  'use strict';

  // ============================================
  // 🎨 POPUP DISPLAY
  // ============================================
  window.PopupDisplay = {
    /**
     * Display results
     * @param {Array|Object} data - Data to display
     * @param {Object} options - Options { maxProducts: number }
     */
    displayResults: function(data, options = {}) {
      console.log('[PopupDisplay] displayResults called:', {
        dataType: Array.isArray(data) ? 'array' : typeof data,
        dataLength: Array.isArray(data) ? data.length : 1,
        options: options
      });
      
      if (!data) {
        console.warn('[PopupDisplay] displayResults: No data provided');
        return;
      }
      
      if (Array.isArray(data) && data.length === 0) {
        console.warn('[PopupDisplay] displayResults: Empty array provided');
        return;
      }
      
      // Use modal for results display
      const resultsModal = document.getElementById('resultsModal');
      const statsDiv = document.getElementById('stats');
      const previewDiv = document.getElementById('resultPreview');

      if (!resultsModal) {
        console.error('[PopupDisplay] displayResults: resultsModal not found');
        return;
      }
      if (!statsDiv) {
        console.error('[PopupDisplay] displayResults: statsDiv not found');
        return;
      }
      if (!previewDiv) {
        console.error('[PopupDisplay] displayResults: previewDiv not found');
        return;
      }
      
      console.log('[PopupDisplay] All elements found, displaying modal...');

      // Show modal with multiple fallbacks
      resultsModal.style.display = 'flex';
      resultsModal.style.visibility = 'visible';
      resultsModal.style.opacity = '1';
      resultsModal.style.zIndex = '99999';
      resultsModal.classList.add('active');
      
      // Force show (in case CSS doesn't work) - multiple attempts
      setTimeout(() => {
        const computed = window.getComputedStyle(resultsModal);
        if (computed.display === 'none' || computed.visibility === 'hidden') {
          resultsModal.style.setProperty('display', 'flex', 'important');
          resultsModal.style.setProperty('visibility', 'visible', 'important');
          resultsModal.style.setProperty('opacity', '1', 'important');
          resultsModal.style.setProperty('z-index', '99999', 'important');
        }
      }, 50);
      
      setTimeout(() => {
        const computed = window.getComputedStyle(resultsModal);
        if (computed.display === 'none' || computed.visibility === 'hidden') {
          resultsModal.style.setProperty('display', 'flex', 'important');
          resultsModal.style.setProperty('visibility', 'visible', 'important');
          resultsModal.style.setProperty('opacity', '1', 'important');
          resultsModal.style.setProperty('z-index', '99999', 'important');
        }
      }, 200);

      // Stats
      const count = Array.isArray(data) ? data.length : 1;
      const dataSize = new Blob([JSON.stringify(data)]).size;
      const maxProducts = options.maxProducts || null;
      
      // Hiển thị số lượng chính xác với limit nếu có
      const countDisplay = maxProducts 
        ? `${count}/${maxProducts}` 
        : `${count}`;
      
      statsDiv.innerHTML = `
        <div class="stat">
          <div class="stat-value">${countDisplay}</div>
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
      
      // Nếu thành công, chỉ hiện 1 line ngắn gọn
      if (type === 'success') {
        // Extract số lượng từ text nếu có
        const countMatch = text.match(/(\d+)/);
        const count = countMatch ? countMatch[1] : '';
        if (text.includes('chi tiết') || text.includes('sản phẩm')) {
          messageDiv.textContent = `✅ Đã scrape thành công ${count} sản phẩm`;
        } else {
          // Giữ nguyên text nhưng rút gọn nếu quá dài
          const shortText = text.length > 60 ? text.substring(0, 60) + '...' : text;
          messageDiv.textContent = shortText;
        }
      } else {
        messageDiv.textContent = text;
      }
      
      messageDiv.style.display = 'block';

      // Clear previous timeout
      if (window.PopupState.messageTimeout) {
        clearTimeout(window.PopupState.messageTimeout);
      }

      // Ẩn processing status khi thành công
      if (type === 'success') {
        const processingStatus = document.getElementById('processingStatus');
        if (processingStatus) {
          processingStatus.style.display = 'none';
        }
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
      // Close results modal
      const resultsModal = document.getElementById('resultsModal');
      if (resultsModal) {
        resultsModal.style.display = 'none';
        resultsModal.classList.remove('active');
      }
      
      // Also hide old results section for backward compatibility
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

