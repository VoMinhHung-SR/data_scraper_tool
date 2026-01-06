(() => {
  'use strict';

  // ============================================
  // 💾 STATE MANAGER
  // ============================================
  // Centralized state management with namespaced keys
  window.DataScraperStateManager = {
    // State keys with namespace
    KEYS: {
      PAGINATION: 'scraper:pagination',
      DETAIL_LIST: 'scraper:detail_list',
      API_CACHE: 'scraper:api_cache'
    },

    /**
     * Save pagination state
     * @param {Object} state - Pagination state
     * @returns {Promise}
     */
    savePaginationState: (state) => {
      return new Promise((resolve) => {
        chrome.storage.local.set({
          [window.DataScraperStateManager.KEYS.PAGINATION]: state
        }, () => {
          resolve();
        });
      });
    },

    /**
     * Get pagination state
     * @returns {Promise<Object|null>}
     */
    getPaginationState: () => {
      return new Promise((resolve) => {
        chrome.storage.local.get([window.DataScraperStateManager.KEYS.PAGINATION], (result) => {
          resolve(result[window.DataScraperStateManager.KEYS.PAGINATION] || null);
        });
      });
    },

    /**
     * Clear pagination state
     * @returns {Promise}
     */
    clearPaginationState: () => {
      return new Promise((resolve) => {
        chrome.storage.local.remove([window.DataScraperStateManager.KEYS.PAGINATION], () => {
          resolve();
        });
      });
    },

    /**
     * Save detail scraping state
     * @param {Object} state - Detail scraping state
     * @returns {Promise}
     */
    saveDetailState: (state) => {
      return new Promise((resolve) => {
        chrome.storage.local.set({
          [window.DataScraperStateManager.KEYS.DETAIL_LIST]: state
        }, () => {
          resolve();
        });
      });
    },

    /**
     * Get detail scraping state
     * @returns {Promise<Object|null>}
     */
    getDetailState: () => {
      return new Promise((resolve) => {
        chrome.storage.local.get([window.DataScraperStateManager.KEYS.DETAIL_LIST], (result) => {
          resolve(result[window.DataScraperStateManager.KEYS.DETAIL_LIST] || null);
        });
      });
    },

    /**
     * Clear detail scraping state
     * @returns {Promise}
     */
    clearDetailState: () => {
      return new Promise((resolve) => {
        chrome.storage.local.remove([window.DataScraperStateManager.KEYS.DETAIL_LIST], () => {
          resolve();
        });
      });
    },

    /**
     * Save last API response cache
     * @param {Object} data - API response data
     * @returns {Promise}
     */
    saveLastAPIResponse: (data) => {
      return new Promise((resolve) => {
        chrome.storage.local.set({
          [window.DataScraperStateManager.KEYS.API_CACHE]: {
            data: data,
            timestamp: Date.now()
          }
        }, () => {
          resolve();
        });
      });
    },

    /**
     * Get last API response cache
     * @param {number} maxAge - Maximum age in milliseconds (default: 5 minutes)
     * @returns {Promise<Object|null>}
     */
    getLastAPIResponse: (maxAge = 5 * 60 * 1000) => {
      return new Promise((resolve) => {
        chrome.storage.local.get([window.DataScraperStateManager.KEYS.API_CACHE], (result) => {
          const cached = result[window.DataScraperStateManager.KEYS.API_CACHE];
          if (!cached) {
            resolve(null);
            return;
          }

          // Check if cache is still valid
          const age = Date.now() - cached.timestamp;
          if (age > maxAge) {
            // Cache expired, remove it
            chrome.storage.local.remove([window.DataScraperStateManager.KEYS.API_CACHE]);
            resolve(null);
            return;
          }

          resolve(cached.data);
        });
      });
    },

    /**
     * Generic set state
     * @param {string} key - State key
     * @param {*} value - State value
     * @returns {Promise}
     */
    set: (key, value) => {
      return new Promise((resolve) => {
        // Validate key to prevent undefined key
        if (!key || typeof key !== 'string' || key.trim() === '') {
          console.error('[StateManager] Invalid key provided to set():', key);
          resolve();
          return;
        }
        chrome.storage.local.set({ [key]: value }, () => {
          resolve();
        });
      });
    },

    /**
     * Generic get state
     * @param {string} key - State key
     * @returns {Promise<*>}
     */
    get: (key) => {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
          resolve(result[key] || null);
        });
      });
    },

    /**
     * Generic remove state
     * @param {string} key - State key
     * @returns {Promise}
     */
    remove: (key) => {
      return new Promise((resolve) => {
        chrome.storage.local.remove([key], () => {
          resolve();
        });
      });
    },

    /**
     * Clear all scraper states
     * @returns {Promise}
     */
    clearAll: () => {
      return new Promise((resolve) => {
        chrome.storage.local.remove([
          window.DataScraperStateManager.KEYS.PAGINATION,
          window.DataScraperStateManager.KEYS.DETAIL_LIST,
          window.DataScraperStateManager.KEYS.API_CACHE,
          'scrapeDetailsState',
          'paginationState',
          'scraper_detail_data',
          'scraper_list_data',
          'lastProductDetailAPI'
        ], () => {
          resolve();
        });
      });
    },
    
    /**
     * Cleanup old states (older than maxAge)
     * @param {number} maxAge - Maximum age in milliseconds (default: 1 hour)
     * @returns {Promise<number>} Number of states cleaned up
     */
    cleanupOldStates: (maxAge = 60 * 60 * 1000) => {
      return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => {
          const now = Date.now();
          const keysToRemove = [];
          
          // Check all scraper-related keys
          Object.keys(items).forEach(key => {
            if (key.startsWith('scraper:') || 
                key === 'scrapeDetailsState' || 
                key === 'paginationState' ||
                key === 'lastProductDetailAPI') {
              const item = items[key];
              // Check if item has timestamp and is old
              if (item && typeof item === 'object' && item.timestamp) {
                const age = now - item.timestamp;
                if (age > maxAge) {
                  keysToRemove.push(key);
                }
              } else if (item && typeof item === 'object' && item.startedAt) {
                // Check startedAt for scrapeDetailsState
                const age = now - item.startedAt;
                if (age > maxAge) {
                  keysToRemove.push(key);
                }
              }
            }
          });
          
          if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove, () => {
              resolve(keysToRemove.length);
            });
          } else {
            resolve(0);
          }
        });
      });
    }
  };
})();

