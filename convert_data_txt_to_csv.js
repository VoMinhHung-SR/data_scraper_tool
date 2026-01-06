#!/usr/bin/env node
/**
 * Convert data.txt to CSV format matching the export schema
 * Usage: node convert_data_txt_to_csv.js [outputFile]
 */

const fs = require('fs');
const path = require('path');

// Constants from export-handler.js
const ITEMS_PER_FILE = 100;
const MAX_STRING_LENGTH = 50000;
const MAX_ROW_LENGTH = 1000000;
const MAX_KEYS_PER_OBJECT = 1000;
const MAX_DEPTH = 5;

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
    console.error('[ExportHandler] escapeCSV error:', error);
    return '[Error]';
  }
}

/**
 * Flatten object to key-value pairs
 */
function flattenObject(obj, prefix = '', depth = 0, maxDepth = 5, visited = new WeakSet()) {
  if (!obj || typeof obj !== 'object') {
    return { [prefix || 'value']: String(obj).substring(0, 10000) };
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
      const maxStrLen = 5000;
      return { [prefix || 'value']: str.length > maxStrLen ? str.substring(0, maxStrLen) + '...' : str };
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
    const maxArrayItems = 100;
    const limitedArr = arr.length > maxArrayItems ? arr.slice(0, maxArrayItems) : arr;
    const str = JSON.stringify(limitedArr);
    const maxStrLen = 10000;
    if (str.length > maxStrLen) {
      return arr.length > maxArrayItems 
        ? `[Array(${arr.length}) - first ${maxArrayItems} items]`
        : `[Array(${arr.length}) - truncated]`;
    }
    return str;
  } catch (e) {
    return `[Array(${arr.length})]`;
  }
}

/**
 * Flatten item to key-value pairs
 */
function flattenItem(item) {
  if (!item || typeof item !== 'object') {
    return {};
  }
  
  try {
    return flattenObject(item, '', 0, MAX_DEPTH, new WeakSet());
  } catch (error) {
    console.error('Error flattening item:', error);
    return { error: '[Flatten Error]' };
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
      const flattened = flattenItem(data[i]);
      Object.keys(flattened).forEach(key => allKeys.add(key));
    } catch (error) {
      console.error(`Error collecting keys from item ${i}:`, error);
    }
  }
  
  return Array.from(allKeys).sort();
}

/**
 * Build CSV row from headers and flattened data
 */
function buildRow(headers, flattened, index) {
  return headers.map(header => {
    try {
      const value = flattened[header];
      if (value === null || value === undefined) {
        return '""';
      }
      
      return `"${escapeCSV(value)}"`;
    } catch (error) {
      console.error(`Error processing header "${header}" in item ${index}:`, error);
      return '""';
    }
  }).join(',');
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
        
        const flattened = flattenItem(data[i]);
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
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const inputFile = path.join(__dirname, 'data.txt');
  const outputFile = args[0] || path.join(__dirname, 'scraped-data.csv');
  
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ File not found: ${inputFile}`);
    process.exit(1);
  }
  
  try {
    console.log(`📖 Reading ${inputFile}...`);
    const fileContent = fs.readFileSync(inputFile, 'utf-8');
    
    console.log('📝 Parsing JSON...');
    const data = JSON.parse(fileContent);
    
    if (!Array.isArray(data)) {
      console.error('❌ Data is not an array');
      process.exit(1);
    }
    
    console.log(`✅ Loaded ${data.length} items`);
    
    // Check if we need to split into multiple files
    if (data.length > ITEMS_PER_FILE) {
      const totalFiles = Math.ceil(data.length / ITEMS_PER_FILE);
      console.log(`\n📦 Data has ${data.length} items, splitting into ${totalFiles} files...`);
      
      // Collect headers from first chunk
      const firstChunk = data.slice(0, ITEMS_PER_FILE);
      const headers = collectHeaders(firstChunk);
      if (!headers?.length) {
        throw new Error('Không thể xác định headers');
      }
      console.log(`✅ Collected ${headers.length} headers`);
      
      const exportedFiles = [];
      
      for (let fileIndex = 0; fileIndex < totalFiles; fileIndex++) {
        const start = fileIndex * ITEMS_PER_FILE;
        const end = Math.min(start + ITEMS_PER_FILE, data.length);
        const chunk = data.slice(start, end);
        
        const actualStartIndex = start + 1;
        const actualEndIndex = end;
        
        const baseName = path.basename(outputFile, '.csv');
        const dirName = path.dirname(outputFile);
        const filename = path.join(dirName, `${baseName}-${actualStartIndex}-${actualEndIndex}.csv`);
        
        console.log(`\n📄 Exporting file ${fileIndex + 1}/${totalFiles}: ${path.basename(filename)}`);
        console.log(`   Items: ${actualStartIndex}-${actualEndIndex} (${chunk.length} items)`);
        
        const csvContent = convertChunkToCSV(headers, chunk);
        fs.writeFileSync(filename, csvContent, 'utf-8');
        exportedFiles.push(filename);
        console.log(`   ✅ Created: ${path.basename(filename)}`);
      }
      
      console.log('\n✅ Successfully exported all files!');
      console.log(`📊 Total: ${data.length} products in ${exportedFiles.length} files`);
      console.log(`📁 Output directory: ${path.dirname(outputFile)}`);
      console.log('\n📄 Exported files:');
      exportedFiles.forEach((file, index) => {
        console.log(`   ${index + 1}. ${path.basename(file)}`);
      });
    } else {
      // Single file export
      console.log('\n📄 Converting to CSV (single file)...');
      const csvContent = convertToCSV(data);
      
      console.log(`💾 Writing to: ${outputFile}`);
      fs.writeFileSync(outputFile, csvContent, 'utf-8');
      
      console.log('\n✅ Successfully created CSV file!');
      console.log(`📊 Exported ${data.length} products`);
      console.log(`📁 Output file: ${outputFile}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Convert chunk to CSV
 */
function convertChunkToCSV(headers, chunk) {
  if (!Array.isArray(chunk) || chunk.length === 0) return '';

  const parts = [];
  parts.push('\ufeff' + headers.map(h => `"${escapeCSV(h)}"`).join(','));

  for (let i = 0; i < chunk.length; i++) {
    try {
      if (!chunk[i] || typeof chunk[i] !== 'object') {
        parts.push(headers.map(() => '""').join(','));
        continue;
      }

      const flattened = flattenItem(chunk[i]);
      const row = buildRow(headers, flattened, i);
      parts.push(row);
    } catch (error) {
      console.error(`Error processing item ${i}:`, error);
      parts.push(headers.map(() => '""').join(','));
    }
  }

  return parts.join('\n');
}

// Run main function
if (require.main === module) {
  main();
}

module.exports = {
  convertToCSV,
  convertChunkToCSV,
  flattenItem,
  collectHeaders
};
