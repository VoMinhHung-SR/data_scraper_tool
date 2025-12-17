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

    /**
     * Main export function
     */
    exportData: function(format, data) {
      console.log('[ExportHandler] exportData:', { format, length: Array.isArray(data) ? data.length : 0 });
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        window.PopupDisplay.showMessage('Không có dữ liệu để export', 'error');
        return;
      }

      // Validate data before export
      const validation = this._validateData(data);
      if (!validation.valid) {
        window.PopupDisplay.showMessage(validation.message, 'error');
        return;
      }

      // Show warning for very large datasets
      if (data.length > 1000) {
        const shouldContinue = confirm(
          `Bạn đang export ${data.length} items. Điều này có thể tạo nhiều file và mất thời gian.\n\n` +
          `Bạn có muốn tiếp tục không?`
        );
        if (!shouldContinue) return;
      }

      // Split CSV files if > 200 items
      if (format === 'csv' && data.length > 200) {
        window.PopupDisplay.showMessage(`Đang chia ${data.length} items thành ${Math.ceil(data.length / this.ITEMS_PER_FILE)} files...`, 'loading');
        setTimeout(() => this.exportCSVMultipleFiles(data), 100);
        return;
      }

      // Single file export
      window.PopupDisplay.showMessage('Đang chuẩn bị export...', 'loading');
      const { content, filename, mimeType } = this.generateExportContent(format, data);
      
      if (!content) {
        window.PopupDisplay.showMessage('Không thể tạo nội dung export', 'error');
        return;
      }

      const blob = new Blob([content], { type: mimeType + ';charset=utf-8;' });
      const sizeInMB = blob.size / (1024 * 1024);
      
      if (sizeInMB > 50) {
        window.PopupDisplay.showMessage('File quá lớn (>50MB). Vui lòng giảm số lượng dữ liệu.', 'error');
        return;
      }

      // Use direct download for large files
      if (blob.size > this.MAX_BACKGROUND_SIZE) {
        this.downloadDirectly(content, filename, mimeType, format);
        return;
      }

      // Use background script for small files
      chrome.runtime.sendMessage({
        action: 'downloadFile',
        content: content,
        filename: filename,
        mimeType: mimeType
      }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          this.downloadDirectly(content, filename, mimeType, format);
        } else {
          window.PopupDisplay.showMessage(`Đã export thành công: ${filename}`, 'success');
          setTimeout(() => this.closeModal(), 1000);
        }
      });
    },

    /**
     * Generate export content
     */
    generateExportContent: function(format, data) {
      if (format === 'json') {
        return {
          content: JSON.stringify(data, null, 2),
          filename: `scraped-data-${Date.now()}.json`,
          mimeType: 'application/json'
        };
      }
      
      if (format === 'csv') {
        return {
          content: this.convertToCSV(data),
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
      window.PopupDisplay.showMessage(`Đang export ${totalFiles} files...`, 'loading');
      
      let headers = null;
      let currentFile = 0;
      
      const downloadNext = () => {
        if (currentFile >= totalFiles) {
          window.PopupDisplay.showMessage(`Đã export thành công ${totalFiles} files!`, 'success');
          setTimeout(() => this.closeModal(), 2000);
          return;
        }

        // Collect headers from first chunk
        if (!headers && currentFile === 0) {
          try {
            const firstChunk = data.slice(0, this.ITEMS_PER_FILE);
            headers = this._collectHeaders(firstChunk);
            if (!headers.length) {
              window.PopupDisplay.showMessage('Không thể xác định header', 'error');
              return;
            }
            console.log(`[ExportHandler] Found ${headers.length} headers`);
          } catch (error) {
            console.error('[ExportHandler] Error collecting headers:', error);
            window.PopupDisplay.showMessage('Lỗi khi thu thập headers', 'error');
            return;
          }
        }

        const start = currentFile * this.ITEMS_PER_FILE;
        const end = Math.min(start + this.ITEMS_PER_FILE, data.length);
        const chunk = data.slice(start, end);
        const fileNumber = currentFile + 1;
        const filename = `scraped-data-${Date.now()}-(${fileNumber}).csv`;
        
        console.log(`[ExportHandler] Exporting file ${fileNumber}/${totalFiles} (items ${start}-${end-1})`);
        window.PopupDisplay.showMessage(`Đang export file ${fileNumber}/${totalFiles}...`, 'loading');
        
        setTimeout(() => {
          try {
            const content = this._convertChunkToCSV(headers, chunk);
            if (!content) {
              currentFile++;
              setTimeout(downloadNext, 200);
              return;
            }
            
            this.downloadDirectly(content, filename, 'text/csv', 'csv', () => {
              currentFile++;
              setTimeout(downloadNext, 2500);
            });
          } catch (error) {
            console.error(`[ExportHandler] Error exporting file ${fileNumber}:`, error);
            currentFile++;
            setTimeout(downloadNext, 200);
          }
        }, 50);
      };
      
      downloadNext();
    },

    /**
     * Download file directly
     */
    downloadDirectly: function(content, filename, mimeType, format, callback) {
      try {
        const processedContent = format === 'csv' ? '\ufeff' + content : content;
        const blob = new Blob([processedContent], { type: mimeType + ';charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              a.click();
              console.log('[ExportHandler] Download triggered:', filename);
              
              setTimeout(() => {
                if (document.body.contains(a)) {
                  document.body.removeChild(a);
                }
              }, 100);
              
              const revokeDelay = callback ? 3000 : 2000;
              setTimeout(() => {
                URL.revokeObjectURL(url);
                if (callback) callback();
              }, revokeDelay);
            } catch (error) {
              console.error('[ExportHandler] Download error:', error);
              try {
                if (document.body.contains(a)) document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (e) {}
              if (callback) callback();
            }
          });
        });
        
        if (!callback) {
          setTimeout(() => {
            this.closeModal();
            window.PopupDisplay.showMessage(`Đã export thành công: ${filename}`, 'success');
          }, 2500);
        }
        
        window.PopupDisplay.showMessage(`Đang tải xuống: ${filename}...`, 'loading');
      } catch (error) {
        console.error('[ExportHandler] Fatal error:', error);
        window.PopupDisplay.showMessage('Lỗi khi export: ' + error.message, 'error');
        if (callback) callback();
      }
    },

    /**
     * Normalize product data to unified format
     */
    normalizeToAPIFormat: function(item) {
      if (!item || typeof item !== 'object') return item;

      // Already in grouped format
      if (item.basicInfo || item.pricing || item.rating) {
        return item;
      }

      // Use formatter if available
      if (item.sku && window.DataScraperProductFormatter) {
        const formatted = window.DataScraperProductFormatter.formatProductDetail(item);
        if (formatted) return formatted;
      }

      // Basic normalization
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
      
      if (item.prices && Array.isArray(item.prices) && item.prices.length > 0) {
        priceObj = item.prices[0];
        priceValue = priceObj.price || 0;
        const unit = priceObj.measureUnitName || '';
        const currency = priceObj.currencySymbol || 'đ';
        return `${priceValue.toLocaleString('vi-VN')}${currency}${unit ? ' / ' + unit : ''}`;
      }
      
      if (typeof item.price === 'string') {
        return item.price;
      }
      
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
      
      // Add individual fields
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
     */
    convertToCSV: function(data) {
      if (!data || !Array.isArray(data) || data.length === 0) return '';

      const headers = this._collectHeaders(data);
      if (!headers.length) return '';

      const rows = [headers.map(h => `"${this.escapeCSV(h)}"`).join(',')];
      
      for (let i = 0; i < data.length; i++) {
        try {
          if (!data[i] || typeof data[i] !== 'object') {
            rows.push(headers.map(() => '""').join(','));
            continue;
          }
          
          const normalized = this.normalizeToAPIFormat(data[i]);
          const flattened = this._flattenItem(normalized);
          const row = this._buildRow(headers, flattened, i);
          rows.push(row);
        } catch (error) {
          console.error(`[ExportHandler] Error processing item ${i}:`, error);
          rows.push(headers.map(() => '""').join(','));
        }
      }

      return this._joinRows(rows);
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
          
          const normalized = this.normalizeToAPIFormat(data[i]);
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
     */
    _convertChunkToCSV: function(headers, chunk) {
      if (!Array.isArray(chunk) || chunk.length === 0) return '';

      const rows = [headers.map(h => `"${this.escapeCSV(h)}"`).join(',')];
      const BATCH_SIZE = 25;

      for (let i = 0; i < chunk.length; i++) {
        try {
          if (!chunk[i] || typeof chunk[i] !== 'object') {
            rows.push(headers.map(() => '""').join(','));
            continue;
          }

          const normalized = this.normalizeToAPIFormat(chunk[i]);
          const flattened = this._flattenItem(normalized);
          const row = this._buildRow(headers, flattened, i);
          rows.push(row);
        } catch (error) {
          console.error(`[ExportHandler] Error processing item ${i}:`, error);
          rows.push(headers.map(() => '""').join(','));
        }

        if ((i + 1) % BATCH_SIZE === 0 || i === chunk.length - 1) {
          console.log(`[ExportHandler] Built ${i + 1}/${chunk.length} rows`);
        }
      }

      return this._joinRows(rows);
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

      // Check for valid items
      let validCount = 0;
      for (let i = 0; i < Math.min(10, data.length); i++) {
        if (data[i] && typeof data[i] === 'object') {
          validCount++;
        }
      }

      if (validCount === 0) {
        return { valid: false, message: 'Không tìm thấy dữ liệu hợp lệ' };
      }

      // Estimate storage size (rough estimate)
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
     * Check storage quota
     */
    _checkStorageQuota: function(callback) {
      if (!chrome.storage.local.getBytesInUse) {
        callback(true); // Assume OK if API not available
        return;
      }

      chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
        const quota = chrome.storage.local.QUOTA_BYTES || 10 * 1024 * 1024; // Default 10MB
        const usagePercent = (bytesInUse / quota) * 100;
        
        if (usagePercent > 90) {
          console.warn(`[ExportHandler] Storage usage: ${usagePercent.toFixed(1)}%`);
          callback(false);
        } else {
          callback(true);
        }
      });
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
