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
            // Close results modal after successful export
            setTimeout(() => {
              const resultsModal = document.getElementById('resultsModal');
              if (resultsModal) {
                resultsModal.style.display = 'none';
                resultsModal.classList.remove('active');
              }
            }, 1000);
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
          
          // Close results modal after successful export
          const resultsModal = document.getElementById('resultsModal');
          if (resultsModal) {
            resultsModal.style.display = 'none';
            resultsModal.classList.remove('active');
          }
          window.PopupDisplay.showMessage(`Đã export thành công: ${filename}`, 'success');
          URL.revokeObjectURL(url);
        }, 100);
        
        window.PopupDisplay.showMessage(`Đã export thành công: ${filename}`, 'success');
      } catch (error) {
        console.error('Direct download error:', error);
        window.PopupDisplay.showMessage('Lỗi khi export: ' + error.message, 'error');
      }
    },

    /**
     * Normalize product data to API format structure (from api-scraper.js formatProduct)
     * Base structure: sku, name, webName, slug, link, image, brand, specification, 
     * shortDescription, category, prices, price, priceDisplay, priceValue, 
     * productRanking, displayCode, isPublish, categoryPath, categorySlug
     */
    normalizeToAPIFormat: function(item) {
      if (!item || typeof item !== 'object') return item;

      // Check if already in API format (has webName and category as array)
      const isAPIFormat = item.sku && item.webName && Array.isArray(item.category);
      if (isAPIFormat) {
        return item;
      }

      // Extract price info
      let priceObj = item.price;
      let priceDisplay = '';
      let priceValue = 0;
      
      if (priceObj && typeof priceObj === 'object') {
        priceValue = priceObj.price || priceObj.value || 0;
        const unit = priceObj.measureUnitName || priceObj.unit || '';
        const currency = priceObj.currencySymbol || 'đ';
        priceDisplay = `${priceValue.toLocaleString('vi-VN')}${currency}${unit ? ' / ' + unit : ''}`;
      } else if (item.prices && Array.isArray(item.prices) && item.prices.length > 0) {
        priceObj = item.prices[0];
        priceValue = priceObj.price || 0;
        const unit = priceObj.measureUnitName || '';
        const currency = priceObj.currencySymbol || 'đ';
        priceDisplay = `${priceValue.toLocaleString('vi-VN')}${currency}${unit ? ' / ' + unit : ''}`;
      } else if (typeof item.price === 'string') {
        // Parse price string like "131.250đ" or "131.250đ / Hộp"
        const priceMatch = item.price.match(/([\d.,]+)/);
        if (priceMatch) {
          priceValue = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
        }
        priceDisplay = item.price;
      }

      // Extract category info
      let category = item.category || [];
      let categoryPath = item.categoryPath || '';
      let categorySlug = item.categorySlug || '';
      
      if (!Array.isArray(category) && categoryPath) {
        // Convert categoryPath to category array
        category = categoryPath.split(' > ').map(name => ({ name: name.trim() }));
      }
      if (Array.isArray(category) && category.length > 0 && !categoryPath) {
        categoryPath = category.map(c => c.name || c).join(' > ');
        categorySlug = category.map(c => c.slug || c).join('/');
      }

      // Extract slug from link/url if not present
      let slug = item.slug || '';
      if (!slug && (item.link || item.url)) {
        const url = item.link || item.url;
        const match = url.match(/\/([^\/]+)\.html$/);
        if (match) {
          slug = match[1];
        }
      }

      // Build normalized object following api-scraper.js formatProduct structure
      const normalized = {
        sku: item.sku || '',
        name: item.name || '',
        webName: item.webName || item.name || '',
        slug: slug,
        link: item.link || item.url || (slug ? `https://nhathuoclongchau.com.vn/${slug}` : ''),
        image: item.image || '',
        brand: item.brand || '',
        specification: item.specification || (item.specifications ? JSON.stringify(item.specifications) : ''),
        shortDescription: item.shortDescription || item.description || '',
        category: category,
        prices: item.prices || [],
        price: priceObj,
        priceDisplay: priceDisplay,
        priceValue: priceValue,
        productRanking: item.productRanking || 0,
        displayCode: item.displayCode || 1,
        isPublish: item.isPublish !== undefined ? item.isPublish : true,
        categoryPath: categoryPath,
        categorySlug: categorySlug
      };

      return normalized;
    },

    /**
     * Convert data to CSV
     */
    convertToCSV: function(data) {
      if (!Array.isArray(data) || data.length === 0) {
        return '';
      }

      // Normalize all items to API format first
      const normalizedData = data.map(item => this.normalizeToAPIFormat(item));

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
      const flattenedData = normalizedData.map(item => {
        if (typeof item === 'object' && item !== null) {
          return flattenObject(item);
        }
        return { value: item };
      });

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

