(() => {
  'use strict';

  // ============================================
  // 💾 EXPORT HANDLER
  // ============================================
  window.DataScraperExportHandler = {
    /**
     * Export data
     * @param {string} format - 'json' or 'csv'
     * @param {*} data - Data to export
     */
    exportData: function(format, data) {
      if (!data) {
        window.PopupDisplay.showMessage('Không có dữ liệu để export', 'error');
        return;
      }

      try {
        window.PopupDisplay.showMessage('Đang chuẩn bị export...', 'loading');
        
        const { content, filename, mimeType } = this.generateExportContent(format, data);
        if (!content) {
          window.PopupDisplay.showMessage('Không thể tạo nội dung export', 'error');
          return;
        }

        // Kiểm tra kích thước file
        const sizeInMB = new Blob([content]).size / (1024 * 1024);
        if (sizeInMB > 50) {
          window.PopupDisplay.showMessage('File quá lớn (>50MB). Vui lòng giảm số lượng dữ liệu.', 'error');
          return;
        }

        // Sử dụng background script để download
        chrome.runtime.sendMessage({
          action: 'downloadFile',
          content: content,
          filename: filename,
          mimeType: mimeType
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Download error:', chrome.runtime.lastError);
            this.downloadDirectly(content, filename, mimeType, format);
          } else if (response && response.success) {
            window.PopupDisplay.showMessage(`Đã export thành công: ${filename}`, 'success');
          } else if (response && response.error === 'FILE_TOO_LARGE') {
            this.downloadDirectly(content, filename, mimeType, format);
          } else if (response && response.error && response.error.includes('USER_CANCELED')) {
            // User canceled - silently ignore
            return;
          } else {
            window.PopupDisplay.showMessage('Lỗi khi export: ' + (response?.error || 'Unknown error'), 'error');
          }
        });
      } catch (error) {
        console.error('Export error:', error);
        window.PopupDisplay.showMessage('Lỗi khi export: ' + error.message, 'error');
      }
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
      } else if (format === 'csv') {
        return {
          content: this.convertToCSV(data),
          filename: `scraped-data-${Date.now()}.csv`,
          mimeType: 'text/csv'
        };
      }
      return null;
    },

    /**
     * Download directly (fallback)
     */
    downloadDirectly: function(content, filename, mimeType, format) {
      try {
        const blob = new Blob(
          format === 'csv' ? ['\ufeff' + content] : [content],
          { type: mimeType + ';charset=utf-8;' }
        );
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          if (document.body.contains(a)) {
            document.body.removeChild(a);
          }
          URL.revokeObjectURL(url);
        }, 100);
        
        window.PopupDisplay.showMessage(`Đã export thành công: ${filename}`, 'success');
      } catch (error) {
        console.error('Direct download error:', error);
        window.PopupDisplay.showMessage('Lỗi khi export: ' + error.message, 'error');
      }
    },

    /**
     * Convert data to CSV
     */
    convertToCSV: function(data) {
      if (!Array.isArray(data) || data.length === 0) {
        return '';
      }

      // Flatten nested objects
      const flattenObject = (obj, prefix = '') => {
        const flattened = {};
        for (const key in obj) {
          if (!obj.hasOwnProperty(key)) continue;
          
          const newKey = prefix ? `${prefix}.${key}` : key;
          const value = obj[key];
          
          if (value === null || value === undefined) {
            flattened[newKey] = '';
          } else if (Array.isArray(value)) {
            flattened[newKey] = JSON.stringify(value);
          } else if (typeof value === 'object') {
            Object.assign(flattened, flattenObject(value, newKey));
          } else {
            flattened[newKey] = value;
          }
        }
        return flattened;
      };

      // Flatten all items
      const flattenedData = data.map(item => {
        if (typeof item === 'object' && item !== null) {
          return flattenObject(item);
        }
        return { value: item };
      });

      // Get all unique keys
      const keys = new Set();
      flattenedData.forEach(item => {
        if (typeof item === 'object' && item !== null) {
          Object.keys(item).forEach(key => keys.add(key));
        }
      });

      const headers = Array.from(keys);
      if (headers.length === 0) return '';

      const rows = [headers.map(h => `"${this.escapeCSV(h)}"`).join(',')];

      flattenedData.forEach(item => {
        const row = headers.map(header => {
          const val = (typeof item === 'object' && item !== null) ? item[header] : item;
          const value = (val !== null && val !== undefined) ? String(val) : '';
          return `"${this.escapeCSV(value)}"`;
        });
        rows.push(row.join(','));
      });

      return rows.join('\n');
    },

    /**
     * Escape CSV value
     */
    escapeCSV: function(value) {
      return String(value)
        .replace(/"/g, '""')
        .replace(/\n/g, ' ')
        .replace(/\r/g, '');
    }
  };
})();

