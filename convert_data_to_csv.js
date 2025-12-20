#!/usr/bin/env node
/**
 * Script to convert data.txt (lines 2-151) to CSV
 * Simulates the export workflow from the extension
 */

const fs = require('fs');
const path = require('path');

// Constants from export-handler.js
const MAX_DEPTH = 5;
const MAX_STRING_LENGTH = 50000;
const MAX_ROW_LENGTH = 1000000;
const MAX_KEYS_PER_OBJECT = 1000;

/**
 * Normalize product data to unified format (adapted from export-handler.js)
 */
function normalizeToAPIFormat(item) {
  if (!item || typeof item !== 'object') return item;
  
  // If already in grouped format (basicInfo, pricing, etc.), flatten it
  if (item.basicInfo || item.pricing || item.rating) {
    return flattenProductDetail(item);
  }
  
  return item;
}

/**
 * Flatten product detail from grouped format (from product-formatter.js)
 */
function flattenProductDetail(groupedData) {
  if (!groupedData || typeof groupedData !== 'object') return null;

  let priceDisplay = groupedData.pricing?.priceDisplay || groupedData.pricing?.price || '';
  if (!priceDisplay || priceDisplay.trim() === '') {
    priceDisplay = 'CONSULT';
  }

  return {
    name: groupedData.basicInfo?.name || '',
    sku: groupedData.basicInfo?.sku || '',
    brand: groupedData.basicInfo?.brand || '',
    webName: groupedData.basicInfo?.webName || '',
    slug: groupedData.basicInfo?.slug || '',
    price: groupedData.pricing?.price || priceDisplay || '',
    priceDisplay: priceDisplay,
    priceValue: groupedData.pricing?.priceValue || 0,
    packageSize: groupedData.pricing?.packageSize || '',
    prices: groupedData.pricing?.prices || [],
    priceObj: groupedData.pricing?.priceObj || null,
    rating: groupedData.rating?.rating || '',
    reviewCount: groupedData.rating?.reviewCount || '',
    commentCount: groupedData.rating?.commentCount || '',
    reviews: groupedData.rating?.reviews || '',
    category: groupedData.category?.category || [],
    categoryPath: groupedData.category?.categoryPath || '',
    categorySlug: groupedData.category?.categorySlug || '',
    image: groupedData.media?.image || '',
    images: groupedData.media?.images || [],
    description: groupedData.content?.description || '',
    ingredients: groupedData.content?.ingredients || '',
    usage: groupedData.content?.usage || '',
    dosage: groupedData.content?.dosage || '',
    adverseEffect: groupedData.content?.adverseEffect || '',
    careful: groupedData.content?.careful || '',
    preservation: groupedData.content?.preservation || '',
    registrationNumber: groupedData.specifications?.registrationNumber || '',
    origin: groupedData.specifications?.origin || '',
    manufacturer: groupedData.specifications?.manufacturer || '',
    shelfLife: groupedData.specifications?.shelfLife || '',
    specifications: groupedData.specifications?.specifications || {},
    link: groupedData.metadata?.link || '',
    productRanking: groupedData.metadata?.productRanking || 0,
    displayCode: groupedData.metadata?.displayCode || 1,
    isPublish: groupedData.metadata?.isPublish !== undefined ? groupedData.metadata.isPublish : true,
    packageOptions: Array.isArray(groupedData.pricing?.packageOptions) ? groupedData.pricing.packageOptions : []
  };
}

/**
 * Flatten a single item
 */
function flattenItem(item) {
  if (typeof item !== 'object' || item === null) {
    return { value: item };
  }
  return flattenObject(item, '', 0, MAX_DEPTH, new WeakSet());
}

/**
 * Flatten nested objects
 */
function flattenObject(obj, prefix = '', depth = 0, maxDepth = 5, visited = new WeakSet()) {
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
    const keys = Object.keys(obj).slice(0, MAX_KEYS_PER_OBJECT);
    
    for (const key of keys) {
      try {
        if (!obj.hasOwnProperty(key)) continue;
        
        const newKey = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        
        if (value === null || value === undefined) {
          flattened[newKey] = '';
        } else if (Array.isArray(value)) {
          // Special handling for packageOptions - format as readable string
          if (key === 'packageOptions' && value.length > 0) {
            const formatted = value.map(opt => {
              const parts = [];
              if (opt.unitDisplay) parts.push(opt.unitDisplay);
              if (opt.priceDisplay) parts.push(opt.priceDisplay);
              if (opt.specification) parts.push(`(${opt.specification})`);
              return parts.join(' ');
            }).join(' | ');
            flattened[newKey] = formatted;
          } else if (key === 'images' && Array.isArray(value)) {
            // Format images array as pipe-separated string
            flattened[newKey] = value.join(' | ');
          } else if (key === 'category' && Array.isArray(value)) {
            // Format category array as JSON string
            flattened[newKey] = JSON.stringify(value);
          } else {
            flattened[newKey] = value.length > 500 
              ? `[Array(${value.length})]`
              : stringifyArray(value);
          }
        } else if (typeof value === 'object') {
          const nested = flattenObject(value, newKey, depth + 1, maxDepth, visited);
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
        console.error(`Error processing key "${key}":`, keyError);
        continue;
      }
    }
  } catch (error) {
    console.error('_flattenObject error:', error);
    flattened[prefix || 'value'] = '[Error]';
  } finally {
    try {
      if (typeof obj === 'object' && obj !== null) {
        visited.delete(obj);
      }
    } catch (e) {}
  }

  return flattened;
}

