(() => {
  'use strict';

  // ============================================
  // 📦 POPUP STATE
  // ============================================
  window.PopupState = {
    currentData: null,
    currentTab: null,
    messageTimeout: null,

    /**
     * Initialize state
     */
    init: async function() {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          throw new Error('Không thể truy cập tab hiện tại');
        }
        this.currentTab = tab;
        return tab;
      } catch (error) {
        console.error('Init state error:', error);
        throw error;
      }
    },

    /**
     * Set current data
     */
    setData: function(data) {
      this.currentData = data;
    },

    /**
     * Get current data
     */
    getData: function() {
      return this.currentData;
    },

    /**
     * Clear state
     */
    clear: function() {
      this.currentData = null;
      if (this.messageTimeout) {
        clearTimeout(this.messageTimeout);
        this.messageTimeout = null;
      }
    }
  };
})();

