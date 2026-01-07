(() => {
  'use strict';

  // ============================================
  // 🛣️ FILTER ROUTER
  // ============================================
  // Handles routing and returns appropriate dynamic filter configurations
  window.DataScraperFilterRouter = {
    /**
     * Cache for filter configs
     */
    _filterCache: new Map(),

    /**
     * Load filter configuration from JSON file
     * @param {string} configPath - Path to dynamic-filters.json file
     * @returns {Promise<Object>} Filter configuration object
     */
    loadFilterConfig: async (configPath) => {
      // Check cache first
      if (this._filterCache.has(configPath)) {
        return this._filterCache.get(configPath);
      }

      try {
        // In browser environment, use fetch
        if (typeof fetch !== 'undefined') {
          const response = await fetch(configPath);
          if (!response.ok) {
            throw new Error(`Failed to load filter config: ${response.status}`);
          }
          const config = await response.json();
          this._filterCache.set(configPath, config);
          return config;
        } else {
          // In Node.js environment, use fs
          const fs = require('fs').promises;
          const content = await fs.readFile(configPath, 'utf-8');
          const config = JSON.parse(content);
          this._filterCache.set(configPath, config);
          return config;
        }
      } catch (error) {
        console.error('Error loading filter config:', error);
        return null;
      }
    },

    /**
     * Extract category slug from URL path
     * @param {string} urlPath - URL path (e.g., "/duoc-my-pham/cham-soc-co-the")
     * @returns {string} Category slug
     */
    extractCategoryFromPath: (urlPath) => {
      if (!urlPath) return '';

      // Remove leading/trailing slashes
      const cleanPath = urlPath.replace(/^\/+|\/+$/g, '');

      // Split by slash and filter empty parts
      const segments = cleanPath.split('/').filter(s => s.trim());

      // Return the category path (all segments joined)
      return segments.join('/');
    },

    /**
     * Extract category slug from current URL
     * @returns {string} Category slug
     */
    getCategoryFromCurrentURL: () => {
      if (typeof window === 'undefined') return '';

      const pathname = window.location.pathname;
      return this.extractCategoryFromPath(pathname);
    },

    /**
     * Get filter configuration for a specific category
     * @param {Object} filterConfig - Full filter configuration object
     * @param {string} categorySlug - Category slug (e.g., "duoc-my-pham/cham-soc-co-the")
     * @param {Object} options - Options
     * @returns {Object|null} Filter configuration for the category
     */
    getFiltersForCategory: (filterConfig, categorySlug, options = {}) => {
      if (!filterConfig || !categorySlug) return null;

      const {
        includeGlobal = false,
        fallbackToParent = true
      } = options;

      // Try exact match first
      if (filterConfig.categoryFilters && filterConfig.categoryFilters[categorySlug]) {
        return filterConfig.categoryFilters[categorySlug];
      }

      // Try parent category if fallback enabled
      if (fallbackToParent) {
        const segments = categorySlug.split('/');
        if (segments.length > 1) {
          // Try parent category (remove last segment)
          const parentSlug = segments.slice(0, -1).join('/');
          if (filterConfig.categoryFilters && filterConfig.categoryFilters[parentSlug]) {
            return filterConfig.categoryFilters[parentSlug];
          }
        }

        // Try root category (first segment)
        if (segments.length > 0) {
          const rootSlug = segments[0];
          if (filterConfig.categoryFilters && filterConfig.categoryFilters[rootSlug]) {
            return filterConfig.categoryFilters[rootSlug];
          }
        }
      }

      // Return global filters if enabled
      if (includeGlobal && filterConfig.globalVariants) {
        return {
          categorySlug: categorySlug,
          filters: this._buildGlobalFilters(filterConfig.globalVariants),
          metadata: {
            productCount: 0,
            isGlobal: true
          }
        };
      }

      return null;
    },

    /**
     * Build global filters from global variants
     * @param {Object} globalVariants - Global variants object
     * @returns {Array<Object>} Filter configurations
     */
    _buildGlobalFilters: (globalVariants) => {
      const filters = [];

      // Brand filter
      if (globalVariants.brands && globalVariants.brands.length > 0) {
        filters.push({
          id: 'brand',
          type: 'checkbox',
          label: 'Thương hiệu',
          field: 'basicInfo.brand',
          searchable: true,
          options: globalVariants.brands.slice(0, 100).map(brand => ({
            value: brand,
            label: brand,
            count: null
          })),
          defaultSelected: [],
          showMore: globalVariants.brands.length > 5
        });
      }

      // Origin filter
      if (globalVariants.origins && globalVariants.origins.length > 0) {
        filters.push({
          id: 'brandOrigin',
          type: 'checkbox',
          label: 'Xuất xứ thương hiệu',
          field: 'specifications.origin',
          searchable: true,
          options: globalVariants.origins.slice(0, 100).map(origin => ({
            value: origin,
            label: origin,
            count: null
          })),
          defaultSelected: [],
          showMore: globalVariants.origins.length > 5
        });
      }

      return filters;
    },

    /**
     * Get filters for current route
     * @param {Object} filterConfig - Full filter configuration object
     * @param {string} urlPath - Optional URL path (defaults to current URL)
     * @param {Object} options - Options
     * @returns {Promise<Object>} Filter configuration for current route
     */
    getFiltersForRoute: async (filterConfig, urlPath = null, options = {}) => {
      const categorySlug = urlPath 
        ? this.extractCategoryFromPath(urlPath)
        : this.getCategoryFromCurrentURL();

      return this.getFiltersForCategory(filterConfig, categorySlug, options);
    },

    /**
     * Get all available category slugs
     * @param {Object} filterConfig - Full filter configuration object
     * @returns {Array<string>} Array of category slugs
     */
    getAllCategorySlugs: (filterConfig) => {
      if (!filterConfig || !filterConfig.categoryFilters) return [];

      return Object.keys(filterConfig.categoryFilters).sort();
    },

    /**
     * Check if a category exists in filter config
     * @param {Object} filterConfig - Full filter configuration object
     * @param {string} categorySlug - Category slug
     * @returns {boolean} True if category exists
     */
    hasCategory: (filterConfig, categorySlug) => {
      return filterConfig && 
             filterConfig.categoryFilters && 
             filterConfig.categoryFilters.hasOwnProperty(categorySlug);
    },

    /**
     * Get filter metadata
     * @param {Object} filterConfig - Full filter configuration object
     * @returns {Object} Metadata object
     */
    getMetadata: (filterConfig) => {
      if (!filterConfig || !filterConfig.metadata) {
        return {
          generatedAt: null,
          categoryDirectory: null,
          totalProducts: 0,
          totalCategories: 0
        };
      }

      return filterConfig.metadata;
    },

    /**
     * Clear filter cache
     */
    clearCache: () => {
      this._filterCache.clear();
    }
  };
})();
