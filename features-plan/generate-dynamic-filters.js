#!/usr/bin/env node

/**
 * Generate Dynamic Filters Script
 * 
 * Analyzes CSV data in a category directory and generates dynamic filter configurations
 * based on product variants for each category.
 * 
 * Usage:
 *   node generate-dynamic-filters.js <category-directory>
 * 
 * Example:
 *   node generate-dynamic-filters.js test/data/new/duoc-mi-pham
 */

const fs = require('fs').promises;
const path = require('path');

// Simple CSV parser - handles quoted fields with commas
function parseCSVLine(line) {
  if (!line || line.trim() === '') return null;

  const values = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else if (inQuotes && nextChar === ',') {
        // End of quoted field
        inQuotes = false;
        i++;
      } else {
        // Start or end of quotes
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      values.push(current);
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  // Add last field
  values.push(current);

  return values;
}

function parseJSON(str) {
  if (!str || str.trim() === '') return null;
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

function extractCategorySlug(categoryPath, categoryData) {
  if (categoryPath && categoryPath.trim()) {
    return categoryPath.trim();
  }

  if (!categoryData) return '';

  let category = null;
  if (typeof categoryData === 'string') {
    category = parseJSON(categoryData);
  } else if (Array.isArray(categoryData)) {
    category = categoryData;
  }

  if (Array.isArray(category) && category.length > 0) {
    const lastCategory = category[category.length - 1];
    if (lastCategory && lastCategory.slug) {
      return lastCategory.slug;
    }
  }

  return '';
}

function extractSubCategorySlug(categoryData) {
  if (!categoryData) return '';

  let category = null;
  if (typeof categoryData === 'string') {
    category = parseJSON(categoryData);
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
}

function normalizePriceValue(priceValue) {
  if (typeof priceValue === 'number') return priceValue;
  if (typeof priceValue === 'string') {
    const num = parseFloat(priceValue.replace(/[^\d.]/g, ''));
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

function categorizePrice(priceValue) {
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
}

async function readCSVFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) return [];

    const headerValues = parseCSVLine(lines[0]);
    if (!headerValues || headerValues.length === 0) return [];

    // Clean headers (remove quotes)
    const headers = headerValues.map(h => h.trim().replace(/^"|"$/g, ''));

    const products = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (!values || values.length === 0) continue;
      
      // Ensure we have enough values (pad with empty strings if needed)
      while (values.length < headers.length) {
        values.push('');
      }

      const product = {};
      headers.forEach((header, index) => {
        let value = (values[index] || '').trim();
        // Remove surrounding quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        product[header] = value;
      });

      // Only add if product has at least one non-empty field
      if (Object.values(product).some(v => v && v.trim())) {
        products.push(product);
      }
    }

    return products;
  } catch (error) {
    console.error(`Error reading CSV file ${filePath}:`, error.message);
    return [];
  }
}

function analyzeProducts(products) {
  const variants = {
    byCategory: {},
    bySubCategory: {},
    global: {
      brands: new Set(),
      origins: new Set(),
      manufacturers: new Set(),
      priceRanges: new Set(),
      allCategories: new Set()
    }
  };

  products.forEach(product => {
    const categorySlug = extractCategorySlug(
      product['category.categorySlug'],
      product['category.category']
    );
    const subCategorySlug = extractSubCategorySlug(product['category.category']);

    if (!categorySlug) return;

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

    const brand = (product['basicInfo.brand'] || '').trim();
    if (brand) {
      catVariant.brands.add(brand);
      variants.global.brands.add(brand);
      if (subCatVariant) subCatVariant.brands.add(brand);
    }

    const origin = (product['specifications.origin'] || '').trim();
    if (origin) {
      catVariant.origins.add(origin);
      variants.global.origins.add(origin);
      if (subCatVariant) subCatVariant.origins.add(origin);
    }

    const manufacturer = (product['specifications.manufacturer'] || '').trim();
    if (manufacturer) {
      catVariant.manufacturers.add(manufacturer);
      variants.global.manufacturers.add(manufacturer);
      if (subCatVariant) subCatVariant.manufacturers.add(manufacturer);
    }

    const priceValue = normalizePriceValue(product['pricing.currentPriceValue']);
    if (priceValue > 0) {
      const priceRange = categorizePrice(priceValue);
      if (priceRange) {
        catVariant.priceRanges.add(priceRange);
        variants.global.priceRanges.add(priceRange);
        if (subCatVariant) subCatVariant.priceRanges.add(priceRange);
      }

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

  // Convert Sets to Arrays
  Object.keys(variants.byCategory).forEach(catSlug => {
    const variant = variants.byCategory[catSlug];
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

  variants.global.brands = Array.from(variants.global.brands).sort();
  variants.global.origins = Array.from(variants.global.origins).sort();
  variants.global.manufacturers = Array.from(variants.global.manufacturers).sort();
  variants.global.priceRanges = Array.from(variants.global.priceRanges).sort();
  variants.global.allCategories = Array.from(variants.global.allCategories).sort();

  return variants;
}

const priceRangeLabels = {
  'under_100k': 'Dưới 100.000₫',
  '100k_to_300k': '100.000₫ đến 300.000₫',
  '300k_to_500k': '300.000₫ đến 500.000₫',
  'over_500k': 'Trên 500.000₫'
};

function getPriceRangeMin(range) {
  const ranges = {
    'under_100k': 0,
    '100k_to_300k': 100000,
    '300k_to_500k': 300000,
    'over_500k': 500000
  };
  return ranges[range] || 0;
}

function getPriceRangeMax(range) {
  const ranges = {
    'under_100k': 100000,
    '100k_to_300k': 300000,
    '300k_to_500k': 500000,
    'over_500k': Infinity
  };
  return ranges[range] || Infinity;
}

function generateFilterConfig(categorySlug, variants, options = {}) {
  const {
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
        count: null
      }));

    config.filters.push({
      id: 'brand',
      type: 'checkbox',
      label: 'Thương hiệu',
      field: 'basicInfo.brand',
      searchable: true,
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
      label: 'Xuất xứ thương hiệu',
      field: 'specifications.origin',
      searchable: true,
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
      label: 'Nước sản xuất',
      field: 'specifications.manufacturer',
      searchable: false,
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
        label: priceRangeLabels[range] || range,
        min: getPriceRangeMin(range),
        max: getPriceRangeMax(range)
      }));

    config.filters.push({
      id: 'priceRange',
      type: 'button',
      label: 'Giá bán',
      field: 'pricing.currentPriceValue',
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

  return config;
}

async function main() {
  const categoryDir = process.argv[2] || 'test/data/new/duoc-mi-pham';
  const outputFile = process.argv[3] || path.join(categoryDir, 'dynamic-filters.json');

  console.log(`📂 Analyzing category directory: ${categoryDir}`);
  console.log(`📝 Output file: ${outputFile}\n`);

  try {
    // Read all CSV files in the directory
    const files = await fs.readdir(categoryDir);
    const csvFiles = files.filter(f => f.endsWith('.csv'));

    if (csvFiles.length === 0) {
      console.error('❌ No CSV files found in directory');
      process.exit(1);
    }

    console.log(`📊 Found ${csvFiles.length} CSV file(s)\n`);

    // Read and combine all products
    let allProducts = [];
    for (const file of csvFiles) {
      const filePath = path.join(categoryDir, file);
      console.log(`  Reading: ${file}`);
      const products = await readCSVFile(filePath);
      allProducts = allProducts.concat(products);
      console.log(`    ✓ Loaded ${products.length} products`);
    }

    console.log(`\n📦 Total products: ${allProducts.length}\n`);

    // Analyze products
    console.log('🔍 Analyzing filter variants...');
    const variants = analyzeProducts(allProducts);

    console.log(`  ✓ Found ${Object.keys(variants.byCategory).length} categories`);
    console.log(`  ✓ Found ${Object.keys(variants.bySubCategory).length} subcategories`);
    console.log(`  ✓ Global brands: ${variants.global.brands.length}`);
    console.log(`  ✓ Global origins: ${variants.global.origins.length}\n`);

    // Generate filter configs for all categories
    console.log('🎯 Generating filter configurations...');
    const allConfigs = {};

    Object.keys(variants.byCategory).forEach(categorySlug => {
      const config = generateFilterConfig(categorySlug, variants, {
        minItemsPerFilter: 1,
        maxItemsPerFilter: 100
      });
      allConfigs[categorySlug] = config;
      console.log(`  ✓ ${categorySlug}: ${config.filters.length} filters, ${config.metadata.productCount} products`);
    });

    // Create final output structure
    const output = {
      metadata: {
        generatedAt: new Date().toISOString(),
        categoryDirectory: categoryDir,
        totalProducts: allProducts.length,
        totalCategories: Object.keys(variants.byCategory).length
      },
      globalVariants: {
        brands: variants.global.brands,
        origins: variants.global.origins,
        manufacturers: variants.global.manufacturers,
        priceRanges: variants.global.priceRanges,
        allCategories: variants.global.allCategories
      },
      categoryFilters: allConfigs,
      variants: {
        byCategory: variants.byCategory,
        bySubCategory: variants.bySubCategory
      }
    };

    // Write output file
    await fs.writeFile(outputFile, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\n✅ Filter configuration saved to: ${outputFile}`);

    // Print summary
    console.log('\n📋 Summary:');
    Object.keys(allConfigs).forEach(catSlug => {
      const config = allConfigs[catSlug];
      const filterNames = config.filters.map(f => f.label).join(', ');
      console.log(`  • ${catSlug}: ${filterNames || '(no filters)'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  readCSVFile,
  analyzeProducts,
  generateFilterConfig
};
