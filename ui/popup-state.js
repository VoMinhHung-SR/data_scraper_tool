(() => {
  'use strict';

  // ============================================
  // 📦 POPUP STATE
  // ============================================
  window.PopupState = {
    currentListData: null,
    currentDetailData: null,
    currentFailedLinks: [],
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
        
        // NOTE: Removed URL change detection that clears states
        // This was causing data loss when closing/reopening tabs
        // Data is persisted in localStorage and should only be cleared when user clicks "Clear results"
        
        this.currentTab = tab;
        
        // Restore saved data from localStorage
        await this.loadSavedData();
        
        return tab;
      } catch (error) {
        console.error('Init state error:', error);
        throw error;
      }
    },
    
    /**
     * Get last URL from storage
     */
    getLastUrl: async function() {
      return new Promise((resolve) => {
        chrome.storage.local.get(['scraper_last_url'], (result) => {
          resolve(result.scraper_last_url || null);
        });
      });
    },
    
    /**
     * Save current URL to storage
     */
    saveLastUrl: async function(url) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ scraper_last_url: url }, () => {
          resolve();
        });
      });
    },
    
    /**
     * Clear all states (including pagination, detail scraping states)
     */
    clearAllStates: function() {
      // Clear in-memory state
      this.currentListData = null;
      this.currentDetailData = null;
      this.currentFailedLinks = [];
      
      // Collect ALL scraper-related keys to remove
      // NOTE: scraper_last_url is NOT cleared - it's used to detect URL changes
      const keysToRemove = [
        // PopupState keys
        this.STORAGE_KEY_LIST,
        this.STORAGE_KEY_DETAIL,
        // Detail scraping state (CRITICAL - must be cleared to prevent stuck state)
        'scrapeDetailsState',
        // Pagination state
        'paginationState',
        // API cache
        'lastProductDetailAPI',
        // Export related keys
        'currentExportBatch',
        'exportCompleted',
        'pendingAutoExport',
        // DataScraperStateManager keys
        window.DataScraperStateManager?.KEYS?.PAGINATION,
        window.DataScraperStateManager?.KEYS?.DETAIL_LIST,
        window.DataScraperStateManager?.KEYS?.API_CACHE,
        // Additional keys that might exist (but NOT scraper_last_url - needed for URL change detection)
        'scraper_detail_data',
        'scraper_list_data'
      ].filter(Boolean);
      
      // Clear all keys in one operation to avoid race conditions
      chrome.storage.local.remove(keysToRemove, () => {
        if (chrome.runtime.lastError) {
          console.error('[PopupState] Error clearing states:', chrome.runtime.lastError);
        }
        
        // Double-check: Also call DataScraperStateManager.clearAll to ensure nothing is missed
        if (window.DataScraperStateManager && window.DataScraperStateManager.clearAll) {
          window.DataScraperStateManager.clearAll().catch(err => {
            console.error('[PopupState] Error in DataScraperStateManager.clearAll:', err);
          });
        }
      });
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

    setFailedLinks: function(failedLinks) {
      this.currentFailedLinks = Array.isArray(failedLinks) ? failedLinks : [];
    },

    getFailedLinks: function() {
      return this.currentFailedLinks || [];
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
      const hasGroupedDetailFields = firstItem?.basicInfo?.sku || firstItem?.basicInfo?.name || firstItem?.pricing || firstItem?.content;
      const hasDetailFields = firstItem.sku || firstItem.description || firstItem.ingredients || 
                              firstItem.usage || firstItem.indication || hasGroupedDetailFields;
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
        // Check storage quota before saving
        if (chrome.storage.local.getBytesInUse) {
          chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
            const quota = chrome.storage.local.QUOTA_BYTES || 10 * 1024 * 1024;
            const estimatedSize = JSON.stringify(data).length;
            
            if (bytesInUse + estimatedSize > quota * 0.9) {
              console.warn('[PopupState] Storage nearly full, cleaning old data...');
              this._cleanupOldData(() => {
                this._saveDetailDataInternal(data);
              });
            } else {
              this._saveDetailDataInternal(data);
            }
          });
        } else {
          this._saveDetailDataInternal(data);
        }
      }
    },

    /**
     * Internal save detail data
     */
    _saveDetailDataInternal: function(data) {
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
          window.PopupDisplay?.showMessage('Cảnh báo: Không thể lưu dữ liệu vào storage. Vui lòng export ngay.', 'error');
        }
      });
    },

    /**
     * Cleanup old data (>24h)
     */
    _cleanupOldData: function(callback) {
      chrome.storage.local.get([this.STORAGE_KEY_LIST, this.STORAGE_KEY_DETAIL], (result) => {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        const keysToRemove = [];

        if (result[this.STORAGE_KEY_LIST]) {
          const age = now - result[this.STORAGE_KEY_LIST].timestamp;
          if (age > maxAge) {
            keysToRemove.push(this.STORAGE_KEY_LIST);
          }
        }

        if (result[this.STORAGE_KEY_DETAIL]) {
          const age = now - result[this.STORAGE_KEY_DETAIL].timestamp;
          if (age > maxAge) {
            keysToRemove.push(this.STORAGE_KEY_DETAIL);
          }
        }

        if (keysToRemove.length > 0) {
          chrome.storage.local.remove(keysToRemove, () => {
            if (callback) callback();
          });
        } else {
          if (callback) callback();
        }
      });
    },

    /**
     * Load saved data from chrome.storage
     */
    loadSavedData: async function() {
      return new Promise((resolve) => {
        chrome.storage.local.get([this.STORAGE_KEY_LIST, this.STORAGE_KEY_DETAIL], (result) => {
          // Load list data
          if (result[this.STORAGE_KEY_LIST] && result[this.STORAGE_KEY_LIST].data) {
            const saved = result[this.STORAGE_KEY_LIST];
            const age = Date.now() - saved.timestamp;
            if (age < 24 * 60 * 60 * 1000) {
              this.currentListData = saved.data;
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
      // Use clearAllStates to ensure all states are cleared
      this.clearAllStates();
      
      // Clear badge in background script - clear for all tabs
      chrome.runtime.sendMessage({
        action: 'clearAllBadges'
      }).catch((err) => {
        console.warn('[PopupState] Error clearing badges:', err);
        // Fallback: try to clear badge for current tab only
        if (this.currentTab && this.currentTab.id) {
          chrome.runtime.sendMessage({
            action: 'clearBadge',
            tabId: this.currentTab.id
          }).catch(() => {
            // Background script might not be ready, ignore
          });
        }
      });
      
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

