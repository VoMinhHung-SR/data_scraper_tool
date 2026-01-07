(() => {
  'use strict';

  // ============================================
  // 🔎 FILTER QUERY UTILITIES
  // ============================================
  // Utilities to query and filter products based on dynamic filter configurations
  window.DataScraperFilterQueryUtils = {
    /**
     * Normalize price value for comparison
     * @param {string|number} priceValue - Price value
     * @returns {number} Normalized price
     */
    normalizePriceValue: (priceValue) => {
      if (typeof priceValue === 'number') return priceValue;
      if (typeof priceValue === 'string') {
        const num = parseFloat(priceValue.replace(/[^\d.]/g, ''));
        return isNaN(num) ? 0 : num;
      }
      return 0;
    },

    /**
     * Check if price matches price range
     * @param {number} priceValue - Product price value
     * @param {string} rangeKey - Price range key (e.g., 'under_100k')
     * @returns {boolean} True if price matches range
     */
    matchesPriceRange: (priceValue, rangeKey) => {
      const normalizedPrice = this.normalizePriceValue(priceValue);
      if (normalizedPrice === 0) return false;

      const ranges = {
        'under_100k': { min: 0, max: 100000 },
        '100k_to_300k': { min: 100000, max: 300000 },
        '300k_to_300k': { min: 300000, max: 500000 },
        'over_500k': { min: 500000, max: Infinity }
      };

      const range = ranges[rangeKey];
      if (!range) return false;

      return normalizedPrice >= range.min && normalizedPrice < range.max;
    },

    /**
     * Check if product matches filter criteria
     * @param {Object} product - Product object
     * @param {Object} filterCriteria - Filter criteria object
     * @returns {boolean} True if product matches
     */
    matchesFilter: (product, filterCriteria) => {
      if (!product || !filterCriteria) return true;

      // Brand filter
      if (filterCriteria.brands && Array.isArray(filterCriteria.brands) && filterCriteria.brands.length > 0) {
        const productBrand = (product['basicInfo.brand'] || product.brand || '').trim();
        if (!filterCriteria.brands.includes(productBrand)) {
          return false;
        }
      }

      // Brand Origin filter
      if (filterCriteria.brandOrigins && Array.isArray(filterCriteria.brandOrigins) && filterCriteria.brandOrigins.length > 0) {
        const productOrigin = (product['specifications.origin'] || product.origin || '').trim();
        if (!filterCriteria.brandOrigins.includes(productOrigin)) {
          return false;
        }
      }

      // Manufacturer filter
      if (filterCriteria.manufacturers && Array.isArray(filterCriteria.manufacturers) && filterCriteria.manufacturers.length > 0) {
        const productManufacturer = (product['specifications.manufacturer'] || product.manufacturer || '').trim();
        if (!filterCriteria.manufacturers.includes(productManufacturer)) {
          return false;
        }
      }

      // Price range filter
      if (filterCriteria.priceRanges && Array.isArray(filterCriteria.priceRanges) && filterCriteria.priceRanges.length > 0) {
        const productPrice = this.normalizePriceValue(
          product['pricing.currentPriceValue'] || product.priceValue || product.price || 0
        );
        
        const matchesAnyRange = filterCriteria.priceRanges.some(range => 
          this.matchesPriceRange(productPrice, range)
        );
        
        if (!matchesAnyRange) {
          return false;
        }
      }

      // Category filter
      if (filterCriteria.categories && Array.isArray(filterCriteria.categories) && filterCriteria.categories.length > 0) {
        const productCategory = (product['category.categorySlug'] || product.categorySlug || '').trim();
        if (!filterCriteria.categories.includes(productCategory)) {
          return false;
        }
      }

      // Price min/max filter
      if (filterCriteria.priceMin !== undefined && filterCriteria.priceMin !== null) {
        const productPrice = this.normalizePriceValue(
          product['pricing.currentPriceValue'] || product.priceValue || product.price || 0
        );
        if (productPrice < filterCriteria.priceMin) {
          return false;
        }
      }

      if (filterCriteria.priceMax !== undefined && filterCriteria.priceMax !== null) {
        const productPrice = this.normalizePriceValue(
          product['pricing.currentPriceValue'] || product.priceValue || product.price || 0
        );
        if (productPrice > filterCriteria.priceMax) {
          return false;
        }
      }

      return true;
    },

    /**
     * Filter products array based on filter criteria
     * @param {Array<Object>} products - Array of products
     * @param {Object} filterCriteria - Filter criteria
     * @returns {Array<Object>} Filtered products
     */
    filterProducts: (products, filterCriteria) => {
      if (!Array.isArray(products)) return [];
      if (!filterCriteria || Object.keys(filterCriteria).length === 0) return products;

      return products.filter(product => this.matchesFilter(product, filterCriteria));
    },

    /**
     * Build filter criteria from filter config selections
     * @param {Object} filterConfig - Filter configuration
     * @param {Object} selections - User selections { filterId: [selectedValues] }
     * @returns {Object} Filter criteria object
     */
    buildFilterCriteria: (filterConfig, selections) => {
      const criteria = {};

      if (!filterConfig || !filterConfig.filters) return criteria;

      filterConfig.filters.forEach(filter => {
        const selectedValues = selections[filter.id];
        if (!selectedValues || !Array.isArray(selectedValues) || selectedValues.length === 0) {
          return;
        }

        switch (filter.id) {
          case 'brand':
            criteria.brands = selectedValues;
            break;
          case 'brandOrigin':
            criteria.brandOrigins = selectedValues;
            break;
          case 'manufacturer':
            criteria.manufacturers = selectedValues;
            break;
          case 'priceRange':
            criteria.priceRanges = selectedValues;
            break;
        }
      });

      return criteria;
    },

    /**
     * Count products matching each filter option
     * @param {Array<Object>} products - Array of products
     * @param {Object} filterConfig - Filter configuration
     * @returns {Object} Updated filter config with counts
     */
    calculateFilterCounts: (products, filterConfig) => {
      if (!filterConfig || !filterConfig.filters) return filterConfig;

      const updatedConfig = JSON.parse(JSON.stringify(filterConfig));

      updatedConfig.filters.forEach(filter => {
        filter.options.forEach(option => {
          const criteria = {};
          
          switch (filter.id) {
            case 'brand':
              criteria.brands = [option.value];
              break;
            case 'brandOrigin':
              criteria.brandOrigins = [option.value];
              break;
            case 'manufacturer':
              criteria.manufacturers = [option.value];
              break;
            case 'priceRange':
              criteria.priceRanges = [option.value];
              break;
          }

          const matchingProducts = this.filterProducts(products, criteria);
          option.count = matchingProducts.length;
        });
      });

      return updatedConfig;
    },

    /**
     * Get active filter summary
     * @param {Object} filterCriteria - Filter criteria
     * @returns {Object} Summary object
     */
    getFilterSummary: (filterCriteria) => {
      const summary = {
        activeFilters: [],
        totalActive: 0
      };

      if (filterCriteria.brands && filterCriteria.brands.length > 0) {
        summary.activeFilters.push({
          type: 'brand',
          label: 'Thương hiệu',
          count: filterCriteria.brands.length
        });
        summary.totalActive += filterCriteria.brands.length;
      }

      if (filterCriteria.brandOrigins && filterCriteria.brandOrigins.length > 0) {
        summary.activeFilters.push({
          type: 'brandOrigin',
          label: 'Xuất xứ thương hiệu',
          count: filterCriteria.brandOrigins.length
        });
        summary.totalActive += filterCriteria.brandOrigins.length;
      }

      if (filterCriteria.manufacturers && filterCriteria.manufacturers.length > 0) {
        summary.activeFilters.push({
          type: 'manufacturer',
          label: 'Nước sản xuất',
          count: filterCriteria.manufacturers.length
        });
        summary.totalActive += filterCriteria.manufacturers.length;
      }

      if (filterCriteria.priceRanges && filterCriteria.priceRanges.length > 0) {
        summary.activeFilters.push({
          type: 'priceRange',
          label: 'Giá bán',
          count: filterCriteria.priceRanges.length
        });
        summary.totalActive += filterCriteria.priceRanges.length;
      }

      return summary;
    }
  };
})();
