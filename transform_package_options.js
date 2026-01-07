#!/usr/bin/env node
/**
 * Script to transform packageOptions from string to array of objects
 * and clean up metadata fields
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse price string to number
 * Examples: "152.000đ" -> 152000, "7.600đ" -> 7600
 */
function parsePriceValue(priceStr) {
  if (!priceStr || typeof priceStr !== 'string') return 0;
  
  // Remove currency symbols and spaces
  const cleaned = priceStr
    .replace(/[đ₫,]/g, '')
    .replace(/\./g, '')
    .trim();
  
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Normalize unit name to unit code
 * Examples: "Hộp" -> "hop", "Ống" -> "ong"
 */
function normalizeUnitCode(unitName) {
  if (!unitName || typeof unitName !== 'string') return '';
  
  const lower = unitName.toLowerCase().trim();
  
  // Map common Vietnamese unit names (check before removing special chars)
  // Order matters: more specific patterns first
  
  // Hộp (box) - various spellings
  if (/h[oộ]p/i.test(lower)) return 'hop';
  
  // Vỉ (blister pack) - must check before "viên"
  if (/^vỉ|^vi[^eê]|vỉ$/i.test(lower)) return 'vi';
  
  // Viên (tablet/pill)
  if (/vi[êe]n/i.test(lower)) return 'vien';
  
  // Gói (packet/bag)
  if (/g[oó]i/i.test(lower)) return 'goi';
  
  // Chai (bottle)
  if (/chai/i.test(lower)) return 'chai';
  
  // Tuýp/Tuyp (tube) - improved pattern to catch more variations
  if (/tu[ýy]p|tuyp/i.test(lower)) return 'tuyp';
  
  // Miếng (piece/slice)
  if (/mi[ếe]ng/i.test(lower)) return 'mieng';
  
  // Ống (tube/vial)
  if (/[oố]ng/i.test(lower)) return 'ong';
  
  // Thùng (carton/box)
  if (/th[ùu]ng/i.test(lower)) return 'thung';
  
  // Lốc (pack/block)
  if (/l[ốo]c/i.test(lower)) return 'loc';
  
  // Lọ (bottle/jar)
  if (/l[ọo]/i.test(lower)) return 'lo';
  
  // Bình (bottle/flask)
  if (/b[ìi]nh/i.test(lower)) return 'binh';
  
  // Túi (bag/pouch)
  if (/t[úu]i/i.test(lower)) return 'tui';
  
  // Hũ (jar/pot)
  if (/h[ũu]/i.test(lower)) return 'hu';
  
  // Hộp Ống (box of tubes) - compound unit
  if (/h[oộ]p\s*[oố]ng|h[oộ]p\s*ống/i.test(lower)) return 'hopong';
  
  // Fallback: remove special chars and use as-is
  const normalized = lower.replace(/[^a-z0-9]/g, '');
  return normalized || 'default';
}

/**
 * Parse packageOptions string to array of objects with full schema
 * Input: "Hộp 152.000đ / Hộp (Hộp) | Ống 7.600đ / Ống (Hộp)"
 * Output: Full schema objects with unit, unitDisplay, price, priceDisplay, priceValue, specification, etc.
 */
function parsePackageOptions(packageOptionsStr, pricesArray = []) {
  // If empty or CONSULT, return empty array
  if (!packageOptionsStr || 
      typeof packageOptionsStr !== 'string' || 
      packageOptionsStr.trim() === '' ||
      packageOptionsStr.trim().toUpperCase() === 'CONSULT') {
    return [];
  }
  
  // Split by pipe separator
  const options = packageOptionsStr.split('|').map(opt => opt.trim()).filter(opt => opt !== '');
  
  if (options.length === 0) return [];
  
  const parsedOptions = [];
  const seenUnits = new Set();
  
  for (let i = 0; i < options.length; i++) {
    const optionStr = options[i];
    
    // Pattern: "UnitName Price / UnitDisplay (Specification)"
    // Example: "Hộp 152.000đ / Hộp (Hộp)" or "Ống 7.600đ / Ống (Hộp)"
    
    // Extract unit name (first word before price)
    const unitNameMatch = optionStr.match(/^([^0-9]+?)\s+([\d.]+)\s*[đ₫]/);
    const unitName = unitNameMatch ? unitNameMatch[1].trim() : '';
    
    if (!unitName || seenUnits.has(unitName)) {
      continue; // Skip duplicates
    }
    seenUnits.add(unitName);
    
    // Extract price
    const priceMatch = optionStr.match(/([\d.]+)\s*[đ₫]/);
    const priceStr = priceMatch ? `${priceMatch[1].replace(/\./g, ',')}đ` : '';
    const priceValue = priceMatch ? parsePriceValue(priceMatch[1] + 'đ') : 0;
    
    // Extract unitDisplay (after "/")
    const unitDisplayMatch = optionStr.match(/\/\s*([^(]+?)(?:\s*\(|$)/);
    const unitDisplay = unitDisplayMatch ? unitDisplayMatch[1].trim() : unitName;
    
    // Extract specification (in parentheses)
    const specMatch = optionStr.match(/\(([^)]+)\)/);
    const specification = specMatch ? specMatch[1].trim() : '';
    
    // Extract priceDisplay (full price display string)
    const priceDisplayMatch = optionStr.match(/([\d.,]+\s*[đ₫])\s*\/\s*([^\(]+)/);
    const priceDisplay = priceDisplayMatch 
      ? `${priceDisplayMatch[1]} / ${priceDisplayMatch[2].trim()}`
      : (priceStr ? `${priceStr} / ${unitDisplay}` : '');
    
    // Find matching price object from prices array for additional info
    let originalPrice = '';
    let originalPriceValue = 0;
    let discount = 0;
    let discountPercent = 0;
    
    if (Array.isArray(pricesArray) && pricesArray.length > 0) {
      const matchingPrice = pricesArray.find(p => 
        p.priceValue === priceValue || 
        (p.priceDisplay && p.priceDisplay.includes(unitName))
      );
      
      if (matchingPrice) {
        originalPrice = matchingPrice.originalPrice || '';
        originalPriceValue = matchingPrice.originalPriceValue || 0;
        discount = matchingPrice.discount || 0;
        discountPercent = matchingPrice.discountPercent || 0;
      }
    }
    
    parsedOptions.push({
      unit: normalizeUnitCode(unitName),
      unitDisplay: unitDisplay,
      price: priceStr,
      priceDisplay: priceDisplay,
      priceValue: priceValue,
      originalPrice: originalPrice,
      originalPriceValue: originalPriceValue,
      discount: discount,
      discountPercent: discountPercent,
      specification: specification,
      isDefault: false, // Will be set after sorting
      isAvailable: true,
      conversion: null
    });
  }
  
  // Sort by priceValue descending, highest price is default
  parsedOptions.sort((a, b) => b.priceValue - a.priceValue);
  
  // Set isDefault for the highest price option
  if (parsedOptions.length > 0) {
    parsedOptions.forEach((opt, index) => {
      opt.isDefault = index === 0;
    });
  }
  
  return parsedOptions;
}

/**
 * Extract packageSize from packageOptions and product name
 * Example: If product name has "(20 ống x 10ml)" and default option is "Hộp", return "Hộp 20 ống"
 */
function extractPackageSize(packageOptions, currentPackageSize = '', productName = '') {
  if (!Array.isArray(packageOptions) || packageOptions.length === 0) {
    return currentPackageSize || '';
  }
  
  const defaultOption = packageOptions.find(opt => opt.isDefault);
  if (!defaultOption) {
    return currentPackageSize || '';
  }
  
  // Try to extract package info from product name
  // Pattern: "(20 ống x 10ml)" or similar
  if (productName) {
    const packageMatch = productName.match(/\((\d+)\s*([^x)]+)(?:\s*x\s*[^)]+)?\)/);
    if (packageMatch) {
      const quantity = packageMatch[1];
      const unit = packageMatch[2].trim();
      const mainUnit = defaultOption.unitDisplay || currentPackageSize;
      
      // Build packageSize: "Hộp 20 ống"
      if (mainUnit && unit && quantity) {
        return `${mainUnit} ${quantity} ${unit}`;
      }
    }
  }
  
  // Try to find specification from default option
  if (defaultOption.specification) {
    // If specification contains numbers and units, use it
    if (/\d/.test(defaultOption.specification)) {
      return defaultOption.specification;
    }
  }
  
  // Try to build from unitDisplay and specification
  const parts = [];
  if (defaultOption.unitDisplay) parts.push(defaultOption.unitDisplay);
  if (defaultOption.specification && defaultOption.specification !== defaultOption.unitDisplay) {
    parts.push(defaultOption.specification);
  }
  if (parts.length > 0) {
    return parts.join(' ');
  }
  
  // Fallback to current packageSize
  return currentPackageSize || '';
}

/**
 * Normalize product data according to schema
 * Remove unwanted fields and ensure correct structure
 */
function normalizeProduct(product) {
  if (!product || typeof product !== 'object') return product;
  
  // Build normalized product object according to schema
  const normalized = {
    basicInfo: {},
    pricing: {},
    rating: {},
    category: {},
    media: {},
    content: {},
    specifications: {},
    metadata: {}
  };
  
  // basicInfo
  if (product.basicInfo || product.name || product.sku) {
    normalized.basicInfo = {
      name: String(product.basicInfo?.name || product.name || '').trim(),
      sku: String(product.basicInfo?.sku || product.sku || '').trim(),
      brand: String(product.basicInfo?.brand || product.brand || '').trim(),
      webName: String(product.basicInfo?.webName || product.webName || product.name || '').trim(),
      slug: String(product.basicInfo?.slug || product.slug || '').trim()
    };
  }
  
  // pricing
  if (product.pricing) {
    normalized.pricing = {
      price: String(product.pricing.price || '').trim(),
      priceDisplay: String(product.pricing.priceDisplay || product.pricing.price || '').trim(),
      priceValue: Number(product.pricing.priceValue || product.pricing.priceValue || 0) || 0,
      currentPrice: String(product.pricing.currentPrice || product.pricing.price || '').trim(),
      currentPriceValue: Number(product.pricing.currentPriceValue || product.pricing.priceValue || 0) || 0,
      originalPrice: String(product.pricing.originalPrice || '').trim(),
      originalPriceValue: Number(product.pricing.originalPriceValue || 0) || 0,
      discount: Number(product.pricing.discount || 0) || 0,
      discountPercent: Number(product.pricing.discountPercent || 0) || 0,
      packageSize: String(product.pricing.packageSize || '').trim(),
      prices: Array.isArray(product.pricing.prices) ? product.pricing.prices : [],
      packageOptions: []
    };
    
    // Transform packageOptions from string to array
    if (product.pricing.packageOptions) {
      const packageOptionsStr = typeof product.pricing.packageOptions === 'string' 
        ? product.pricing.packageOptions 
        : '';
      
      normalized.pricing.packageOptions = parsePackageOptions(
        packageOptionsStr, 
        normalized.pricing.prices
      );
      
      // Update packageSize only if it's empty or doesn't contain numbers
      if (normalized.pricing.packageOptions.length > 0) {
        const currentPackageSize = normalized.pricing.packageSize || '';
        if (!currentPackageSize || !/\d/.test(currentPackageSize)) {
          const productName = normalized.basicInfo.name || '';
          const extractedSize = extractPackageSize(
            normalized.pricing.packageOptions, 
            currentPackageSize,
            productName
          );
          if (extractedSize && /\d/.test(extractedSize)) {
            normalized.pricing.packageSize = extractedSize;
          }
        }
      }
    }
  }
  
  // rating
  if (product.rating) {
    normalized.rating = {
      rating: String(product.rating.rating ?? '').trim(),
      reviewCount: String(product.rating.reviewCount ?? '').trim(),
      commentCount: String(product.rating.commentCount ?? '').trim(),
      reviews: String(product.rating.reviews ?? '').trim()
    };
  }
  
  // category
  if (product.category) {
    normalized.category = {
      category: Array.isArray(product.category.category || product.category) 
        ? (product.category.category || product.category) 
        : [],
      categoryPath: String(product.category.categoryPath || '').trim(),
      categorySlug: String(product.category.categorySlug || '').trim()
    };
  }
  
  // media
  if (product.media) {
    normalized.media = {
      image: String(product.media.image || '').trim(),
      images: Array.isArray(product.media.images) ? product.media.images : []
    };
  }
  
  // content
  if (product.content) {
    normalized.content = {
      description: String(product.content.description || '').trim(),
      ingredients: String(product.content.ingredients || '').trim(),
      usage: String(product.content.usage || '').trim(),
      dosage: String(product.content.dosage || '').trim(),
      adverseEffect: String(product.content.adverseEffect || '').trim(),
      careful: String(product.content.careful || '').trim(),
      preservation: String(product.content.preservation || '').trim()
    };
  }
  
  // specifications - only keep origin, manufacturer, shelfLife, and specifications object
  if (product.specifications) {
    normalized.specifications = {
      origin: String(product.specifications.origin || '').trim(),
      manufacturer: String(product.specifications.manufacturer || '').trim(),
      shelfLife: String(product.specifications.shelfLife || '').trim(),
      specifications: (product.specifications.specifications && typeof product.specifications.specifications === 'object')
        ? product.specifications.specifications
        : {}
    };
  }
  
  // metadata - only keep link
  if (product.metadata) {
    normalized.metadata = {
      link: String(product.metadata.link || '').trim()
    };
  }
  
  return normalized;
}

/**
 * Transform product data (backward compatibility)
 */
function transformProduct(product) {
  return normalizeProduct(product);
}

/**
 * Transform JSON file
 */
function transformJSONFile(inputFile, outputFile) {
  console.log(`📖 Reading file: ${inputFile}`);
  
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  
  if (!Array.isArray(data)) {
    console.error('❌ Data is not an array');
    return;
  }
  
  console.log(`✅ Found ${data.length} items`);
  
  const transformed = data.map((item, index) => {
    try {
      return transformProduct(item);
    } catch (error) {
      console.error(`⚠️  Error transforming item ${index + 1}:`, error.message);
      return item;
    }
  });
  
  console.log(`💾 Writing to: ${outputFile}`);
  fs.writeFileSync(outputFile, JSON.stringify(transformed, null, 2), 'utf-8');
  
  console.log(`\n✅ Transformation complete!`);
  console.log(`📊 Transformed ${transformed.length} items`);
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    const defaultFile = path.join(__dirname, 'scraped-data-1-1.json');
    if (fs.existsSync(defaultFile)) {
      transformJSONFile(defaultFile, defaultFile);
      return;
    }
    console.log('Usage: node transform_package_options.js [input-file] [output-file]');
    console.log('Example: node transform_package_options.js scraped-data-1-1.json scraped-data-1-1.json');
    process.exit(1);
  }
  
  const inputFile = path.isAbsolute(args[0]) ? args[0] : path.join(__dirname, args[0]);
  const outputFile = args[1] 
    ? (path.isAbsolute(args[1]) ? args[1] : path.join(__dirname, args[1]))
    : inputFile;
  
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ File not found: ${inputFile}`);
    process.exit(1);
  }
  
  transformJSONFile(inputFile, outputFile);
}

// Run main function
if (require.main === module) {
  main();
}

module.exports = {
  parsePackageOptions,
  transformProduct,
  parsePriceValue,
  normalizeUnitCode,
  extractPackageSize
};
