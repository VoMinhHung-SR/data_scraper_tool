#!/usr/bin/env node
/**
 * Script to convert CSV files to JSON format
 * Handles nested keys (basicInfo.name, pricing.price, etc.) and JSON strings in CSV
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse CSV line with proper handling of quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current);
  return result;
}

/**
 * Parse CSV content
 */
function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }
  
  // Remove BOM if present
  const firstLine = lines[0].replace(/^\ufeff/, '');
  const headers = parseCSVLine(firstLine);
  
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length === headers.length) {
      rows.push(row);
    }
  }
  
  return { headers, rows };
}

/**
 * Try to parse JSON string, return original if fails
 */
function tryParseJSON(value) {
  if (!value || value.trim() === '') return value;
  
  // Check if it looks like JSON (starts with [ or {)
  const trimmed = value.trim();
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      return JSON.parse(value);
    } catch (e) {
      // If parsing fails, return original value
      return value;
    }
  }
  
  return value;
}

/**
 * Convert string to appropriate type
 */
function convertValue(value, key = '') {
  if (value === '' || value === null || value === undefined) {
    return '';
  }
  
  // For packageOptions, keep as string (will be transformed later)
  if (key === 'pricing.packageOptions' || key.endsWith('.packageOptions')) {
    return value;
  }
  
  // Try to parse as JSON first
  const jsonParsed = tryParseJSON(value);
  if (jsonParsed !== value) {
    return jsonParsed;
  }
  
  // Try to parse as number
  if (/^-?\d+$/.test(value)) {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      return num;
    }
  }
  
  // Try to parse as boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  
  return value;
}

/**
 * Build nested object from flat keys with dot notation
 */
function buildNestedObject(headers, row) {
  const result = {};
  
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    const value = convertValue(row[i], key);
    
    // Split key by dots to create nested structure
    const keys = key.split('.');
    let current = result;
    
    for (let j = 0; j < keys.length - 1; j++) {
      const k = keys[j];
      if (!current[k]) {
        current[k] = {};
      }
      current = current[k];
    }
    
    // Set the final value
    const finalKey = keys[keys.length - 1];
    current[finalKey] = value;
  }
  
  return result;
}

/**
 * Convert CSV file to JSON
 */
function convertCSVToJSON(csvFilePath) {
  console.log(`📖 Reading CSV file: ${csvFilePath}`);
  
  const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
  const { headers, rows } = parseCSV(csvContent);
  
  console.log(`✅ Parsed ${rows.length} rows with ${headers.length} columns`);
  
  const jsonData = rows.map((row, index) => {
    try {
      return buildNestedObject(headers, row);
    } catch (error) {
      console.error(`⚠️  Error processing row ${index + 1}:`, error.message);
      return null;
    }
  }).filter(item => item !== null);
  
  return jsonData;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node convert_csv_to_json.js <csv-file-1> [csv-file-2] ...');
    console.log('Example: node convert_csv_to_json.js scraped-data-1-1.csv scraped-data-1-2.csv');
    process.exit(1);
  }
  
  const csvFiles = args;
  const allData = [];
  
  for (const csvFile of csvFiles) {
    const csvPath = path.isAbsolute(csvFile) 
      ? csvFile 
      : path.join(__dirname, csvFile);
    
    if (!fs.existsSync(csvPath)) {
      console.error(`❌ File not found: ${csvPath}`);
      continue;
    }
    
    try {
      const jsonData = convertCSVToJSON(csvPath);
      allData.push(...jsonData);
      console.log(`✅ Converted ${jsonData.length} items from ${path.basename(csvFile)}\n`);
    } catch (error) {
      console.error(`❌ Error converting ${csvFile}:`, error.message);
      console.error(error.stack);
    }
  }
  
  if (allData.length === 0) {
    console.error('❌ No data converted');
    process.exit(1);
  }
  
  // Generate output filename
  const baseName = path.basename(csvFiles[0], '.csv');
  const outputFile = path.join(__dirname, `${baseName}.json`);
  
  console.log(`💾 Writing ${allData.length} items to: ${outputFile}`);
  fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2), 'utf-8');
  
  console.log(`\n✅ Successfully converted to JSON!`);
  console.log(`📊 Total items: ${allData.length}`);
  console.log(`📁 Output file: ${outputFile}`);
}

// Run main function
if (require.main === module) {
  main();
}

module.exports = {
  convertCSVToJSON,
  parseCSV,
  buildNestedObject,
  convertValue
};
