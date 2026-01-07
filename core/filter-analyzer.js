(() => {
  'use strict';

  // ============================================
  // 🔍 FILTER ANALYZER
  // ============================================
  // Analyzes CSV data to extract filter variants for each category
  window.DataScraperFilterAnalyzer = {
    /**
     * Parse CSV line and extract product data
     * @param {string} line - CSV line
     * @param {Array<string>} headers - CSV headers
     * @returns {Object|null} Product data object
     */
    parseCSVLine: (line, headers) => {
      if (!line || !headers || headers.length === 0) return null;

      // Simple CSV parser (handles quoted fields)
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++; // Skip next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current); // Add last value

      if (values.length !== headers.length) {
        return null; // Skip malformed lines
      }

      const product = {};
      headers.forEach((header, index) => {
        product[header] = values[index] || '';
      });

      return product;
    },

    /**
     * Parse JSON string safely
     * @param {string} str - JSON string
     * @returns {any} Parsed value or null
     */
    parseJSON: (str) => {
      if (!str || str.trim() === '') return null;
      try {
        return JSON.parse(str);
      } catch (e) {
        return null;
      }
    },

    /**
     * Extract category slug from category path
     * @param {string} categoryPath - Category path string
     * @param {string|Array} categoryData - Category data (JSON string or array)
     * @returns {string} Category slug
     */
    extractCategorySlug: (categoryPath, categoryData) => {
      if (categoryPath && categoryPath.trim()) {
        return categoryPath.trim();
      }

      if (!categoryData) return '';

      let category = null;
      if (typeof categoryData === 'string') {
        category = this.parseJSON(categoryData);
      } else if (Array.isArray(categoryData)) {
        category = categoryData;
      }

      if (Array.isArray(category) && category.length > 0) {
        // Get the last category in the path
        const lastCategory = category[category.length - 1];
        if (lastCategory && lastCategory.slug) {
          return lastCategory.slug;
        }
      }

      return '';
    },

    /**
     * Extract subcategory slug (second level)
     * @param {string|Array} categoryData - Category data
     * @returns {string} Subcategory slug
     */
    extractSubCategorySlug: (categoryData) => {
      if (!categoryData) return '';

      let category = null;
      if (typeof categoryData === 'string') {
        category = this.parseJSON(categoryData);
      } else if (Array.isArray(categoryData)) {
        category = categoryData;
      }

      if (Array.isArray(category) && category.length >= 2) {
        const subCategory = category[1];
        if (subCategory && subCategory.slug) {
          return subCategory.slug;
        }
      }

      return '';
    },

    /**
     * Normalize price value
     * @param {string|number} priceValue - Price value
     * @returns {number} Normalized price value
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
     * Categorize price into range
     * @param {number} priceValue - Price value
     * @returns {string} Price range category
     */
    categorizePrice: (priceValue) => {
      if (!priceValue || priceValue === 0) return null;

      if (priceValue < 100000) {
        return 'under_100k';
      } else if (priceValue >= 100000 && priceValue < 300000) {
        return '100k_to_300k';
      } else if (priceValue >= 300000 && priceValue < 500000) {
        return '300k_to_500k';
      } else {
        return 'over_500k';
      }
    },

    /**
     * Analyze products and extract filter variants
     * @param {Array<Object>} products - Array of product objects
     * @returns {Object} Filter variants grouped by category
     */
    analyzeProducts: (products) => {
      const variants = {
        byCategory: {}, // Grouped by category slug
        bySubCategory: {}, // Grouped by subcategory slug
        global: {
          brands: new Set(),
          origins: new Set(),
          manufacturers: new Set(),
          priceRanges: new Set(),
          allCategories: new Set()
        }
      };

      products.forEach(product => {
        // Extract category info
        const categorySlug = this.extractCategorySlug(
          product['category.categorySlug'],
          product['category.category']
        );
        const subCategorySlug = this.extractSubCategorySlug(product['category.category']);

        if (!categorySlug) return;

        // Initialize category if not exists
        if (!variants.byCategory[categorySlug]) {
          variants.byCategory[categorySlug] = {
            brands: new Set(),
            origins: new Set(),
            manufacturers: new Set(),
            priceRanges: new Set(),
            priceStats: {
              min: Infinity,
              max: 0,
              values: []
            },
            productCount: 0
          };
        }

        // Initialize subcategory if not exists
        if (subCategorySlug) {
          if (!variants.bySubCategory[subCategorySlug]) {
            variants.bySubCategory[subCategorySlug] = {
              brands: new Set(),
              origins: new Set(),
              manufacturers: new Set(),
              priceRanges: new Set(),
              priceStats: {
                min: Infinity,
                max: 0,
                values: []
              },
              productCount: 0
            };
          }
        }

        const catVariant = variants.byCategory[categorySlug];
        const subCatVariant = subCategorySlug ? variants.bySubCategory[subCategorySlug] : null;

        // Extract brand
        const brand = (product['basicInfo.brand'] || '').trim();
        if (brand) {
          catVariant.brands.add(brand);
          variants.global.brands.add(brand);
          if (subCatVariant) subCatVariant.brands.add(brand);
        }

        // Extract origin (Xuất xứ thương hiệu)
        const origin = (product['specifications.origin'] || '').trim();
        if (origin) {
          catVariant.origins.add(origin);
          variants.global.origins.add(origin);
          if (subCatVariant) subCatVariant.origins.add(origin);
        }

        // Extract manufacturer (Nhà sản xuất)
        const manufacturer = (product['specifications.manufacturer'] || '').trim();
        if (manufacturer) {
          catVariant.manufacturers.add(manufacturer);
          variants.global.manufacturers.add(manufacturer);
          if (subCatVariant) subCatVariant.manufacturers.add(manufacturer);
        }

        // Extract price
        const priceValue = this.normalizePriceValue(product['pricing.currentPriceValue']);
        if (priceValue > 0) {
          const priceRange = this.categorizePrice(priceValue);
          if (priceRange) {
            catVariant.priceRanges.add(priceRange);
            variants.global.priceRanges.add(priceRange);
            if (subCatVariant) subCatVariant.priceRanges.add(priceRange);
          }

          // Update price stats
          catVariant.priceStats.min = Math.min(catVariant.priceStats.min, priceValue);
          catVariant.priceStats.max = Math.max(catVariant.priceStats.max, priceValue);
          catVariant.priceStats.values.push(priceValue);

          if (subCatVariant) {
            subCatVariant.priceStats.min = Math.min(subCatVariant.priceStats.min, priceValue);
            subCatVariant.priceStats.max = Math.max(subCatVariant.priceStats.max, priceValue);
            subCatVariant.priceStats.values.push(priceValue);
          }
        }

        catVariant.productCount++;
        if (subCatVariant) subCatVariant.productCount++;
        variants.global.allCategories.add(categorySlug);
      });

      // Convert Sets to Arrays and calculate price stats
      Object.keys(variants.byCategory).forEach(catSlug => {
        const variant = variants.byCategory[catSlug];
        variant.brands = Array.from(variant.brands).sort();
        variant.origins = Array.from(variant.origins).sort();
        variant.manufacturers = Array.from(variant.manufacturers).sort();
        variant.priceRanges = Array.from(variant.priceRanges).sort();

        // Calculate average price
        if (variant.priceStats.values.length > 0) {
          variant.priceStats.average = variant.priceStats.values.reduce((a, b) => a + b, 0) / variant.priceStats.values.length;
          variant.priceStats.median = variant.priceStats.values.sort((a, b) => a - b)[Math.floor(variant.priceStats.values.length / 2)];
        } else {
          variant.priceStats.average = 0;
          variant.priceStats.median = 0;
        }
        delete variant.priceStats.values;
      });

      Object.keys(variants.bySubCategory).forEach(subCatSlug => {
        const variant = variants.bySubCategory[subCatSlug];
        variant.brands = Array.from(variant.brands).sort();
        variant.origins = Array.from(variant.origins).sort();
        variant.manufacturers = Array.from(variant.manufacturers).sort();
        variant.priceRanges = Array.from(variant.priceRanges).sort();

        if (variant.priceStats.values.length > 0) {
          variant.priceStats.average = variant.priceStats.values.reduce((a, b) => a + b, 0) / variant.priceStats.values.length;
          variant.priceStats.median = variant.priceStats.values.sort((a, b) => a - b)[Math.floor(variant.priceStats.values.length / 2)];
        } else {
          variant.priceStats.average = 0;
          variant.priceStats.median = 0;
        }
        delete variant.priceStats.values;
      });

      // Convert global Sets to Arrays
      variants.global.brands = Array.from(variants.global.brands).sort();
      variants.global.origins = Array.from(variants.global.origins).sort();
      variants.global.manufacturers = Array.from(variants.global.manufacturers).sort();
      variants.global.priceRanges = Array.from(variants.global.priceRanges).sort();
      variants.global.allCategories = Array.from(variants.global.allCategories).sort();

      return variants;
    },

    /**
     * Read and parse CSV file
     * @param {string} filePath - Path to CSV file
     * @returns {Promise<Array<Object>>} Array of product objects
     */
    readCSVFile: async (filePath) => {
      try {
        const fs = require('fs').promises;
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        if (lines.length < 2) return []; // Need at least header + 1 data line

        const headers = this.parseCSVLine(lines[0], []);
        if (!headers || headers.length === 0) return [];

        const products = [];
        for (let i = 1; i < lines.length; i++) {
          const product = this.parseCSVLine(lines[i], headers);
          if (product) products.push(product);
        }

        return products;
      } catch (error) {
        console.error(`Error reading CSV file ${filePath}:`, error);
        return [];
      }
    }
  };
})();
