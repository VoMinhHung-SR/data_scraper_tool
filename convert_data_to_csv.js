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
const ITEMS_PER_FILE = 100; // Split files if > 100 items

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
 * Convert chunk to CSV (for multiple files)
 */
function convertChunkToCSV(headers, chunk) {
  if (!Array.isArray(chunk) || chunk.length === 0) return '';

  const parts = [];
  // Header row with BOM for Excel UTF-8 support
  parts.push('\ufeff' + headers.map(h => `"${escapeCSV(h)}"`).join(','));

  for (let i = 0; i < chunk.length; i++) {
    try {
      if (!chunk[i] || typeof chunk[i] !== 'object') {
        parts.push(headers.map(() => '""').join(','));
        continue;
      }

      const itemCopy = JSON.parse(JSON.stringify(chunk[i]));
      const normalized = normalizeToAPIFormat(itemCopy);
      const flattened = flattenItem(normalized);
      const row = buildRow(headers, flattened, i);
      parts.push(row);
    } catch (error) {
      console.warn(`Error processing item ${i}:`, error);
      parts.push(headers.map(() => '""').join(','));
    }
  }

  return parts.join('\n');
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
 * Normalize titleSlug to filename format
 */
function normalizeTitleSlug(titleSlug) {
  if (!titleSlug) return '';
  // Convert "thuoc/thuoc-tim-mach-and-mau" to "thuoc-thuoc-tim-mach-and-mau"
  return titleSlug.replace(/\//g, '-');
}

/**
 * Generate filename with titleSlug and index range
 */
function generateFilename(titleSlug, startIndex, endIndex, outputDir) {
  const slug = normalizeTitleSlug(titleSlug);
  const indexSuffix = `-${startIndex}-${endIndex}`;
  const filename = slug 
    ? `scraped-data-${slug}${indexSuffix}.csv`
    : `scraped-data${indexSuffix}.csv`;
  return path.join(outputDir, filename);
}

/**
 * Export multiple CSV files (when > ITEMS_PER_FILE)
 * @param {Array} data - Data array to export (already sliced with skip/limit if needed)
 * @param {string} titleSlug - Title slug for filename
 * @param {string} outputDir - Output directory
 * @param {number} skipOffset - Offset to add to startIndex (for skip parameter, default: 0)
 */
function exportMultipleFiles(data, titleSlug, outputDir, skipOffset = 0) {
  const totalFiles = Math.ceil(data.length / ITEMS_PER_FILE);
  console.log(`📦 Splitting ${data.length} items into ${totalFiles} files...`);
  
  // Collect headers from first chunk
  let headers;
  try {
    const firstChunk = data.slice(0, ITEMS_PER_FILE);
    headers = collectHeaders(firstChunk);
    if (!headers?.length) {
      throw new Error('Không thể xác định headers');
    }
    console.log(`✅ Collected ${headers.length} headers`);
  } catch (error) {
    console.error('❌ Error collecting headers:', error);
    throw error;
  }
  
  const exportedFiles = [];
  
  for (let fileIndex = 0; fileIndex < totalFiles; fileIndex++) {
    const start = fileIndex * ITEMS_PER_FILE;
    const end = Math.min(start + ITEMS_PER_FILE, data.length);
    const chunk = data.slice(start, end);
    
    // Calculate actual indices for filename (1-based, with skip offset)
    const actualStartIndex = skipOffset + start + 1; // Start from 1, not 0, add skip offset
    const actualEndIndex = skipOffset + end; // End is actual number of items, add skip offset
    
    const filename = generateFilename(titleSlug, actualStartIndex, actualEndIndex, outputDir);
    
    console.log(`\n📄 Exporting file ${fileIndex + 1}/${totalFiles}: ${path.basename(filename)}`);
    console.log(`   Items: ${actualStartIndex}-${actualEndIndex} (${chunk.length} items)`);
    console.log(`   Data indices: [${start}] to [${end - 1}] (relative to sliced data, 0-based)`);
    
    try {
      const csvContent = convertChunkToCSV(headers, chunk);
      fs.writeFileSync(filename, csvContent, 'utf-8');
      exportedFiles.push(filename);
      console.log(`   ✅ Created: ${path.basename(filename)}`);
    } catch (error) {
      console.error(`   ❌ Error creating file ${filename}:`, error);
      throw error;
    }
  }
  
  return exportedFiles;
}

/**
 * Test export logic with skip and limit (dry-run, no files created)
 * @param {number} totalItems - Total items in data
 * @param {number} skip - Number of items to skip
 * @param {number} limit - Maximum number of items to export
 * @param {string} titleSlug - Title slug for filename
 */
function testExportLogic(totalItems, skip, limit, titleSlug = 'test-category') {
  console.log('\n🧪 TEST EXPORT LOGIC (DRY RUN)');
  console.log('='.repeat(60));
  console.log(`📊 Input parameters:`);
  console.log(`   Total items: ${totalItems}`);
  console.log(`   Skip: ${skip}`);
  console.log(`   Limit: ${limit}`);
  console.log(`   Title slug: ${titleSlug}`);
  
  // Apply skip and limit
  const actualSkip = Math.max(0, skip);
  const actualLimit = limit !== null ? Math.min(limit, totalItems - actualSkip) : (totalItems - actualSkip);
  const startIndex = actualSkip; // 0-based
  const endIndex = actualSkip + actualLimit; // 0-based (exclusive)
  
  console.log(`\n📐 Calculated values:`);
  console.log(`   Actual skip: ${actualSkip}`);
  console.log(`   Actual limit: ${actualLimit}`);
  console.log(`   Data range: [${startIndex}] to [${endIndex - 1}] (0-based index, inclusive)`);
  console.log(`   Items to export: ${actualLimit} items`);
  
  if (actualLimit <= 0) {
    console.log('\n⚠️  No items to export after applying skip/limit');
    return;
  }
  
  // Calculate how many files will be created
  const totalFiles = Math.ceil(actualLimit / ITEMS_PER_FILE);
  console.log(`\n📦 File splitting:`);
  console.log(`   Items per file: ${ITEMS_PER_FILE}`);
  console.log(`   Total files: ${totalFiles}`);
  
  console.log(`\n📄 Files that would be created:`);
  for (let fileIndex = 0; fileIndex < totalFiles; fileIndex++) {
    const relativeStart = fileIndex * ITEMS_PER_FILE;
    const relativeEnd = Math.min(relativeStart + ITEMS_PER_FILE, actualLimit);
    const chunkSize = relativeEnd - relativeStart;
    
    // Calculate actual indices for filename (1-based, with skip offset)
    const actualStartIndex = actualSkip + relativeStart + 1; // Start from 1, not 0, add skip
    const actualEndIndex = actualSkip + relativeEnd; // End is actual number of items, add skip
    
    const filename = generateFilename(titleSlug, actualStartIndex, actualEndIndex, './test/data');
    
    console.log(`\n   File ${fileIndex + 1}/${totalFiles}: ${path.basename(filename)}`);
    console.log(`   ├─ Filename indices: ${actualStartIndex}-${actualEndIndex} (1-based)`);
    console.log(`   ├─ Data range: [${actualSkip + relativeStart}] to [${actualSkip + relativeEnd - 1}] (0-based, original data)`);
    console.log(`   └─ Items in file: ${chunkSize}`);
  }
  
  console.log(`\n✅ Test complete!`);
  console.log('='.repeat(60));
}

/**
 * Main function
 */
function main() {
  // Parse command line arguments
  // Usage: 
  //   node convert_data_to_csv.js [titleSlug] [outputDir]
  //   node convert_data_to_csv.js --test [totalItems] [skip] [limit] [titleSlug]
  // Example: 
  //   node convert_data_to_csv.js "thuoc/thuoc-tim-mach-and-mau" "./test/data"
  //   node convert_data_to_csv.js --test 968 568 400 "thuoc/thuoc-tim-mach-and-mau"
  
  // Check for test mode
  if (process.argv[2] === '--test' || process.argv[2] === '--dry-run') {
    const totalItems = parseInt(process.argv[3] || '968', 10);
    const skip = parseInt(process.argv[4] || '568', 10);
    const limit = parseInt(process.argv[5] || '400', 10);
    const titleSlug = process.argv[6] || 'thuoc/thuoc-tim-mach-and-mau';
    
    testExportLogic(totalItems, skip, limit, titleSlug);
    return;
  }
  
  const titleSlug = process.argv[2] || null;
  const outputDir = process.argv[3] || __dirname;
  
  const dataFilePath = path.join(__dirname, 'data.txt');
  
  try {
    // Read the entire file
    console.log('📖 Reading data from:', dataFilePath);
    const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
    
    // Parse the entire JSON array
    console.log('🔍 Parsing JSON...');
    const data = JSON.parse(fileContent);
    
    console.log(`✅ Parsed ${data.length} items from file`);
    
    // Use titleSlug if provided, otherwise extract from data
    let finalTitleSlug = titleSlug;
    if (!finalTitleSlug) {
      const extracted = extractCategorySlug(data);
      if (extracted) {
        finalTitleSlug = extracted;
        console.log(`📌 Using extracted categorySlug: ${finalTitleSlug}`);
      } else {
        console.log('⚠️  No titleSlug provided and could not extract from data');
      }
    } else {
      console.log(`📌 Using provided titleSlug: ${finalTitleSlug}`);
    }
    
    // Check if we need to split into multiple files
    if (data.length > ITEMS_PER_FILE) {
      console.log(`\n📦 Data has ${data.length} items, splitting into multiple files...`);
      const exportedFiles = exportMultipleFiles(data, finalTitleSlug, outputDir);
      
      console.log('\n✅ Successfully exported all files!');
      console.log(`📊 Total: ${data.length} products in ${exportedFiles.length} files`);
      console.log(`📁 Output directory: ${outputDir}`);
      console.log('\n📄 Exported files:');
      exportedFiles.forEach((file, index) => {
        console.log(`   ${index + 1}. ${path.basename(file)}`);
      });
    } else {
      // Single file export
      console.log('\n📄 Converting to CSV (single file)...');
      const csvContent = convertToCSV(data);
      
      const actualStartIndex = 1;
      const actualEndIndex = data.length;
      const filename = generateFilename(finalTitleSlug, actualStartIndex, actualEndIndex, outputDir);
      
      console.log(`💾 Writing to: ${filename}`);
      fs.writeFileSync(filename, csvContent, 'utf-8');
      
      console.log('\n✅ Successfully created CSV file!');
      console.log(`📊 Exported ${data.length} products`);
      console.log(`📁 Output file: ${filename}`);
    }
    
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

module.exports = { 
  convertToCSV, 
  convertChunkToCSV,
  normalizeToAPIFormat, 
  flattenProductDetail,
  exportMultipleFiles,
  generateFilename,
  normalizeTitleSlug,
  testExportLogic
};