/**
 * Stringify array safely
 */
function stringifyArray(arr) {
  try {
    const str = JSON.stringify(arr);
    return str.length > 5000 ? str.substring(0, 5000) + '...' : str;
  } catch (e) {
    return `[Array(${arr.length})]`;
  }
}

/**
 * Escape CSV value
 */
function escapeCSV(value) {
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
    if (str.length > MAX_STRING_LENGTH) {
      str = str.substring(0, MAX_STRING_LENGTH) + '...[truncated]';
    }
    
    return str.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' ');
  } catch (error) {
    console.error('escapeCSV error:', error);
    return '[Error]';
  }
}

/**
 * Collect headers from data sample
 */
function collectHeaders(data) {
  const allKeys = new Set();
  const MAX_SAMPLES = Math.min(5, data.length);
  
  for (let i = 0; i < MAX_SAMPLES; i++) {
    try {
      if (!data[i] || typeof data[i] !== 'object') continue;
      const itemCopy = JSON.parse(JSON.stringify(data[i]));
      const normalized = normalizeToAPIFormat(itemCopy);
      const flattened = flattenItem(normalized);
      Object.keys(flattened).forEach(key => allKeys.add(key));
    } catch (error) {
      console.error(`Error collecting keys from item ${i}:`, error);
    }
  }
  
  return Array.from(allKeys);
}

/**
 * Build CSV row from headers and flattened data
 */
function buildRow(headers, flattened, index) {
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
          value = str.length > MAX_STRING_LENGTH 
            ? str.substring(0, MAX_STRING_LENGTH) + '...[truncated]' 
            : str;
        }
      }
      
      return `"${escapeCSV(value)}"`;
    } catch (error) {
      console.error(`Error processing header "${header}" in item ${index}:`, error);
      return '""';
    }
  });

  const rowString = row.join(',');
  if (rowString.length > MAX_ROW_LENGTH) {
    console.warn(`Row ${index} too large, truncating`);
    return rowString.substring(0, MAX_ROW_LENGTH) + '...[truncated]';
  }
  
  return rowString;
}

/**
 * Convert data to CSV
 */
function convertToCSV(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.warn('Empty or invalid data');
    return '';
  }

  console.log(`Processing ${data.length} items`);
  
  let headers;
  try {
    headers = collectHeaders(data);
    console.log(`Collected ${headers.length} headers`);
  } catch (error) {
    console.error('Error collecting headers:', error);
    throw new Error('Lỗi khi thu thập headers: ' + error.message);
  }
  
  if (!headers?.length) {
    console.warn('No headers found');
    return '';
  }

  const CHUNK_SIZE = 50;
  const parts = [];
  
  // Header row with BOM for Excel UTF-8 support
  parts.push('\ufeff' + headers.map(h => `"${escapeCSV(h)}"`).join(','));
  
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
        
        const itemCopy = JSON.parse(JSON.stringify(data[i]));
        const normalized = normalizeToAPIFormat(itemCopy);
        const flattened = flattenItem(normalized);
        const row = buildRow(headers, flattened, i);
        chunkRows.push(row);
      } catch (error) {
        console.warn(`Error processing item ${i}:`, error);
        chunkRows.push(headers.map(() => '""').join(','));
      }
    }
    
    parts.push(chunkRows.join('\n'));
    
    if (data.length > 200 && chunkEnd % 100 === 0) {
      console.log(`Processed ${chunkEnd}/${data.length} rows`);
    }
  }

  const result = parts.join('\n');
  console.log(`CSV conversion complete, total length: ${result.length} chars`);
  return result;
}

/**
 * Extract category slug from data for filename
 */
function extractCategorySlug(data) {
  if (!data || data.length === 0) return '';
  
  const firstItem = data[0];
  if (firstItem?.category?.categorySlug) {
    return firstItem.category.categorySlug.replace(/\//g, '-');
  }
  
  if (firstItem?.category?.categoryPath) {
    return firstItem.category.categoryPath
      .split(' > ')
      .map(c => c.toLowerCase().replace(/\s+/g, '-'))
      .join('-');
  }
  
  return '';
}

/**
 * Main function
 */
function main() {
  // Get output filename from command line argument or use default
  const outputFilename = process.argv[2] || 'scraped-data.csv';
  
  const dataFilePath = path.join(__dirname, 'data.txt');
  const outputFilePath = path.join(__dirname, outputFilename);
  
  try {
    // Read the entire file
    console.log('Reading data from:', dataFilePath);
    const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
    
    // Parse the entire JSON array
    console.log('Parsing JSON...');
    const data = JSON.parse(fileContent);
    
    console.log(`Parsed ${data.length} items from entire file`);
    
    // Convert to CSV
    console.log('Converting to CSV...');
    const csvContent = convertToCSV(data);
    
    // Write to file
    console.log('Writing to:', outputFilePath);
    fs.writeFileSync(outputFilePath, csvContent, 'utf-8');
    
    console.log('✅ Successfully created CSV file!');
    console.log(`📊 Exported ${data.length} products`);
    console.log(`📁 Output file: ${outputFilePath}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run main function
if (require.main === module) {
  main();
}

module.exports = { convertToCSV, normalizeToAPIFormat, flattenProductDetail };

