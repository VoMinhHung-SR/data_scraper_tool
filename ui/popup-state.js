(() => {
  'use strict';

  // ============================================
  // 📦 POPUP STATE
  // ============================================
  window.PopupState = {
    currentListData: null,
    currentDetailData: null,
    currentTab: null,
    messageTimeout: null,
    STORAGE_KEY_LIST: 'scraper_list_data',
    STORAGE_KEY_DETAIL: 'scraper_detail_data',

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
        
        // Restore saved data
        await this.loadSavedData();
        
        return tab;
      } catch (error) {
        console.error('Init state error:', error);
        throw error;
      }
    },

    /**
     * Set list data and save to storage
     */
    setListData: function(data) {
      this.currentListData = data;
      this.saveListData(data);
    },

    /**
     * Set detail data and save to storage
     */
    setDetailData: function(data) {
      this.currentDetailData = data;
      this.saveDetailData(data);
    },

    /**
     * Set data (backward compatibility - auto-detect type)
     */
    setData: function(data) {
      if (!data || !Array.isArray(data) || data.length === 0) {
        return;
      }
      
      // Auto-detect: if first item has 'link' but no detailed fields, it's list
      // If has detailed fields like 'sku', 'description', 'ingredients', etc., it's detail
      const firstItem = data[0];
      const hasDetailFields = firstItem.sku || firstItem.description || firstItem.ingredients || 
                              firstItem.usage || firstItem.indication;
      const hasListFields = firstItem.link && !hasDetailFields;
      
      if (hasDetailFields) {
        this.setDetailData(data);
      } else if (hasListFields) {
        this.setListData(data);
      } else {
        // Default to detail if uncertain
        this.setDetailData(data);
      }
    },

    /**
     * Get list data
     */
    getListData: function() {
      return this.currentListData;
    },

    /**
     * Get detail data
     */
    getDetailData: function() {
      return this.currentDetailData;
    },

    /**
     * Get current data (backward compatibility - returns detail if available, else list)
     */
    getData: function() {
      // Priority: detail > list
      return this.currentDetailData || this.currentListData;
    },

    /**
     * Save list data to chrome.storage
     */
    saveListData: function(data) {
      if (data && Array.isArray(data) && data.length > 0) {
        chrome.storage.local.set({ 
          [this.STORAGE_KEY_LIST]: {
            data: data,
            timestamp: Date.now(),
            count: data.length,
            type: 'list'
          }
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error saving list data:', chrome.runtime.lastError);
          }
        });
      }
    },

    /**
     * Save detail data to chrome.storage
     */
    saveDetailData: function(data) {
      if (data && Array.isArray(data) && data.length > 0) {
        chrome.storage.local.set({ 
          [this.STORAGE_KEY_DETAIL]: {
            data: data,
            timestamp: Date.now(),
            count: data.length,
            type: 'detail'
          }
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error saving detail data:', chrome.runtime.lastError);
          }
        });
      }
    },

    /**
     * Load saved data from chrome.storage
     */
    loadSavedData: async function() {
      return new Promise((resolve) => {
        chrome.storage.local.get([this.STORAGE_KEY_LIST, this.STORAGE_KEY_DETAIL], (result) => {
          console.log('[PopupState] Loading saved data from storage:', {
            hasList: !!result[this.STORAGE_KEY_LIST],
            hasDetail: !!result[this.STORAGE_KEY_DETAIL]
          });
          
          // Load list data
          if (result[this.STORAGE_KEY_LIST] && result[this.STORAGE_KEY_LIST].data) {
            const saved = result[this.STORAGE_KEY_LIST];
            const age = Date.now() - saved.timestamp;
            if (age < 24 * 60 * 60 * 1000) {
              this.currentListData = saved.data;
              console.log('[PopupState] Loaded list data:', saved.data.length, 'items');
            } else {
              chrome.storage.local.remove([this.STORAGE_KEY_LIST]);
            }
          }
          
          // Load detail data
          if (result[this.STORAGE_KEY_DETAIL] && result[this.STORAGE_KEY_DETAIL].data) {
            const saved = result[this.STORAGE_KEY_DETAIL];
            const age = Date.now() - saved.timestamp;
            if (age < 24 * 60 * 60 * 1000) {
              this.currentDetailData = saved.data;
              console.log('[PopupState] Loaded detail data:', saved.data.length, 'items');
            } else {
              chrome.storage.local.remove([this.STORAGE_KEY_DETAIL]);
            }
          }
          
          resolve();
        });
      });
    },

    /**
     * Clear state and storage
     */
    clear: function() {
      this.currentListData = null;
      this.currentDetailData = null;
      chrome.storage.local.remove([this.STORAGE_KEY_LIST, this.STORAGE_KEY_DETAIL]);
      if (this.messageTimeout) {
        clearTimeout(this.messageTimeout);
        this.messageTimeout = null;
      }
    },

    /**
     * Clear only list data
     */
    clearListData: function() {
      this.currentListData = null;
      chrome.storage.local.remove([this.STORAGE_KEY_LIST]);
    },

    /**
     * Clear only detail data
     */
    clearDetailData: function() {
      this.currentDetailData = null;
      chrome.storage.local.remove([this.STORAGE_KEY_DETAIL]);
    }
  };
})();

