(() => {
  'use strict';

  // ============================================
  // 🎯 DYNAMIC FILTER GENERATOR
  // ============================================
  // Generates dynamic filter configurations based on category variants
  window.DataScraperDynamicFilterGenerator = {
    /**
     * Price range labels (Vietnamese)
     */
    priceRangeLabels: {
      'under_100k': 'Dưới 100.000₫',
      '100k_to_300k': '100.000₫ đến 300.000₫',
      '300k_to_500k': '300.000₫ đến 500.000₫',
      'over_500k': 'Trên 500.000₫'
    },

    /**
     * Filter type configurations
     */
    filterTypeConfig: {
      brand: {
        label: 'Thương hiệu',
        field: 'basicInfo.brand',
        type: 'checkbox',
        searchable: true
      },
      brandOrigin: {
        label: 'Xuất xứ thương hiệu',
        field: 'specifications.origin',
        type: 'checkbox',
        searchable: true
      },
      manufacturer: {
        label: 'Nước sản xuất',
        field: 'specifications.manufacturer',
        type: 'checkbox',
        searchable: false
      },
      priceRange: {
        label: 'Giá bán',
        field: 'pricing.currentPriceValue',
        type: 'button',
        searchable: false
      }
    },

    /**
     * Generate filter configuration for a category
     * @param {string} categorySlug - Category slug
     * @param {Object} variants - Filter variants from analyzer
     * @param {Object} options - Options
     * @returns {Object} Filter configuration
     */
    generateFilterConfig: (categorySlug, variants, options = {}) => {
      const {
        includeSubCategories = true,
        minItemsPerFilter = 1,
        maxItemsPerFilter = 50
      } = options;

      const config = {
        categorySlug,
        filters: [],
        metadata: {
          productCount: 0,
          lastUpdated: new Date().toISOString()
        }
      };

      const categoryVariant = variants.byCategory[categorySlug];
      if (!categoryVariant) {
        return config;
      }

      config.metadata.productCount = categoryVariant.productCount;

      // Brand filter
      if (categoryVariant.brands && categoryVariant.brands.length >= minItemsPerFilter) {
        const brandOptions = categoryVariant.brands
          .slice(0, maxItemsPerFilter)
          .map(brand => ({
            value: brand,
            label: brand,
            count: null // Can be calculated later
          }));

        config.filters.push({
          id: 'brand',
          type: 'checkbox',
          label: this.filterTypeConfig.brand.label,
          field: this.filterTypeConfig.brand.field,
          searchable: this.filterTypeConfig.brand.searchable,
          options: brandOptions,
          defaultSelected: [],
          showMore: brandOptions.length > 5
        });
      }

      // Brand Origin filter
      if (categoryVariant.origins && categoryVariant.origins.length >= minItemsPerFilter) {
        const originOptions = categoryVariant.origins
          .slice(0, maxItemsPerFilter)
          .map(origin => ({
            value: origin,
            label: origin,
            count: null
          }));

        config.filters.push({
          id: 'brandOrigin',
          type: 'checkbox',
          label: this.filterTypeConfig.brandOrigin.label,
          field: this.filterTypeConfig.brandOrigin.field,
          searchable: this.filterTypeConfig.brandOrigin.searchable,
          options: originOptions,
          defaultSelected: [],
          showMore: originOptions.length > 5
        });
      }

      // Manufacturer filter
      if (categoryVariant.manufacturers && categoryVariant.manufacturers.length >= minItemsPerFilter) {
        const manufacturerOptions = categoryVariant.manufacturers
          .slice(0, maxItemsPerFilter)
          .map(manufacturer => ({
            value: manufacturer,
            label: manufacturer,
            count: null
          }));

        config.filters.push({
          id: 'manufacturer',
          type: 'checkbox',
          label: this.filterTypeConfig.manufacturer.label,
          field: this.filterTypeConfig.manufacturer.field,
          searchable: this.filterTypeConfig.manufacturer.searchable,
          options: manufacturerOptions,
          defaultSelected: [],
          showMore: manufacturerOptions.length > 5
        });
      }

      // Price range filter
      if (categoryVariant.priceRanges && categoryVariant.priceRanges.length > 0) {
        const priceOptions = categoryVariant.priceRanges
          .map(range => ({
            value: range,
            label: this.priceRangeLabels[range] || range,
            min: this._getPriceRangeMin(range),
            max: this._getPriceRangeMax(range)
          }));

        config.filters.push({
          id: 'priceRange',
          type: 'button',
          label: this.filterTypeConfig.priceRange.label,
          field: this.filterTypeConfig.priceRange.field,
          searchable: false,
          options: priceOptions,
          defaultSelected: [],
          priceStats: {
            min: categoryVariant.priceStats.min,
            max: categoryVariant.priceStats.max,
            average: categoryVariant.priceStats.average,
            median: categoryVariant.priceStats.median
          }
        });
      }

      // Add subcategory filters if enabled
      if (includeSubCategories) {
        const subCategoryFilters = this._generateSubCategoryFilters(
          categorySlug,
          variants,
          minItemsPerFilter,
          maxItemsPerFilter
        );
        if (subCategoryFilters.length > 0) {
          config.subCategoryFilters = subCategoryFilters;
        }
      }

      return config;
    },

    /**
     * Generate filters for subcategories
     * @param {string} parentCategorySlug - Parent category slug
     * @param {Object} variants - Filter variants
     * @param {number} minItemsPerFilter - Minimum items per filter
     * @param {number} maxItemsPerFilter - Maximum items per filter
     * @returns {Array<Object>} Subcategory filter configs
     */
    _generateSubCategoryFilters: (parentCategorySlug, variants, minItemsPerFilter, maxItemsPerFilter) => {
      const subCategoryFilters = [];

      Object.keys(variants.bySubCategory).forEach(subCatSlug => {
        // Check if this subcategory belongs to the parent category
        // (This is a simplified check - you might need to enhance this)
        const subCatVariant = variants.bySubCategory[subCatSlug];
        if (!subCatVariant || subCatVariant.productCount < minItemsPerFilter) {
          return;
        }

        const subConfig = {
          subCategorySlug: subCatSlug,
          filters: []
        };

        // Brand filter for subcategory
        if (subCatVariant.brands && subCatVariant.brands.length >= minItemsPerFilter) {
          subConfig.filters.push({
            id: 'brand',
            type: 'checkbox',
            label: this.filterTypeConfig.brand.label,
            field: this.filterTypeConfig.brand.field,
            options: subCatVariant.brands
              .slice(0, maxItemsPerFilter)
              .map(brand => ({ value: brand, label: brand }))
          });
        }

        // Origin filter for subcategory
        if (subCatVariant.origins && subCatVariant.origins.length >= minItemsPerFilter) {
          subConfig.filters.push({
            id: 'brandOrigin',
            type: 'checkbox',
            label: this.filterTypeConfig.brandOrigin.label,
            field: this.filterTypeConfig.brandOrigin.field,
            options: subCatVariant.origins
              .slice(0, maxItemsPerFilter)
              .map(origin => ({ value: origin, label: origin }))
          });
        }

        if (subConfig.filters.length > 0) {
          subCategoryFilters.push(subConfig);
        }
      });

      return subCategoryFilters;
    },

    /**
     * Get minimum price for a price range
     * @param {string} range - Price range key
     * @returns {number} Minimum price
     */
    _getPriceRangeMin: (range) => {
      const ranges = {
        'under_100k': 0,
        '100k_to_300k': 100000,
        '300k_to_500k': 300000,
        'over_500k': 500000
      };
      return ranges[range] || 0;
    },

    /**
     * Get maximum price for a price range
     * @param {string} range - Price range key
     * @returns {number} Maximum price (Infinity for over_500k)
     */
    _getPriceRangeMax: (range) => {
      const ranges = {
        'under_100k': 100000,
        '100k_to_300k': 300000,
        '300k_to_500k': 500000,
        'over_500k': Infinity
      };
      return ranges[range] || Infinity;
    },

    /**
     * Generate filter config for all categories
     * @param {Object} variants - Filter variants from analyzer
     * @param {Object} options - Options
     * @returns {Object} All category filter configs
     */
    generateAllCategoryFilters: (variants, options = {}) => {
      const allConfigs = {};

      Object.keys(variants.byCategory).forEach(categorySlug => {
        allConfigs[categorySlug] = this.generateFilterConfig(categorySlug, variants, options);
      });

      return allConfigs;
    }
  };
})();
