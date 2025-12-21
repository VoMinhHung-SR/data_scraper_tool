(() => {
  'use strict';

  window.DataScraperExportHandler = {
    // Constants
    ITEMS_PER_FILE: 100,
    MAX_BACKGROUND_SIZE: 2 * 1024 * 1024, // 2MB
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    MAX_DEPTH: 5,
    MAX_STRING_LENGTH: 50000,
    MAX_ROW_LENGTH: 1000000,
    MAX_KEYS_PER_OBJECT: 1000,
    
    // State management
    isExporting: false,
    lastExportTime: 0,
    EXPORT_DEBOUNCE_MS: 1000,
    
    // Feature flags
    ENABLE_DOWNLOADS_SHOW: false, // Set to false to disable chrome.downloads.show (can crash in popup/Brave)

    /**
     * Helper: Safe error handler with cleanup
     */
    _handleError: function(error, message, callback) {
      console.error(`[ExportHandler] ${message}:`, error);
      window.PopupDisplay?.showMessage(message + ': ' + (error?.message || error), 'error');
      this.isExporting = false;
      if (callback) callback();
    },

    /**
     * Helper: Reset export state
     */
    _resetExportState: function() {
      this.isExporting = false;
      
      // Re-enable auto-export checkbox
      const autoExportCheckbox = document.getElementById('autoExportCSV');
      if (autoExportCheckbox) {
        autoExportCheckbox.disabled = false;
      }
    },

    /**
     * Helper: Create download callback wrapper
     */
    _createDownloadCallback: function(callback) {
      return () => {
        this._resetExportState();
        if (callback) {
          try {
            callback();
          } catch (e) {
            console.error('[ExportHandler] Error in download callback:', e);
          }
        }
      };
    },

    /**
     * Helper: Safely revoke blob URL
     */
    _revokeBlobURL: function(blobUrl, delay = 100) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch (e) {
          console.warn('[ExportHandler] Error revoking blob URL:', e);
        }
      }, delay);
    },

    /**
     * Helper: Show download in browser manager (optional, may crash in popup/Brave)
     */
    _showDownloadInManager: function(downloadId) {
      if (!this.ENABLE_DOWNLOADS_SHOW || downloadId === undefined || downloadId === null) {
        return;
      }
      
      if (typeof chrome.downloads?.show === 'function') {
        try {
          chrome.downloads.show(downloadId);
        } catch (e) {
          // Ignore errors
        }
      }
    },

    /**
     * Helper: Download via Chrome Downloads API (Manifest V3 standard)
     */
    _downloadViaChromeAPI: function(content, filename, mimeType, format, callback) {
      const downloadCallback = this._createDownloadCallback(callback);
      
      try {
        // Create blob and blob URL
        const processedContent = format === 'csv' ? '\ufeff' + content : content;
        const blob = new Blob([processedContent], { type: mimeType + ';charset=utf-8;' });
        const blobUrl = URL.createObjectURL(blob);
        
        // Validate inputs
        if (!blobUrl?.startsWith('blob:') || !filename?.trim()) {
          throw new Error(`Invalid blobUrl or filename`);
        }
        
        if (typeof chrome?.downloads?.download !== 'function') {
          throw new Error('chrome.downloads API is not available');
        }
        
        // Defer call to avoid crash in popup context
        const callDownload = () => {
          try {
            chrome.downloads.download({
              url: blobUrl,
              filename: filename,
              saveAs: false,
              conflictAction: 'uniquify'
            }, (downloadId) => {
              if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message;
                this._revokeBlobURL(blobUrl);
                
                if (errorMsg.includes('USER_CANCELED')) {
                  downloadCallback();
                } else {
                  this._handleError(new Error(errorMsg), 'Lỗi khi tải xuống', downloadCallback);
                }
              } else {
                // Try to show download in manager (optional)
                this._showDownloadInManager(downloadId);
                
                // Show success message
                window.PopupDisplay?.showMessage(
                  `📥 Đang tải xuống: ${filename}...\n💡 Kiểm tra thư mục Downloads hoặc click icon download ở góc trên trình duyệt`,
                  'loading'
                );
                
                // Revoke blob URL after download completes (30s delay)
                this._revokeBlobURL(blobUrl, 30000);
                downloadCallback();
              }
            });
          } catch (syncError) {
            this._revokeBlobURL(blobUrl);
            this._handleError(syncError, 'Lỗi khi gọi chrome.downloads.download', downloadCallback);
          }
        };
        
        // Defer call by 50ms to avoid crash in popup context
        setTimeout(callDownload, 50);
      } catch (error) {
        this._handleError(error, 'Lỗi khi tạo file download', downloadCallback);
      }
    },

    /**
     * Main export function
     * @param {string} format - 'csv' or 'json', or null to show format selection modal
     * @param {Array} data - Data to export
     */
    exportData: function(format, data) {
      // Early validation
      if (this.isExporting) {
        window.PopupDisplay?.showMessage('Đang export, vui lòng đợi...', 'warning');
        return;
      }
      
      // Check if this is auto-export (from background) - skip debounce for auto-export
      chrome.storage.local.get(['currentExportBatch'], (result) => {
        const isAutoExport = result.currentExportBatch !== undefined;
        
        // Only apply debounce for manual exports, not auto-export
        if (!isAutoExport) {
      const now = Date.now();
      if (now - this.lastExportTime < this.EXPORT_DEBOUNCE_MS) {
        return;
      }
      this.lastExportTime = now;
        }
        
        // Continue with export logic
        this._doExport(format, data);
      });
    },
    
    /**
     * Internal export function (separated to handle async debounce check)
     */
    _doExport: function(format, data) {

      if (!data || !Array.isArray(data) || data.length === 0) {
        window.PopupDisplay?.showMessage('Không có dữ liệu để export', 'error');
        return;
      }

      // If format is not provided, check for manual format or show modal
      if (!format) {
        chrome.storage.local.get(['currentExportBatch', 'manualExportFormat'], (result) => {
          // If auto-export batch, use CSV format directly (no modal)
          if (result.currentExportBatch) {
            this._doExport('csv', data);
            return;
          }
          
          // If manual format was selected (from 1click), use it (no modal)
          if (result.manualExportFormat) {
            // Clear manual format after use
            chrome.storage.local.remove(['manualExportFormat'], () => {
              this._doExport(result.manualExportFormat, data);
            });
            return;
          }
          
          // Otherwise show modal for manual export (user clicked export button manually)
          const formatModal = document.getElementById('exportFormatModal');
          if (formatModal) {
            formatModal.style.display = 'flex';
            // Store data for later use
            this._pendingExportData = data;
          }
        });
        return;
      }

      // Clear exportCompleted flag when starting new export
      chrome.storage.local.remove(['exportCompleted']);
      
      // Show loading modal
      const loadingModal = document.getElementById('exportLoadingModal');
      const loadingText = document.getElementById('exportLoadingText');
      if (loadingModal) {
        loadingModal.style.display = 'flex';
        if (loadingText) {
          loadingText.textContent = `Đang chuẩn bị export ${data.length} sản phẩm...`;
        }
      }
      
      // Validate data
      let validation;
      try {
        validation = this._validateData(data);
      } catch (error) {
        this._handleError(error, 'Lỗi khi kiểm tra dữ liệu');
        if (loadingModal) loadingModal.style.display = 'none';
        return;
      }
      
      if (!validation.valid) {
        window.PopupDisplay?.showMessage(validation.message, 'error');
        if (loadingModal) loadingModal.style.display = 'none';
        return;
      }

      this.isExporting = true;

      // Disable auto-export checkbox while exporting
      const autoExportCheckbox = document.getElementById('autoExportCSV');
      if (autoExportCheckbox) {
        autoExportCheckbox.disabled = true;
      }

      // Split files if > 100 items (for CSV only)
      if (format === 'csv' && data.length > this.ITEMS_PER_FILE) {
        const totalFiles = Math.ceil(data.length / this.ITEMS_PER_FILE);
        const loadingModal = document.getElementById('exportLoadingModal');
        const loadingText = document.getElementById('exportLoadingText');
        if (loadingModal && loadingText) {
          loadingText.textContent = `Đang chia ${data.length} items thành ${totalFiles} files...`;
        }
        
        setTimeout(() => {
          try {
            this.exportCSVMultipleFiles(data);
          } catch (error) {
            this._handleError(error, 'Lỗi khi export nhiều file');
            if (autoExportCheckbox) autoExportCheckbox.disabled = false;
            const loadingModal = document.getElementById('exportLoadingModal');
            if (loadingModal) loadingModal.style.display = 'none';
          }
        }, 1000);
        return;
      }

      // Single file export
      setTimeout(() => {
        this._exportSingleFile(format, data);
      }, 1000);
    },

    /**
     * Export single file
     */
    _exportSingleFile: function(format, data) {
      const loadingModal = document.getElementById('exportLoadingModal');
      const loadingText = document.getElementById('exportLoadingText');
      if (loadingModal && loadingText) {
        loadingText.textContent = `Đang export ${data.length} sản phẩm...`;
      }
      
      // For single file: startIndex = 0 (will be converted to 1 in generateExportContent)
      // endIndex = data.length (actual number of items)
      this.generateExportContent(format, data, 0, data.length, (exportContent) => {
        if (!exportContent?.content) {
          console.error('[ExportHandler] No content generated!');
          window.PopupDisplay?.showMessage('Không thể tạo nội dung export', 'error');
          this._resetExportState();
          return;
        }

        const { content, filename, mimeType } = exportContent;
        const blob = new Blob([content], { type: mimeType + ';charset=utf-8;' });
        const sizeInMB = blob.size / (1024 * 1024);
        
        if (sizeInMB > 50) {
          window.PopupDisplay?.showMessage('File quá lớn (>50MB). Vui lòng giảm số lượng dữ liệu.', 'error');
          this._resetExportState();
          return;
        }

        const downloadCallback = this._createDownloadCallback(() => {
          // Show success modal
          this._showExportCompleteModal([{ filename, format }], data.length);
        });

        // Large files: always use Chrome Downloads API (no DOM hack)
        if (blob.size > this.MAX_BACKGROUND_SIZE) {
          this._downloadViaChromeAPI(content, filename, mimeType, format, downloadCallback);
          return;
        }

        // Small files: try background script first
        this._tryBackgroundDownload(content, filename, mimeType, format, downloadCallback);
      });
    },

    /**
     * Try background download for small files (<2MB), fallback to Chrome API
     */
    _tryBackgroundDownload: function(content, filename, mimeType, format, callback) {
      const contentSize = new Blob([content]).size;
      if (contentSize > this.MAX_BACKGROUND_SIZE) {
        this._downloadViaChromeAPI(content, filename, mimeType, format, callback);
        return;
      }
      
      try {
        chrome.runtime.sendMessage({
          action: 'downloadFile',
          content: content,
          filename: filename,
          mimeType: mimeType
        }, (response) => {
          if (chrome.runtime.lastError || !response?.success) {
            this._downloadViaChromeAPI(content, filename, mimeType, format, callback);
          } else {
            this._resetExportState();
            if (callback) callback();
          }
        });
      } catch (error) {
        console.error('[ExportHandler] Error sending message to background:', error);
        this._downloadViaChromeAPI(content, filename, mimeType, format, callback);
      }
    },

    /**
     * Generate export content (async to get titleSlug from storage)
     * Uses titleSlug from storage if available, otherwise falls back to categorySlug from data
     */
    generateExportContent: function(format, data, startIndex = 0, endIndex = null, callback) {
      // endIndex should be actual number of items, not limit
      const actualEndIndex = endIndex !== null ? endIndex : data.length;
      // startIndex should start from 1, not 0
      const actualStartIndex = startIndex + 1;
      
      // Always include index range in filename
      const indexSuffix = `-${actualStartIndex}-${actualEndIndex}`;
      
      // Get titleSlug from storage (priority 1)
      this._getTitleSlug((titleSlug) => {
        // Fallback to categorySlug from data if titleSlug not available
        const categorySlug = titleSlug || this._extractCategorySlug(data);
        const slug = categorySlug;
        
        if (format === 'json') {
          const content = JSON.stringify(data, null, 2);
          const filename = slug 
            ? `scraped-data-${slug}${indexSuffix}.json`
            : `scraped-data${indexSuffix}.json`;
          callback({
            content: content,
            filename: filename,
            mimeType: 'application/json'
          });
          return;
        }
        
        if (format === 'csv') {
          const content = this.convertToCSV(data);
          const filename = slug 
            ? `scraped-data-${slug}${indexSuffix}.csv`
            : `scraped-data${indexSuffix}.csv`;
          callback({
            content: content,
            filename: filename,
            mimeType: 'text/csv'
          });
          return;
        }
        
        callback(null);
      });
    },

    /**
     * Helper: Normalize text to slug format
     */
    _normalizeToSlug: function(text) {
      return text.toLowerCase()
        .replace(/[,\s]+/g, '-')
        .replace(/[^a-z0-9\-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    },

    /**
     * Extract category slug from data
     * Priority: titleSlug (from storage) > categorySlug > categoryPath > category array > URL
     * Format: "thuoc/thuoc-dieu-tri-ung-thu" -> "thuoc-thuoc-dieu-tri-ung-thu"
     * Note: This is sync but titleSlug should be set before calling
     */
    _extractCategorySlug: function(data) {
      // Note: titleSlug should be retrieved from storage before calling this
      // For now, we'll extract from data and let caller handle titleSlug separately
      if (!data?.length) return '';
      
      const firstItem = data[0];
      if (!firstItem) return '';
      
      // Priority 1: Use categorySlug if available
      if (firstItem.categorySlug) {
        return firstItem.categorySlug
          .split(/[\/>]/)
          .map(c => this._normalizeToSlug(c.trim()))
          .filter(c => c)
          .join('-');
      }
      
      // Priority 2: Extract from categoryPath
      if (firstItem.categoryPath) {
        return firstItem.categoryPath
          .split(/[\/>]/)
          .map(c => c.trim())
          .filter(c => c && !c.match(/trang\s+chủ|homepage/i))
          .map(c => this._normalizeToSlug(c))
          .join('-');
      }
      
      // Priority 3: Extract from category array
      if (Array.isArray(firstItem.category) && firstItem.category.length > 0) {
        return firstItem.category
          .map(c => this._normalizeToSlug((c.slug || c.name || c).toString()))
          .filter(c => c)
          .join('-');
      }
      
      // Priority 4: Extract from URL
      if (firstItem.link) {
        try {
          const url = new URL(firstItem.link);
          const pathParts = url.pathname.split('/')
            .filter(p => p && !p.includes('.html') && !p.includes('.'));
          if (pathParts.length > 0) {
            return pathParts
              .map(p => this._normalizeToSlug(p))
              .join('-');
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      }
      
      return '';
    },
    
    /**
     * Get titleSlug from storage (async)
     */
    _getTitleSlug: function(callback) {
      chrome.storage.local.get(['titleSlug'], (result) => {
        if (result.titleSlug) {
          // Convert "thuoc/thuoc-dieu-tri-ung-thu" to "thuoc-thuoc-dieu-tri-ung-thu"
          const slug = result.titleSlug.replace(/\//g, '-');
          callback(slug);
        } else {
          callback(null);
        }
      });
    },

    /**
     * Export CSV as multiple files
     */
    exportCSVMultipleFiles: function(data) {
      const totalFiles = Math.ceil(data.length / this.ITEMS_PER_FILE);
      
      const loadingModal = document.getElementById('exportLoadingModal');
      const loadingText = document.getElementById('exportLoadingText');
      if (loadingModal && loadingText) {
        loadingText.textContent = `Đang export ${totalFiles} files...`;
      }
      
      let headers = null;
      let currentFile = 0;
      let isCancelled = false;
      
      const downloadedFiles = [];
      
      // Get titleSlug from storage first
      this._getTitleSlug((titleSlug) => {
        const categorySlug = titleSlug || this._extractCategorySlug(data);
        
        const downloadNext = () => {
          if (isCancelled || currentFile >= totalFiles) {
            if (currentFile >= totalFiles) {
              // All files downloaded, delay a bit to ensure all downloads complete
              setTimeout(() => {
                this._resetExportState();
                this._showExportCompleteModal(downloadedFiles, data.length);
              }, 2000); // 2 second delay to ensure all downloads complete
            }
            return;
          }

          // Collect headers from first chunk
          if (!headers && currentFile === 0) {
            try {
              const firstChunk = data.slice(0, this.ITEMS_PER_FILE);
              headers = this._collectHeaders(firstChunk);
              if (!headers?.length) {
                window.PopupDisplay?.showMessage('Không thể xác định header', 'error');
                this._resetExportState();
                return;
              }
            } catch (error) {
              this._handleError(error, 'Lỗi khi thu thập headers');
              return;
            }
          }

          const start = currentFile * this.ITEMS_PER_FILE;
          const end = Math.min(start + this.ITEMS_PER_FILE, data.length);
          const chunk = data.slice(start, end);
          const fileNumber = currentFile + 1;
          
          // Generate filename with titleSlug or categorySlug
          // startIndex should start from 1, endIndex should be actual number of items
          const actualStartIndex = start + 1; // Start from 1, not 0
          const actualEndIndex = end; // End is actual number of items
          const filename = categorySlug 
            ? `scraped-data-${categorySlug}-${actualStartIndex}-${actualEndIndex}.csv`
            : `scraped-data-${actualStartIndex}-${actualEndIndex}.csv`;
          
          const loadingModal = document.getElementById('exportLoadingModal');
          const loadingText = document.getElementById('exportLoadingText');
          if (loadingModal && loadingText) {
            loadingText.textContent = `Đang export file ${fileNumber}/${totalFiles}...`;
          }
          
          setTimeout(() => {
            if (isCancelled) return;
            
            // Helper to handle chunk error and continue
            const handleChunkError = () => {
              currentFile++;
              if (currentFile >= totalFiles) this._resetExportState();
              setTimeout(downloadNext, 200);
            };
            
            let content;
            try {
              content = this._convertChunkToCSV(headers, chunk);
            } catch (error) {
              console.error(`[ExportHandler] Error converting chunk ${fileNumber}:`, error);
              handleChunkError();
              return;
            }
            
            if (!content) {
              console.warn(`[ExportHandler] Empty content for file ${fileNumber}`);
              handleChunkError();
              return;
            }
            
            try {
              this._downloadViaChromeAPI(content, filename, 'text/csv', 'csv', () => {
                downloadedFiles.push({ filename, format: 'csv' });
                if (!isCancelled) {
                  currentFile++;
                  setTimeout(downloadNext, 3000); // Delay between files
                } else {
                  this._resetExportState();
                }
              });
            } catch (error) {
              console.error(`[ExportHandler] Error downloading file ${fileNumber}:`, error);
              handleChunkError();
            }
          }, 50);
        };
        
        downloadNext();
      });
    },


    /**
     * Normalize product data to unified format
     * IMPORTANT: Does not mutate original data - returns new object
     */
    normalizeToAPIFormat: function(item) {
      if (!item || typeof item !== 'object') return item;
      if (item.basicInfo || item.pricing || item.rating) return item;
      
      if (item.sku && window.DataScraperProductFormatter) {
        const formatted = window.DataScraperProductFormatter.formatProductDetail(item);
        if (formatted) return formatted;
      }

      const priceDisplay = this._extractPriceDisplay(item);
      const category = this._extractCategory(item);
      const specifications = this._extractSpecifications(item);

      return {
        name: item.name || '',
        sku: item.sku || '',
        brand: item.brand || '',
        price: priceDisplay,
        packageSize: item.packageSize || specifications['Quy cách'] || '',
        rating: String(item.rating || ''),
        reviewCount: String(item.reviewCount || ''),
        commentCount: String(item.commentCount || ''),
        reviews: item.reviewCount && item.commentCount 
          ? `${item.reviewCount} đánh giá, ${item.commentCount} bình luận` 
          : '',
        category: category.array,
        categoryPath: category.path,
        categorySlug: category.slug,
        image: item.image || '',
        images: Array.isArray(item.images) ? item.images : (item.image ? [item.image] : []),
        description: item.description || item.fullDescription || item.shortDescription || '',
        ingredients: item.ingredients || specifications['Thành phần'] || '',
        usage: item.usage || item.indications || '',
        dosage: item.dosage || '',
        adverseEffect: item.adverseEffect || item.contraindications || '',
        careful: item.careful || '',
        preservation: item.preservation || item.storage || '',
        registrationNumber: specifications['Số đăng ký'] || item.registrationNumber || '',
        origin: specifications['Xuất xứ thương hiệu'] || item.origin || '',
        manufacturer: specifications['Nhà sản xuất'] || item.manufacturer || '',
        shelfLife: specifications['Hạn sử dụng'] || item.shelfLife || '',
        specifications: specifications,
        link: item.link || item.url || '',
        webName: item.webName || item.name || '',
        slug: item.slug || '',
        prices: item.prices || [],
        priceObj: item.priceObj || null,
        priceValue: item.priceValue || 0,
        packageOptions: Array.isArray(item.packageOptions) ? item.packageOptions : (Array.isArray(item.pricing?.packageOptions) ? item.pricing.packageOptions : []),
        productRanking: item.productRanking || 0,
        displayCode: item.displayCode || 1,
        isPublish: item.isPublish !== undefined ? item.isPublish : true
      };
    },

    /**
     * Extract price display
     */
    _extractPriceDisplay: function(item) {
      if (item.priceDisplay) return item.priceDisplay;
      
      let priceObj = item.price;
      let priceValue = 0;
      
      if (priceObj && typeof priceObj === 'object') {
        priceValue = priceObj.price || priceObj.value || 0;
        const unit = priceObj.measureUnitName || priceObj.unit || '';
        const currency = priceObj.currencySymbol || 'đ';
        return `${priceValue.toLocaleString('vi-VN')}${currency}${unit ? ' / ' + unit : ''}`;
      }
      
      if (item.prices?.length > 0) {
        priceObj = item.prices[0];
        priceValue = priceObj.price || 0;
        const unit = priceObj.measureUnitName || '';
        const currency = priceObj.currencySymbol || 'đ';
        return `${priceValue.toLocaleString('vi-VN')}${currency}${unit ? ' / ' + unit : ''}`;
      }
      
      if (typeof item.price === 'string') return item.price;
      return 'CONSULT';
    },

    /**
     * Extract category info
     */
    _extractCategory: function(item) {
      let category = item.category || [];
      let categoryPath = item.categoryPath || '';
      let categorySlug = item.categorySlug || '';
      
      if (!Array.isArray(category) && categoryPath) {
        category = categoryPath.split(' > ').map(name => ({ name: name.trim() }));
      }
      
      if (Array.isArray(category) && category.length > 0 && !categoryPath) {
        categoryPath = category.map(c => c.name || c).join(' > ');
        categorySlug = category.map(c => c.slug || c).join('/');
      }
      
      return { array: category, path: categoryPath, slug: categorySlug };
    },

    /**
     * Extract specifications
     */
    _extractSpecifications: function(item) {
      let specifications = {};
      
      if (item.specifications && typeof item.specifications === 'object') {
        specifications = item.specifications;
      } else if (item.specification) {
        try {
          const specObj = typeof item.specification === 'string' 
            ? JSON.parse(item.specification) 
            : item.specification;
          if (typeof specObj === 'object' && specObj !== null) {
            specifications = specObj;
          } else {
            specifications['Thông số kỹ thuật'] = item.specification;
          }
        } catch (e) {
          specifications['Thông số kỹ thuật'] = item.specification;
        }
      }
      
      const fields = {
        'Số đăng ký': item.registrationNumber,
        'Xuất xứ thương hiệu': item.origin,
        'Nhà sản xuất': item.manufacturer,
        'Hạn sử dụng': item.shelfLife,
        'Quy cách': item.packageSize,
        'Thành phần': item.ingredients
      };
      
      Object.keys(fields).forEach(key => {
        if (fields[key] && !specifications[key]) {
          specifications[key] = fields[key];
        }
      });
      
      return specifications;
    },

    /**
     * Convert data to CSV
     * Optimized: Build CSV incrementally to avoid large string in RAM
     */
    convertToCSV: function(data) {
      if (!data || !Array.isArray(data) || data.length === 0) {
        return '';
      }

      let headers;
      try {
        headers = this._collectHeaders(data);
      } catch (error) {
        console.error('[ExportHandler] Error collecting headers:', error);
        throw new Error('Lỗi khi thu thập headers: ' + error.message);
      }
      
      if (!headers?.length) {
        return '';
      }

      // Build CSV incrementally to avoid large string in RAM
      // Process in chunks and join incrementally
      const CHUNK_SIZE = 50; // Process 50 rows at a time
      const parts = [];
      
      // Header row
      parts.push(headers.map(h => `"${this.escapeCSV(h)}"`).join(','));
      
      // Process data in chunks
      for (let chunkStart = 0; chunkStart < data.length; chunkStart += CHUNK_SIZE) {
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, data.length);
        const chunkRows = [];
        
        for (let i = chunkStart; i < chunkEnd; i++) {
          try {
            if (!data[i] || typeof data[i] !== 'object') {
              chunkRows.push(headers.map(() => '""').join(','));
              continue;
            }
            
            // Clone item before normalizing to avoid mutating original data
            const itemCopy = JSON.parse(JSON.stringify(data[i]));
            const normalized = this.normalizeToAPIFormat(itemCopy);
            const flattened = this._flattenItem(normalized);
            const row = this._buildRow(headers, flattened, i);
            chunkRows.push(row);
          } catch (error) {
            console.warn(`[ExportHandler] Error processing item ${i}:`, error);
            chunkRows.push(headers.map(() => '""').join(','));
          }
        }
        
        // Join chunk and add to parts (avoid building huge array)
        parts.push(chunkRows.join('\n'));
      }

      // Join all parts (more memory efficient than building huge array)
      const result = parts.join('\n');
      return result;
    },

    /**
     * Collect headers from data sample
     */
    _collectHeaders: function(data) {
      const allKeys = new Set();
      const MAX_SAMPLES = Math.min(5, data.length);
      
      for (let i = 0; i < MAX_SAMPLES; i++) {
        try {
          if (!data[i] || typeof data[i] !== 'object') continue;
          // Clone item before normalizing to avoid mutating original data
          const itemCopy = JSON.parse(JSON.stringify(data[i]));
          const normalized = this.normalizeToAPIFormat(itemCopy);
          const flattened = this._flattenItem(normalized);
          Object.keys(flattened).forEach(key => allKeys.add(key));
        } catch (error) {
          console.error(`[ExportHandler] Error collecting keys from item ${i}:`, error);
        }
      }
      
      return Array.from(allKeys);
    },

    /**
     * Convert chunk to CSV
     * Optimized: Build incrementally to avoid large string in RAM
     */
    _convertChunkToCSV: function(headers, chunk) {
      if (!Array.isArray(chunk) || chunk.length === 0) return '';

      const parts = [];
      parts.push(headers.map(h => `"${this.escapeCSV(h)}"`).join(','));

      for (let i = 0; i < chunk.length; i++) {
        try {
          if (!chunk[i] || typeof chunk[i] !== 'object') {
            parts.push(headers.map(() => '""').join(','));
            continue;
          }

          // Clone item before normalizing to avoid mutating original data
          const itemCopy = JSON.parse(JSON.stringify(chunk[i]));
          const normalized = this.normalizeToAPIFormat(itemCopy);
          const flattened = this._flattenItem(normalized);
          const row = this._buildRow(headers, flattened, i);
          parts.push(row);
        } catch (error) {
          console.error(`[ExportHandler] Error processing item ${i}:`, error);
          parts.push(headers.map(() => '""').join(','));
        }
      }

      return parts.join('\n');
    },

    /**
     * Build CSV row from headers and flattened data
     */
    _buildRow: function(headers, flattened, index) {
      const row = headers.map(header => {
        try {
          const val = flattened[header];
          let value = '';
          
          if (val !== null && val !== undefined) {
            if (typeof val === 'function') {
              value = '[Function]';
            } else if (typeof val === 'symbol') {
              value = '[Symbol]';
            } else {
              const str = String(val);
              value = str.length > this.MAX_STRING_LENGTH 
                ? str.substring(0, this.MAX_STRING_LENGTH) + '...[truncated]' 
                : str;
            }
          }
          
          return `"${this.escapeCSV(value)}"`;
        } catch (error) {
          console.error(`[ExportHandler] Error processing header "${header}" in item ${index}:`, error);
          return '""';
        }
      });

      const rowString = row.join(',');
      if (rowString.length > this.MAX_ROW_LENGTH) {
        console.warn(`[ExportHandler] Row ${index} too large, truncating`);
        return rowString.substring(0, this.MAX_ROW_LENGTH) + '...[truncated]';
      }
      
      return rowString;
    },


    /**
     * Flatten a single item
     */
    _flattenItem: function(item) {
      if (typeof item !== 'object' || item === null) {
        return { value: item };
      }
      return this._flattenObject(item, '', 0, this.MAX_DEPTH, new WeakSet());
    },

    /**
     * Flatten nested objects
     */
    _flattenObject: function(obj, prefix = '', depth = 0, maxDepth = 5, visited = new WeakSet()) {
      if (obj === null || obj === undefined) {
        return { [prefix || 'value']: '' };
      }

      try {
        if (visited.has(obj)) {
          return { [prefix || 'value']: '[Circular]' };
        }
      } catch (e) {
        return { [prefix || 'value']: '[Circular]' };
      }
      
      if (depth > maxDepth) {
        try {
          const str = JSON.stringify(obj);
          return { [prefix || 'value']: str.length > 1000 ? str.substring(0, 1000) + '...' : str };
        } catch (e) {
          return { [prefix || 'value']: '[Object]' };
        }
      }
      
      if (typeof obj !== 'object') {
        return { [prefix || 'value']: String(obj).substring(0, 10000) };
      }

      try {
        if (obj !== null) visited.add(obj);
      } catch (e) {}
      
      const flattened = {};
      try {
        const keys = Object.keys(obj).slice(0, this.MAX_KEYS_PER_OBJECT);
        
        for (const key of keys) {
          try {
            if (!obj.hasOwnProperty(key)) continue;
            
            const newKey = prefix ? `${prefix}.${key}` : key;
            const value = obj[key];
            
            if (value === null || value === undefined) {
              flattened[newKey] = '';
            } else if (Array.isArray(value)) {
              // Special handling for packageOptions - format as readable string
              if (key === 'packageOptions' && value.length > 0) {
                const formatted = value.map(opt => {
                  const parts = [];
                  if (opt.unitDisplay) parts.push(opt.unitDisplay);
                  if (opt.priceDisplay) parts.push(opt.priceDisplay);
                  if (opt.specification) parts.push(`(${opt.specification})`);
                  return parts.join(' ');
                }).join(' | ');
                flattened[newKey] = formatted;
              } else {
                flattened[newKey] = value.length > 500 
                  ? `[Array(${value.length})]`
                  : this._stringifyArray(value);
              }
            } else if (typeof value === 'object') {
              const nested = this._flattenObject(value, newKey, depth + 1, maxDepth, visited);
              if (nested && typeof nested === 'object') {
                Object.assign(flattened, nested);
              } else {
                flattened[newKey] = '[Error]';
              }
            } else {
              const str = String(value);
              flattened[newKey] = str.length > 10000 ? str.substring(0, 10000) + '...' : str;
            }
          } catch (keyError) {
            console.error(`[ExportHandler] Error processing key "${key}":`, keyError);
            continue;
          }
        }
      } catch (error) {
        console.error('[ExportHandler] _flattenObject error:', error);
        flattened[prefix || 'value'] = '[Error]';
      } finally {
        try {
          if (typeof obj === 'object' && obj !== null) {
            visited.delete(obj);
          }
        } catch (e) {}
      }

      return flattened;
    },

    /**
     * Stringify array safely
     */
    _stringifyArray: function(arr) {
      try {
        const str = JSON.stringify(arr);
        return str.length > 5000 ? str.substring(0, 5000) + '...' : str;
      } catch (e) {
        return `[Array(${arr.length})]`;
      }
    },

    /**
     * Escape CSV value
     */
    escapeCSV: function(value) {
      try {
        if (value === null || value === undefined) return '';
        if (typeof value === 'function') return '[Function]';
        if (typeof value === 'symbol') return '[Symbol]';
        if (typeof value === 'object') {
          try {
            const str = JSON.stringify(value);
            return str.length > 10000 ? str.substring(0, 10000) + '...[truncated]' : str;
          } catch (e) {
            return '[Object]';
          }
        }
        
        let str = String(value);
        if (str.length > this.MAX_STRING_LENGTH) {
          str = str.substring(0, this.MAX_STRING_LENGTH) + '...[truncated]';
        }
        
        return str.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' ');
      } catch (error) {
        console.error('[ExportHandler] escapeCSV error:', error);
        return '[Error]';
      }
    },

    /**
     * Validate data before export
     */
    _validateData: function(data) {
      if (!data || !Array.isArray(data)) {
        return { valid: false, message: 'Dữ liệu không hợp lệ' };
      }

      if (data.length === 0) {
        return { valid: false, message: 'Không có dữ liệu để export' };
      }

      let validCount = 0;
      for (let i = 0; i < Math.min(10, data.length); i++) {
        if (data[i] && typeof data[i] === 'object') {
          validCount++;
        }
      }

      if (validCount === 0) {
        return { valid: false, message: 'Không tìm thấy dữ liệu hợp lệ' };
      }

      // Estimate storage size
      try {
        const sample = JSON.stringify(data.slice(0, 10));
        const estimatedSize = (sample.length / 10) * data.length;
        const estimatedMB = estimatedSize / (1024 * 1024);
        
        if (estimatedMB > 100) {
          return { 
            valid: true, 
            message: `Cảnh báo: Dữ liệu ước tính ~${estimatedMB.toFixed(1)}MB. Export có thể mất nhiều thời gian.`,
            warning: true
          };
        }
      } catch (e) {
        // Ignore size estimation errors
      }

      return { valid: true };
    },


    /**
     * Show export complete modal
     * Hide loading modal and show success modal
     */
    _showExportCompleteModal: function(files, totalItems = null) {
      // Hide loading modal
      const loadingModal = document.getElementById('exportLoadingModal');
      if (loadingModal) {
        loadingModal.style.display = 'none';
      }
      
      // Show success modal
      const modal = document.getElementById('exportCompleteModal');
      const infoDiv = document.getElementById('exportCompleteInfo');
      
      if (!modal || !infoDiv) {
        // Fallback to simple message
        window.PopupDisplay?.showMessage(
          `Đã export thành công ${files.length} file(s)!`,
          'success'
        );
        return;
      }
      
      // Mark export as completed
      chrome.storage.local.set({ exportCompleted: true });

      const fileCount = files.length;
      
      // Get default download folder (browser's default)
      const downloadFolder = 'thư mục Downloads mặc định của trình duyệt';
      
      // Calculate exported range from filenames and save state
      let exportedRange = '';
      let lastExportedIndex = 0;
      
      if (files.length > 0) {
        const firstFile = files[0].filename;
        const lastFile = files[files.length - 1].filename;
        // Extract range from filename: scraped-data-category-1-100.csv
        const firstMatch = firstFile.match(/-(\d+)-(\d+)\./);
        const lastMatch = lastFile.match(/-(\d+)-(\d+)\./);
        if (firstMatch && lastMatch) {
          const startIndex = parseInt(firstMatch[1]);
          const endIndex = parseInt(lastMatch[2]);
          exportedRange = `${startIndex}-${endIndex}`;
          lastExportedIndex = endIndex;
        }
      }
      
      // Clear batch info if exists
      chrome.storage.local.remove(['currentExportBatch']);
      
      infoDiv.innerHTML = `
        <div style="margin-bottom: 15px;">
          <strong>✅ Đã xuất thành công:</strong> ${fileCount} file${fileCount > 1 ? 's' : ''}
          ${exportedRange ? ` (items ${exportedRange})` : ''}
          ${totalItems ? ` / Tổng: ${totalItems} items` : ''}
        </div>
        <div style="margin-bottom: 15px;">
          <strong>📁 Đường dẫn folder:</strong><br>
          <span style="color: #666; font-size: 12px;">${downloadFolder}</span>
        </div>
      `;
      
      modal.style.display = 'flex';
      
      // Clear data after export
      this._clearDataAfterExport();
    },


    /**
     * Clear data after export
     */
    _clearDataAfterExport: function() {
      // Clear in-memory data
      if (window.PopupState) {
        window.PopupState.clearDetailData();
        window.PopupState.currentDetailData = null;
      }
      
      // Clear storage data
      chrome.storage.local.remove([
        'scraper_detail_data',
        window.PopupState?.STORAGE_KEY_DETAIL
      ].filter(Boolean));
      
      // Clear results display
      if (window.PopupDisplay) {
        window.PopupDisplay.clearResults();
      }
    },

  };
})();
