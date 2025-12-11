(() => {
  'use strict';

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
            this.downloadDirectly(content, filename, mimeType, format);
          } else if (response && response.success) {
            window.PopupDisplay.showMessage(`Đã export thành công: ${filename}`, 'success');
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
            return;
          } else {
            window.PopupDisplay.showMessage('Lỗi khi export: ' + (response?.error || 'Unknown error'), 'error');
          }
        });
      } catch (error) {
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
        window.PopupDisplay.showMessage('Lỗi khi export: ' + error.message, 'error');
      }
    },

    /**
     * Normalize product data to unified detail format structure
     */
    normalizeToAPIFormat: function(item) {
      if (!item || typeof item !== 'object') return item;

      const isGroupedFormat = item.basicInfo || item.pricing || item.rating || item.category || item.media || item.content || item.specifications || item.metadata;
      if (isGroupedFormat) {
        return item;
      }
      const isUnifiedFormat = item.sku && 
                              (item.description !== undefined || item.ingredients !== undefined) &&
                              (typeof item.specifications === 'object' || item.specifications === null);
      if (isUnifiedFormat) {
        const ProductFormatter = window.DataScraperProductFormatter;
        if (ProductFormatter) {
          return ProductFormatter.formatProductDetail(item);
        }
        return item;
      }
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

      // Gom nhóm specifications thành object (giống format thống nhất)
      let specifications = {};
      
      // Nếu đã có specifications object, dùng nó
      if (item.specifications && typeof item.specifications === 'object') {
        specifications = item.specifications;
      } else if (item.specification) {
        // Nếu specification là string, thử parse hoặc giữ nguyên
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
      
      // Extract các field riêng lẻ vào specifications nếu chưa có
      if (!specifications['Số đăng ký'] && item.registrationNumber) {
        specifications['Số đăng ký'] = item.registrationNumber;
      }
      if (!specifications['Xuất xứ thương hiệu'] && item.origin) {
        specifications['Xuất xứ thương hiệu'] = item.origin;
      }
      if (!specifications['Nhà sản xuất'] && item.manufacturer) {
        specifications['Nhà sản xuất'] = item.manufacturer;
      }
      if (!specifications['Hạn sử dụng'] && item.shelfLife) {
        specifications['Hạn sử dụng'] = item.shelfLife;
      }
      if (!specifications['Quy cách'] && item.packageSize) {
        specifications['Quy cách'] = item.packageSize;
      }
      if (!specifications['Thành phần'] && item.ingredients) {
        specifications['Thành phần'] = item.ingredients;
      }

      // Extract package size
      const packageSize = item.packageSize || specifications['Quy cách'] || '';

      // Extract rating và reviews
      const rating = item.rating || '';
      const reviewCount = item.reviewCount || '';
      const commentCount = item.commentCount || '';
      const reviews = reviewCount && commentCount 
        ? `${reviewCount} đánh giá, ${commentCount} bình luận` 
        : '';

      // Build normalized object following unified detail format (giống DOM scraping)
      const normalized = {
        // Thông tin cơ bản
        name: item.name || '',
        sku: item.sku || '',
        brand: item.brand || '',
        price: priceDisplay || item.price || '',
        packageSize: packageSize,
        
        // Rating và reviews
        rating: String(rating),
        reviewCount: String(reviewCount),
        commentCount: String(commentCount),
        reviews: reviews,
        
        // Category
        category: category,
        categoryPath: categoryPath,
        categorySlug: categorySlug,
        
        // Images
        image: item.image || '',
        images: Array.isArray(item.images) ? item.images : (item.image ? [item.image] : []),
        
        // Các section từ detail-content-* (giống DOM scraping)
        description: item.description || item.fullDescription || item.shortDescription || '',
        ingredients: item.ingredients || specifications['Thành phần'] || '',
        usage: item.usage || item.indications || '',
        dosage: item.dosage || '',
        adverseEffect: item.adverseEffect || item.contraindications || '',
        careful: item.careful || '',
        preservation: item.preservation || item.storage || '',
        
        // Thông tin bổ sung
        registrationNumber: specifications['Số đăng ký'] || item.registrationNumber || '',
        origin: specifications['Xuất xứ thương hiệu'] || item.origin || '',
        manufacturer: specifications['Nhà sản xuất'] || item.manufacturer || '',
        shelfLife: specifications['Hạn sử dụng'] || item.shelfLife || '',
        
        // Specifications object (gom nhóm)
        specifications: specifications,
        
        // Metadata
        url: item.url || item.link || (slug ? `https://nhathuoclongchau.com.vn/${slug}` : ''),
        link: item.link || item.url || (slug ? `https://nhathuoclongchau.com.vn/${slug}` : ''),
        scrapedAt: item.scrapedAt || new Date().toISOString(),
        source: item.source || 'UNKNOWN',
        
        // Additional fields (giữ lại để tương thích)
        webName: item.webName || item.name || '',
        slug: slug,
        prices: item.prices || [],
        priceObj: priceObj,
        priceValue: priceValue,
        productRanking: item.productRanking || 0,
        displayCode: item.displayCode || 1,
        isPublish: item.isPublish !== undefined ? item.isPublish : true
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

