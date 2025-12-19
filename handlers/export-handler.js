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
     * Helper: Download via Chrome Downloads API (Manifest V3 standard)
     */
    _downloadViaChromeAPI: function(content, filename, mimeType, format, callback) {
      const downloadCallback = this._createDownloadCallback(callback);
      
      try {
        // Create blob and blob URL
        const processedContent = format === 'csv' ? '\ufeff' + content : content;
        const blob = new Blob([processedContent], { type: mimeType + ';charset=utf-8;' });
        const blobUrl = URL.createObjectURL(blob);
        
        const sizeInMB = blob.size / (1024 * 1024);
        console.log(`[ExportHandler] Downloading via Chrome API, size: ${sizeInMB.toFixed(2)}MB`);
        
        // Validate inputs before calling chrome.downloads.download
        if (!blobUrl || typeof blobUrl !== 'string' || !blobUrl.startsWith('blob:')) {
          throw new Error(`Invalid blobUrl: ${blobUrl}`);
        }
        
        if (!filename || typeof filename !== 'string' || filename.trim() === '') {
          throw new Error(`Invalid filename: ${filename}`);
        }
        
        // Check if chrome.downloads API is available
        if (typeof chrome === 'undefined' || typeof chrome.downloads === 'undefined') {
          throw new Error('chrome.downloads API is not available');
        }
        
        if (typeof chrome.downloads.download !== 'function') {
          throw new Error('chrome.downloads.download is not a function');
        }
        
        // Use chrome.downloads.download (Manifest V3 standard - no DOM hack)
        console.log('[ExportHandler] Calling chrome.downloads.download with:', {
          filename,
          urlType: typeof blobUrl,
          urlPreview: blobUrl.substring(0, 50) + '...',
          blobSize: blob.size,
          hasChromeDownloads: typeof chrome.downloads !== 'undefined',
          hasDownloadFunction: typeof chrome.downloads?.download === 'function'
        });
        
        // Wrap in try-catch to catch any synchronous errors
        // NOTE: In popup context, chrome.downloads.download may crash if called immediately
        // Use setTimeout to defer the call and avoid crash
        const callDownload = () => {
          try {
            console.log('[ExportHandler] About to call chrome.downloads.download...');
            chrome.downloads.download({
              url: blobUrl,
              filename: filename,
              saveAs: true,
              conflictAction: 'uniquify' // Auto-rename if file exists
            }, (downloadId) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            if (errorMsg.includes('USER_CANCELED')) {
              console.log('[ExportHandler] User canceled download');
              // Revoke URL even if canceled
              setTimeout(() => {
                try {
                  URL.revokeObjectURL(blobUrl);
                } catch (e) {
                  console.warn('[ExportHandler] Error revoking blob URL:', e);
                }
              }, 100);
              downloadCallback();
            } else {
              console.error('[ExportHandler] Download error:', errorMsg);
              // Revoke URL on error
              setTimeout(() => {
                try {
                  URL.revokeObjectURL(blobUrl);
                } catch (e) {
                  console.warn('[ExportHandler] Error revoking blob URL:', e);
                }
              }, 100);
              this._handleError(new Error(errorMsg), 'Lỗi khi tải xuống', downloadCallback);
            }
          } else {
            console.log('[ExportHandler] Download started successfully:', filename, 'ID:', downloadId);
            
            // Try to show download in browser's download manager
            // This may help trigger the save dialog if saveAs didn't work
            // NOTE: chrome.downloads.show can crash in some contexts (popup, Brave browser)
            // So we validate downloadId and wrap in extensive error handling
            // Set ENABLE_DOWNLOADS_SHOW to false to disable this feature completely
            if (this.ENABLE_DOWNLOADS_SHOW && downloadId !== undefined && downloadId !== null) {
              console.log('[ExportHandler] Attempting to show download in manager, downloadId:', downloadId, 'type:', typeof downloadId);
              
              // Check if chrome.downloads.show is available
              if (typeof chrome.downloads !== 'undefined' && typeof chrome.downloads.show === 'function') {
                try {
                  console.log('[ExportHandler] Calling chrome.downloads.show...');
                  chrome.downloads.show(downloadId);
                  console.log('[ExportHandler] ✅ chrome.downloads.show called successfully');
                } catch (e) {
                  console.warn('[ExportHandler] ⚠️  Error calling chrome.downloads.show:', e);
                  console.warn('[ExportHandler] Error details:', {
                    name: e?.name,
                    message: e?.message,
                    stack: e?.stack?.substring(0, 200)
                  });
                  // Don't throw - this is optional functionality
                }
              } else {
                console.warn('[ExportHandler] ⚠️  chrome.downloads.show not available');
              }
            } else {
              if (!this.ENABLE_DOWNLOADS_SHOW) {
                console.log('[ExportHandler] ℹ️  chrome.downloads.show is disabled (ENABLE_DOWNLOADS_SHOW=false)');
              } else {
                console.warn('[ExportHandler] ⚠️  Invalid downloadId, skipping chrome.downloads.show:', downloadId);
              }
            }
            
            // Show success message
            window.PopupDisplay?.showMessage(
              `📥 Đang tải xuống: ${filename}...\n💡 Kiểm tra thư mục Downloads hoặc click icon download ở góc trên trình duyệt`,
              'loading'
            );
            
            // Revoke blob URL after download completes
            // Use longer delay to ensure download completes (even if user takes time to choose folder)
            const revokeDelay = 30000; // 30 seconds - enough time for user to interact with save dialog
            setTimeout(() => {
              try {
                URL.revokeObjectURL(blobUrl);
                console.log('[ExportHandler] Blob URL revoked after download');
              } catch (e) {
                console.warn('[ExportHandler] Error revoking blob URL:', e);
              }
            }, revokeDelay);
            
            downloadCallback();
          }
        });
          } catch (syncError) {
            // Catch any synchronous errors from chrome.downloads.download call itself
            console.error('[ExportHandler] ❌ Synchronous error calling chrome.downloads.download:', syncError);
            console.error('[ExportHandler] Error details:', {
              name: syncError?.name,
              message: syncError?.message,
              stack: syncError?.stack?.substring(0, 500)
            });
            
            // Cleanup blob URL
            try {
              URL.revokeObjectURL(blobUrl);
            } catch (revokeError) {
              console.warn('[ExportHandler] Error revoking blob URL after sync error:', revokeError);
            }
            
            this._handleError(syncError, 'Lỗi khi gọi chrome.downloads.download', downloadCallback);
          }
        };
        
        // Defer the call to avoid crash in popup context
        // Small delay allows popup to stabilize before calling download API
        const delay = 50; // 50ms delay
        console.log(`[ExportHandler] Scheduling chrome.downloads.download call in ${delay}ms...`);
        setTimeout(() => {
          callDownload();
        }, delay);
      } catch (error) {
        console.error('[ExportHandler] ❌ Outer catch - Error in _downloadViaChromeAPI:', error);
        this._handleError(error, 'Lỗi khi tạo file download', downloadCallback);
      }
    },

    /**
     * Main export function
     */
    exportData: function(format, data) {
      // Early validation
      if (this.isExporting) {
        console.warn('[ExportHandler] Export already in progress');
        window.PopupDisplay?.showMessage('Đang export, vui lòng đợi...', 'warning');
        return;
      }
      
      const now = Date.now();
      if (now - this.lastExportTime < this.EXPORT_DEBOUNCE_MS) {
        console.warn('[ExportHandler] Export request too soon');
        return;
      }
      this.lastExportTime = now;

      if (!data || !Array.isArray(data) || data.length === 0) {
        window.PopupDisplay?.showMessage('Không có dữ liệu để export', 'error');
        return;
      }

      // Validate data
      let validation;
      try {
        validation = this._validateData(data);
      } catch (error) {
        this._handleError(error, 'Lỗi khi kiểm tra dữ liệu');
        return;
      }
      
      if (!validation.valid) {
        window.PopupDisplay?.showMessage(validation.message, 'error');
        return;
      }

      // Warn for large datasets
      if (data.length > 1000) {
        if (!confirm(`Bạn đang export ${data.length} items. Điều này có thể tạo nhiều file và mất thời gian.\n\nBạn có muốn tiếp tục không?`)) {
          return;
        }
      }

      this.isExporting = true;

      // Split CSV files if > 300 items (safe limit for Chrome extension)
      if (format === 'csv' && data.length > 300) {
        window.PopupDisplay?.showMessage(`Đang chia ${data.length} items thành ${Math.ceil(data.length / this.ITEMS_PER_FILE)} files...`, 'loading');
        setTimeout(() => {
          try {
            this.exportCSVMultipleFiles(data);
          } catch (error) {
            this._handleError(error, 'Lỗi khi export nhiều file');
          }
        }, 100);
        return;
      }

      // Single file export (for JSON or CSV <= 300 items)
      this._exportSingleFile(format, data);
    },

    /**
     * Export single file
     */
    _exportSingleFile: function(format, data) {
      window.PopupDisplay?.showMessage('Đang chuẩn bị export...', 'loading');
      
      console.log(`[ExportHandler] _exportSingleFile called with format=${format}, data.length=${data?.length || 0}`);
      
      let exportContent;
      try {
        exportContent = this.generateExportContent(format, data);
        console.log('[ExportHandler] Content generated:', {
          hasContent: !!exportContent?.content,
          contentLength: exportContent?.content?.length || 0,
          filename: exportContent?.filename,
          mimeType: exportContent?.mimeType
        });
      } catch (error) {
        console.error('[ExportHandler] Error generating content:', error);
        this._handleError(error, 'Lỗi khi tạo nội dung export');
        return;
      }
      
      if (!exportContent?.content) {
        console.error('[ExportHandler] No content generated!');
        window.PopupDisplay?.showMessage('Không thể tạo nội dung export', 'error');
        this._resetExportState();
        return;
      }

      const { content, filename, mimeType } = exportContent;
      console.log('[ExportHandler] Creating blob from content, length:', content.length);
      const blob = new Blob([content], { type: mimeType + ';charset=utf-8;' });
      const sizeInMB = blob.size / (1024 * 1024);
      console.log('[ExportHandler] Blob created, size:', sizeInMB.toFixed(2), 'MB');
      
      if (sizeInMB > 50) {
        window.PopupDisplay?.showMessage('File quá lớn (>50MB). Vui lòng giảm số lượng dữ liệu.', 'error');
        this._resetExportState();
        return;
      }

      const downloadCallback = this._createDownloadCallback(() => {
        window.PopupDisplay?.showMessage(`Đã export thành công: ${filename}`, 'success');
        setTimeout(() => this.closeModal(), 1000);
      });

      // Large files: always use Chrome Downloads API (no DOM hack)
      if (blob.size > this.MAX_BACKGROUND_SIZE) {
        console.log(`[ExportHandler] File size ${sizeInMB.toFixed(2)}MB > ${(this.MAX_BACKGROUND_SIZE / (1024 * 1024)).toFixed(2)}MB, using Chrome Downloads API`);
        this._downloadViaChromeAPI(content, filename, mimeType, format, downloadCallback);
        return;
      }

      // Small files: try background script first
      this._tryBackgroundDownload(content, filename, mimeType, format, downloadCallback);
    },

    /**
     * Try background download for small files (<2MB), fallback to Chrome API
     */
    _tryBackgroundDownload: function(content, filename, mimeType, format, callback) {
      const contentSize = new Blob([content]).size;
      if (contentSize > this.MAX_BACKGROUND_SIZE) {
        console.log('[ExportHandler] Content too large for message, using Chrome Downloads API');
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
            console.warn('[ExportHandler] Background download failed, using Chrome Downloads API');
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
     * Generate export content
     */
    generateExportContent: function(format, data) {
      if (format === 'json') {
        const content = JSON.stringify(data, null, 2);
        return {
          content: content,
          filename: `scraped-data-${Date.now()}.json`,
          mimeType: 'application/json'
        };
      }
      
      if (format === 'csv') {
        const content = this.convertToCSV(data);
        return {
          content: content,
          filename: `scraped-data-${Date.now()}.csv`,
          mimeType: 'text/csv'
        };
      }
      
      return null;
    },

    /**
     * Export CSV as multiple files
     */
    exportCSVMultipleFiles: function(data) {
      const totalFiles = Math.ceil(data.length / this.ITEMS_PER_FILE);
      console.log(`[ExportHandler] Splitting ${data.length} items into ${totalFiles} files`);
      window.PopupDisplay?.showMessage(`Đang export ${totalFiles} files...`, 'loading');
      
      let headers = null;
      let currentFile = 0;
      let isCancelled = false;
      
      const downloadNext = () => {
        if (isCancelled || currentFile >= totalFiles) {
          if (currentFile >= totalFiles) {
            this._resetExportState();
            window.PopupDisplay?.showMessage(`Đã export thành công ${totalFiles} files!`, 'success');
            setTimeout(() => this.closeModal(), 2000);
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
            console.log(`[ExportHandler] Found ${headers.length} headers`);
          } catch (error) {
            this._handleError(error, 'Lỗi khi thu thập headers');
            return;
          }
        }

        const start = currentFile * this.ITEMS_PER_FILE;
        const end = Math.min(start + this.ITEMS_PER_FILE, data.length);
        const chunk = data.slice(start, end);
        const fileNumber = currentFile + 1;
        const filename = `scraped-data-${Date.now()}-(${fileNumber}).csv`;
        
        console.log(`[ExportHandler] Exporting file ${fileNumber}/${totalFiles} (items ${start}-${end-1})`);
        window.PopupDisplay?.showMessage(`Đang export file ${fileNumber}/${totalFiles}...`, 'loading');
        
        setTimeout(() => {
          if (isCancelled) return;
          
          let content;
          try {
            content = this._convertChunkToCSV(headers, chunk);
          } catch (error) {
            console.error(`[ExportHandler] Error converting chunk ${fileNumber}:`, error);
            currentFile++;
            if (currentFile >= totalFiles) this._resetExportState();
            setTimeout(downloadNext, 200);
            return;
          }
          
          if (!content) {
            console.warn(`[ExportHandler] Empty content for file ${fileNumber}`);
            currentFile++;
            if (currentFile >= totalFiles) this._resetExportState();
            setTimeout(downloadNext, 200);
            return;
          }
          
          try {
            this._downloadViaChromeAPI(content, filename, 'text/csv', 'csv', () => {
              if (!isCancelled) {
                currentFile++;
                setTimeout(downloadNext, 2500);
              } else {
                this._resetExportState();
              }
            });
          } catch (error) {
            console.error(`[ExportHandler] Error downloading file ${fileNumber}:`, error);
            currentFile++;
            if (currentFile >= totalFiles) this._resetExportState();
            setTimeout(downloadNext, 200);
          }
        }, 50);
      };
      
      downloadNext();
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
        console.warn('[ExportHandler] Empty or invalid data in convertToCSV');
        return '';
      }

      console.log(`[ExportHandler] convertToCSV: Processing ${data.length} items`);
      
      let headers;
      try {
        headers = this._collectHeaders(data);
        console.log(`[ExportHandler] Collected ${headers.length} headers:`, headers.slice(0, 10).join(', '), '...');
      } catch (error) {
        console.error('[ExportHandler] Error collecting headers:', error);
        throw new Error('Lỗi khi thu thập headers: ' + error.message);
      }
      
      if (!headers?.length) {
        console.warn('[ExportHandler] No headers found');
        return '';
      }

      // Build CSV incrementally to avoid large string in RAM
      // Process in chunks and join incrementally
      const CHUNK_SIZE = 50; // Process 50 rows at a time
      const parts = [];
      
      // Header row
      parts.push(headers.map(h => `"${this.escapeCSV(h)}"`).join(','));
      console.log('[ExportHandler] Header row created, length:', parts[0].length);
      
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
        
        // Log progress for large datasets
        if (data.length > 200 && chunkEnd % 100 === 0) {
          console.log(`[ExportHandler] Processed ${chunkEnd}/${data.length} rows`);
        }
      }

      // Join all parts (more memory efficient than building huge array)
      const result = parts.join('\n');
      console.log(`[ExportHandler] CSV conversion complete, total length: ${result.length} chars`);
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
     * Join rows in batches
     */
    _joinRows: function(rows) {
      const JOIN_BATCH = 100;
      const resultParts = [];
      
      for (let i = 0; i < rows.length; i += JOIN_BATCH) {
        resultParts.push(rows.slice(i, i + JOIN_BATCH).join('\n'));
      }
      
      return resultParts.join('\n');
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
              flattened[newKey] = value.length > 500 
                ? `[Array(${value.length})]`
                : this._stringifyArray(value);
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
     * Close modal
     */
    closeModal: function() {
      const resultsModal = document.getElementById('resultsModal');
      if (resultsModal) {
        resultsModal.style.display = 'none';
        resultsModal.classList.remove('active');
      }
    }
  };
})();
