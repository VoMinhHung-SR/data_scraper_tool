(() => {
  'use strict';

  /**
   * Extract last path segment (basename) of a CDN url to use as dedupe key.
   * Returns the URL itself when parsing fails (treat as unique).
   */
  const _imageBasename = (url) => {
    if (!url || typeof url !== 'string') return '';
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || url;
    } catch (e) {
      const segs = url.split('/').filter(Boolean);
      return segs[segs.length - 1] || url;
    }
  };

  /**
   * Long Châu CDN encodes resize spec as `/<W>x<H>/` segment, e.g. `2560x0` / `256x0`.
   * Parse the first dimension as a "score" so we can keep the largest variant.
   * Returns 0 when not present.
   */
  const _imageWidthScore = (url) => {
    if (!url || typeof url !== 'string') return 0;
    const m = url.match(/\/(\d+)x(\d+)\//);
    if (!m) return 0;
    const w = parseInt(m[1], 10) || 0;
    const h = parseInt(m[2], 10) || 0;
    return Math.max(w, h);
  };

  /**
   * Recognized Vietnamese pharmacy units used by Long Châu packing strings.
   * Pattern is conservative; unknown units fall through and yield qty=null.
   */
  // Keep multi-char units (mg, ml, kg) BEFORE single-char (g, l) so the regex
  // alternation (leftmost wins) doesn't misparse "60mg" as count=undefined+"g".
  const _PACKING_UNIT_PATTERN = '(Hộp|Vỉ|Ống|Viên|Gói|Chai|Tuýp|Tuyp|Miếng|Thùng|Lốc|Lọ|Bình|Túi|Hũ|mg|ml|kg|g|l)';

  /**
   * Parse a Long Châu "Quy cách" string into ordered (count, unitName) tokens
   * then derive how many base-unit items each level contains.
   *
   * Examples:
   *   "Hộp 30 Viên"          -> base=Viên, { hop: 30, vien: 1 }
   *   "Hộp 3 Vỉ x 10 Viên"   -> base=Viên, { hop: 30, vi: 10, vien: 1 }
   *   "Hộp x 50ml"           -> base=ml,   { hop: 50, ml: 1 }
   *   "Hộp 2 Vỉ x 10 Ống x 5ml" -> base=ml, { hop: 100, vi: 50, ong: 5, ml: 1 }
   *
   * Returns null when string can't be parsed.
   */
  const _parsePackingToQuantities = (packingStr) => {
    if (!packingStr || typeof packingStr !== 'string') return null;
    const Extractors = window.DataScraperDetailExtractors;
    const pairRegex = new RegExp(`(\\d+)?\\s*${_PACKING_UNIT_PATTERN}`, 'gi');
    const tokens = [];
    let match;
    while ((match = pairRegex.exec(packingStr)) !== null) {
      const count = match[1] ? parseInt(match[1], 10) : 1;
      const unitName = match[2];
      if (!Number.isFinite(count) || count <= 0 || !unitName) continue;
      tokens.push({ count, unitName });
    }
    if (tokens.length === 0) return null;

    const codeOf = (name) => {
      if (Extractors && typeof Extractors.normalizeUnitCode === 'function') {
        const code = Extractors.normalizeUnitCode(name);
        if (code) return code;
      }
      return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const byCode = {};
    for (let i = 0; i < tokens.length; i++) {
      let qty = 1;
      for (let j = i + 1; j < tokens.length; j++) qty *= tokens[j].count;
      const code = codeOf(tokens[i].unitName);
      if (!(code in byCode)) {
        byCode[code] = { unitName: tokens[i].unitName, quantityInBase: qty };
      }
    }
    const baseToken = tokens[tokens.length - 1];
    return {
      baseUnit: baseToken.unitName,
      baseUnitCode: codeOf(baseToken.unitName),
      byCode
    };
  };

  /**
   * Enforce a deterministic ordering on saleUnits regardless of which variant
   * was active in the DOM when the page was scraped. Without this, scraping
   * the same product twice can yield different `unitOrder` and `isDefault`
   * depending on which unit button the user happened to click first.
   *
   * Ordering rules (largest → smallest pack):
   *   1) `quantityInBase` DESC (null/undefined treated as smallest).
   *   2) `priceValue` DESC (more expensive ⇒ larger pack as fallback).
   *   3) Original index ASC for stable tie-breaking.
   *
   * Side effects: rewrites `unitOrder = 0..n-1` and forces `isDefault = (i===0)`
   * so the largest pack is always the canonical default. Other fields untouched.
   */
  const _normalizeSaleUnitsOrder = (saleUnits) => {
    if (!Array.isArray(saleUnits) || saleUnits.length === 0) return saleUnits || [];
    const indexed = saleUnits.map((u, i) => ({ unit: u, _origIdx: i }));
    indexed.sort((a, b) => {
      const qa = (typeof a.unit.quantityInBase === 'number' && Number.isFinite(a.unit.quantityInBase))
        ? a.unit.quantityInBase : -Infinity;
      const qb = (typeof b.unit.quantityInBase === 'number' && Number.isFinite(b.unit.quantityInBase))
        ? b.unit.quantityInBase : -Infinity;
      if (qa !== qb) return qb - qa;
      const pa = (typeof a.unit.priceValue === 'number') ? a.unit.priceValue : 0;
      const pb = (typeof b.unit.priceValue === 'number') ? b.unit.priceValue : 0;
      if (pa !== pb) return pb - pa;
      return a._origIdx - b._origIdx;
    });
    return indexed.map(({ unit }, i) => ({
      ...unit,
      unitOrder: i,
      isDefault: i === 0
    }));
  };

  /**
   * Build the structured saleUnits array from raw packageOptions emitted by
   * the detail scraper, enriching with quantityInBase derived from packing.
   */
  const _buildSaleUnits = (packageOptions, packingStr) => {
    if (!Array.isArray(packageOptions) || packageOptions.length === 0) return [];
    const Extractors = window.DataScraperDetailExtractors;
    const codeOf = (name) => {
      if (Extractors && typeof Extractors.normalizeUnitCode === 'function') {
        const code = Extractors.normalizeUnitCode(name);
        if (code) return code;
      }
      return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    };
    const parsed = _parsePackingToQuantities(packingStr);
    return packageOptions.map((opt, idx) => {
      const unitName = opt.unitDisplay || opt.unit || '';
      const unitCode = opt.unit || codeOf(unitName);
      const fromPacking = parsed?.byCode?.[unitCode];
      const quantityInBase = fromPacking
        ? fromPacking.quantityInBase
        : (opt.conversion?.quantity ?? null);
      const compareAtPriceValue = opt.originalPriceValue && opt.originalPriceValue > (opt.priceValue || 0)
        ? opt.originalPriceValue
        : null;
      return {
        unitName,
        unitCode,
        unitOrder: typeof opt.unitOrder === 'number' ? opt.unitOrder : idx,
        quantityInBase,
        priceValue: typeof opt.priceValue === 'number' ? opt.priceValue : 0,
        priceDisplay: opt.priceDisplay || '',
        compareAtPrice: compareAtPriceValue ? (opt.originalPrice || '') : null,
        compareAtPriceValue,
        isDefault: !!opt.isDefault,
        isAvailable: opt.isAvailable !== false
      };
    });
  };

  /**
   * Dedupe Long Châu image URLs by basename, keeping the highest resolution
   * for each basename. Preserves first-seen order.
   */
  const _dedupeImages = (images) => {
    if (!Array.isArray(images) || images.length === 0) return [];
    const groups = new Map();
    const order = [];
    for (const url of images) {
      if (typeof url !== 'string' || !url) continue;
      const key = _imageBasename(url);
      if (!groups.has(key)) {
        groups.set(key, url);
        order.push(key);
        continue;
      }
      const current = groups.get(key);
      if (_imageWidthScore(url) > _imageWidthScore(current)) {
        groups.set(key, url);
      }
    }
    return order.map((k) => groups.get(k)).filter(Boolean);
  };

  window.DataScraperProductFormatter = {
    /**
     * Format product detail theo cấu trúc nhóm (database-friendly)
     * @param {Object} data - Raw product data (flat structure)
     * @returns {Object} - Grouped product structure
     */
    formatProductDetail: (data) => {
      if (!data || typeof data !== 'object') return null;
      const basicInfo = {
        name: data.basicInfo?.name || data.name || '',
        sku: data.basicInfo?.sku || data.sku || '',
        brand: data.basicInfo?.brand || data.brand || '',
        webName: data.basicInfo?.webName || data.webName || data.name || '',
        slug: data.basicInfo?.slug || data.slug || ''
      };

      let priceDisplay = data.pricing?.priceDisplay || data.priceDisplay || data.price || '';
      if (!priceDisplay || priceDisplay.trim() === '') {
        priceDisplay = 'CONSULT';
      }

      const resolvedPackageSize = data.pricing?.packageSize || data.packageSize || '';
      const resolvedPackageOptions = Array.isArray(data.pricing?.packageOptions)
        ? data.pricing.packageOptions
        : (Array.isArray(data.packageOptions) ? data.packageOptions : []);
      const resolvedSaleUnitsRaw = Array.isArray(data.pricing?.saleUnits) && data.pricing.saleUnits.length > 0
        ? data.pricing.saleUnits
        : _buildSaleUnits(resolvedPackageOptions, resolvedPackageSize);
      const resolvedSaleUnits = _normalizeSaleUnitsOrder(resolvedSaleUnitsRaw);

      // Slim pricing block — see plans/[UnDone] csv-importer-fields-cleanup.plan.md §2A.
      // Dropped 2026-05-09 (no consumer): price, currentPrice, originalPrice,
      // originalPriceValue, discount, discountPercent, prices.
      // Kept:
      //   - priceDisplay, priceValue → canonical importer (Product.list_price).
      //   - currentPriceValue       → internal filter pipeline (filter-analyzer.js,
      //                                generate-dynamic-filters.js read this CSV col).
      //   - packageSize, packageOptions, saleUnits → variant import + display.
      const pricing = {
        priceDisplay: priceDisplay,
        priceValue: data.pricing?.priceValue !== undefined ? data.pricing.priceValue : (data.priceValue || data.currentPriceValue || 0),
        currentPriceValue: data.pricing?.currentPriceValue !== undefined ? data.pricing.currentPriceValue : (data.currentPriceValue || data.priceValue || 0),
        packageSize: resolvedPackageSize,
        packageOptions: resolvedPackageOptions,
        saleUnits: resolvedSaleUnits
      };

      const category = {
        category: Array.isArray(data.category?.category) ? data.category.category : (Array.isArray(data.category) ? data.category : []),
        categorySlug: data.category?.categorySlug || data.categorySlug || ''
      };

      const rawImages = Array.isArray(data.media?.images)
        ? data.media.images
        : (Array.isArray(data.images) ? data.images : (data.image ? [data.image] : []));
      const dedupedImages = _dedupeImages(rawImages);
      const primaryImage = data.media?.image || data.image || dedupedImages[0] || '';

      const media = {
        image: primaryImage,
        images: dedupedImages
      };

      const content = {
        description: data.content?.description || data.description || '',
        ingredients: data.content?.ingredients || data.ingredients || '',
        usage: data.content?.usage || data.usage || '',
        dosage: data.content?.dosage || data.dosage || '',
        adverseEffect: data.content?.adverseEffect || data.adverseEffect || '',
        careful: data.content?.careful || data.careful || '',
        preservation: data.content?.preservation || data.preservation || ''
      };

      const specifications = {
        registrationNumber: data.specifications?.registrationNumber || data.registrationNumber || '',
        origin: data.specifications?.origin || data.origin || '',
        manufacturer: data.specifications?.manufacturer || data.manufacturer || '',
        shelfLife: data.specifications?.shelfLife || data.shelfLife || '',
        specifications: data.specifications?.specifications || data.specifications || {}
      };

      const metadata = {
        productRanking: data.metadata?.productRanking !== undefined ? data.metadata.productRanking : (data.productRanking || 0),
        isPublish: data.metadata?.isPublish !== undefined ? data.metadata.isPublish : (data.isPublish !== undefined ? data.isPublish : true)
      };

      return {
        basicInfo,
        pricing,
        category,
        media,
        content,
        specifications,
        metadata
      };
    },

    /**
     * Flatten grouped structure về flat structure (backward compatibility)
     * @param {Object} groupedData - Grouped product structure
     * @returns {Object} - Flat product structure
     */
    flattenProductDetail: (groupedData) => {
      if (!groupedData || typeof groupedData !== 'object') return null;

      let priceDisplay = groupedData.pricing?.priceDisplay || '';
      if (!priceDisplay || priceDisplay.trim() === '') {
        priceDisplay = 'CONSULT';
      }

      return {
        name: groupedData.basicInfo?.name || '',
        sku: groupedData.basicInfo?.sku || '',
        brand: groupedData.basicInfo?.brand || '',
        webName: groupedData.basicInfo?.webName || '',
        slug: groupedData.basicInfo?.slug || '',
        // Slim pricing — see formatProductDetail() block. `price`, `prices`, and
        // all `rating.*` fields dropped 2026-05-09 (no CSV consumer).
        priceDisplay: priceDisplay,
        priceValue: groupedData.pricing?.priceValue || 0,
        packageSize: groupedData.pricing?.packageSize || '',
        category: groupedData.category?.category || [],
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
        productRanking: groupedData.metadata?.productRanking || 0,
        isPublish: groupedData.metadata?.isPublish !== undefined ? groupedData.metadata.isPublish : true
      };
    }
  };
})();

