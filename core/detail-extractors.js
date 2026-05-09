(() => {
  'use strict';

  // ============================================
  // 🔧 DETAIL EXTRACTORS (Helper Functions)
  // ============================================
  // Helper functions for product detail extraction
  // Extracted from content.js for better organization

  /**
   * Reject obviously-bad brand candidates that came from misfired selectors.
   * Long Châu DOM has many `div.font-medium` nodes; without this guard the
   * extractor used to leak gallery overlays like "Xem thêm 4 ảnh" into
   * `basicInfo.brand`, which then created junk `Brand` rows on import.
   */
  const _isValidBrand = (text) => {
    if (!text || typeof text !== 'string') return false;
    const t = text.trim();
    if (t.length < 2 || t.length > 80) return false;
    // Gallery / UI noise observed on Long Châu detail pages.
    if (/^Xem\s+thêm/i.test(t)) return false;
    if (/^Sao\s+chép/i.test(t)) return false;
    if (/^Tra\s+cứu/i.test(t)) return false;
    if (/^\d+\s*ảnh$/i.test(t)) return false;
    // Pure number (e.g. accidental price/sku capture).
    if (/^\d+([.,]\d+)?$/.test(t)) return false;
    // Currency / quantity patterns.
    if (/^\d{1,3}([.,]\d{3})*\s*[₫đ]/i.test(t)) return false;
    return true;
  };

  window.DataScraperDetailExtractors = {
    /**
     * Extract price information from container
     */
    extractPriceInfo: (container, Utils) => {
      let currentPrice = '';
      let currentPriceValue = 0;
      let originalPrice = '';
      let originalPriceValue = 0;
      let discount = 0;
      let discountPercent = 0;
      
      // Tìm current price (giá hiện tại - giá discount)
      const priceEl = Utils.safeQuery('[data-test="price"]', container) ||
                     Utils.safeQuery('span[class*="font-semibold"], span[class*="font-bold"], span[class*="text-heading"], span[class*="text-title"]', container);
      
      if (priceEl) {
        const priceText = Utils.getText(priceEl).trim();
        // Chỉ lấy nếu có pattern giá (số + đ/₫), không phải text như "tư vấn"
        const isConsultProduct = priceText && (
          priceText.toLowerCase().includes('tư vấn') ||
          priceText.toLowerCase().includes('consult') ||
          priceText.toLowerCase().includes('liên hệ') ||
          priceText.toLowerCase().includes('cần tư vấn')
        );
        
        if (!isConsultProduct) {
          const priceMatch = priceText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*([₫đ])/);
          if (priceMatch) {
            currentPrice = priceText;
            const numStr = priceMatch[1].replace(/[.,]/g, '');
            currentPriceValue = parseInt(numStr, 10) || 0;
          }
        }
      }
      
      // Tìm original price (giá gốc - có line-through)
      const originalPriceEl = Utils.safeQuery('p[class*="line-through"], span[class*="line-through"], div[class*="line-through"]', container) ||
                             Utils.safeQuery('p.text-gray-7, span.text-gray-7', container);
      
      if (originalPriceEl) {
        const originalPriceText = Utils.getText(originalPriceEl).trim();
        const originalPriceMatch = originalPriceText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*([₫đ])/);
        if (originalPriceMatch) {
          originalPrice = originalPriceText;
          const numStr = originalPriceMatch[1].replace(/[.,]/g, '');
          originalPriceValue = parseInt(numStr, 10) || 0;
          
          // Tính discount nếu có cả currentPrice và originalPrice
          if (currentPriceValue > 0 && originalPriceValue > 0 && originalPriceValue > currentPriceValue) {
            discount = originalPriceValue - currentPriceValue;
            discountPercent = Math.round((discount / originalPriceValue) * 100);
          }
        }
      }
      
      // Nếu không tìm thấy original price từ line-through, thử tìm trong cùng container với price
      if (!originalPrice && priceEl) {
        const priceParent = priceEl.parentElement;
        if (priceParent) {
          const siblings = Array.from(priceParent.children);
          for (const sibling of siblings) {
            if (sibling !== priceEl && (sibling.classList.contains('line-through') || 
                sibling.classList.contains('text-gray-7'))) {
              const siblingText = Utils.getText(sibling).trim();
              const siblingMatch = siblingText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*([₫đ])/);
              if (siblingMatch) {
                originalPrice = siblingText;
                const numStr = siblingMatch[1].replace(/[.,]/g, '');
                originalPriceValue = parseInt(numStr, 10) || 0;
                
                if (currentPriceValue > 0 && originalPriceValue > 0 && originalPriceValue > currentPriceValue) {
                  discount = originalPriceValue - currentPriceValue;
                  discountPercent = Math.round((discount / originalPriceValue) * 100);
                }
                break;
              }
            }
          }
        }
      }
      
      return {
        currentPrice,
        currentPriceValue,
        originalPrice,
        originalPriceValue,
        discount,
        discountPercent
      };
    },

    /**
     * Normalize unit code
     */
    normalizeUnitCode: (unitName) => {
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
    },

    /**
     * Extract a spec-row value by matching the row's label, scoped to Long Châu's
     * 2026 product-detail layout where each spec row is shaped like:
     *
     *   <div class="flex umd:flex-col umd:gap-0.5">
     *     <span|p|div>Hạn sử dụng</span|p|div>            <!-- label -->
     *     <div class="flex-1 !max-w-full">                <!-- value column -->
     *       <div class="posts-detail_posts-detail-container__...">
     *         <div data-theme-element="article">VALUE</div>
     *       </div>
     *     </div>
     *   </div>
     *
     * Strategy: iterate `[data-theme-element="article"]` LEAVES (Long Châu's
     * stable value marker) and walk up the parent chain to find the smallest
     * ancestor whose text matches the label pattern, bounded by
     * `MAX_ROW_TEXT_LEN` so we don't match high-up section containers that
     * happen to mention the label elsewhere (e.g. inside description content).
     *
     * Why structure-based instead of class-based:
     * - Earlier attempts anchored on `div[class*="flex-1"][class*="max-w-full"]`
     *   (the value column) but observed empty `shelfLife` even when sibling rows
     *   like `registrationNumber` succeeded. Long Châu's Tailwind variants for
     *   responsive prefixes (`omd:flex-1`, `!flex-1`, etc.) and CSS Modules
     *   build hashes drift per row/section, so substring class matching is
     *   unreliable across rows.
     * - `[data-theme-element="article"]` is set explicitly by Long Châu on every
     *   spec value leaf and is the same across product types — much more stable.
     */
    extractSpecRowValueByLabel: (labelPattern, container, Utils) => {
      if (!labelPattern) return '';
      const MAX_WALK_UP_DEPTH = 10;
      // A spec-row label is a short text node (e.g. "Hạn sử dụng",
      // "Số đăng ký", "Xuất xứ thương hiệu"). Anything longer is a row body
      // or a section concatenation; we don't want to mistake those for labels.
      const MAX_LABEL_CELL_LEN = 60;

      const _searchIn = (root) => {
        if (!root) return '';
        const articles = Utils.safeQueryAll('[data-theme-element="article"]', root);
        for (const article of articles) {
          const valueText = Utils.getText(article).trim();
          if (!valueText) continue;
          // Skip articles that ARE the label itself (Long Châu sometimes marks
          // labels with the same `data-theme-element` attribute).
          if (labelPattern.test(valueText)) continue;

          // Walk up: the spec row is the smallest ancestor that has at least
          // one DIRECT child whose own text is short (i.e. a label cell) and
          // matches `labelPattern`. This is robust to:
          //   - rows that hold multiple `[data-theme-element="article"]`
          //     siblings (e.g. "Số đăng ký" row containing both the value and
          //     the "Xem giấy công bố sản phẩm" link).
          //   - section/page-level ancestors whose concatenated text happens
          //     to include the label, because such ancestors only have row
          //     children whose text is much longer than `MAX_LABEL_CELL_LEN`.
          let node = article.parentElement;
          let depth = 0;
          while (node && depth < MAX_WALK_UP_DEPTH) {
            const children = node.children ? Array.from(node.children) : [];
            // Long Châu's spec row always renders the label as the FIRST child
            // and the value column after it. Checking only the first child
            // (rather than any child) is what stops us from false-matching at
            // the block / section level — at those levels the first child is
            // a sibling row whose text concatenates BOTH a label and a value,
            // which fails the strict "≤ MAX_LABEL_CELL_LEN AND not value text"
            // checks below. (See test fixtures in
            // plans/[UnDone] csv-importer-fields-cleanup.plan.md §X4 history.)
            const firstChild = children[0];
            if (firstChild) {
              const firstText = Utils.getText(firstChild).trim();
              if (firstText && firstText.length <= MAX_LABEL_CELL_LEN &&
                  firstText !== valueText && !firstText.includes(valueText) &&
                  labelPattern.test(firstText)) {
                return valueText.replace(/\s*Sao\s+chép.*/i, '').trim();
              }
            }
            node = node.parentElement;
            depth++;
          }
        }
        return '';
      };
      // Try the caller-provided scope first (cheaper, fewer false positives),
      // then fall back to `document.body`. The "Thông tin sản phẩm" tab on
      // Long Châu's 2026 layout often lives outside the
      // `[data-lcpr="prr-id-product-detail-product-information"]` sub-tree
      // that the detail scraper hands in as `detailContainer`.
      return _searchIn(container) || _searchIn(typeof document !== 'undefined' ? document.body : null);
    },

    /**
     * Extract value from row with specific label
     */
    extractSpecValue: (labelPattern, container, Utils) => {
      const specRows = Utils.safeQueryAll('div[class*="flex"], tr, div[class*="detail-item"]', container);
      
      for (const row of specRows) {
        const rowText = Utils.getText(row).trim();
        // Kiểm tra nếu row chứa label
        if (labelPattern.test(rowText)) {
          // Strategy 1: Tìm label element (p với class text-gray-7) trước
          const labelEl = Utils.safeQuery('p[class*="text-gray-7"], p[class*="text-body"], div[class*="text-gray-7"]', row);
          
          if (labelEl && labelPattern.test(Utils.getText(labelEl).trim())) {
            // Tìm element [data-theme-element="article"] trong cùng row, nhưng không phải là label
            const allArticleEls = Utils.safeQueryAll('[data-theme-element="article"]', row);
            for (const articleEl of allArticleEls) {
              const articleText = Utils.getText(articleEl).trim();
              // Đảm bảo không phải là label và có nội dung
              if (articleText && !labelPattern.test(articleText) && articleText !== Utils.getText(labelEl).trim()) {
                // Loại bỏ các text không cần thiết như "Sao chép"
                const cleanedText = articleText.replace(/\s*Sao\s+chép.*/i, '').trim();
                if (cleanedText) {
                  return cleanedText;
                }
              }
            }
            
            // Strategy 2: Tìm div có class text-gray-10 và text-body trong cùng row với label
            const valueDivs = Utils.safeQueryAll('div', row);
            for (const div of valueDivs) {
              const divClass = div.className || '';
              const divText = Utils.getText(div).trim();
              
              // Kiểm tra nếu div có class text-gray-10 và text-body và không phải là label
              if ((divClass.includes('text-gray-10') && (divClass.includes('text-body') || divClass.includes('text-body1') || divClass.includes('text-body2'))) &&
                  divText && !labelPattern.test(divText) && divText !== Utils.getText(labelEl).trim()) {
                // Loại bỏ các text không cần thiết
                const cleanedText = divText.replace(/\s*Sao\s+chép.*/i, '').trim();
                if (cleanedText) {
                  return cleanedText;
                }
              }
            }
          } else {
            // Strategy 3: Nếu không tìm thấy label element, tìm trực tiếp [data-theme-element="article"] trong row
            const allArticleEls = Utils.safeQueryAll('[data-theme-element="article"]', row);
            for (const articleEl of allArticleEls) {
              const articleText = Utils.getText(articleEl).trim();
              if (articleText && !labelPattern.test(articleText)) {
                const cleanedText = articleText.replace(/\s*Sao\s+chép.*/i, '').trim();
                if (cleanedText) {
                  return cleanedText;
                }
              }
            }
          }
          
          // Strategy 4: Nếu vẫn chưa tìm thấy, lấy text sau label trong cùng row
          const parts = rowText.split(labelPattern);
          if (parts.length > 1) {
            const valuePart = parts[1].trim().split(/\n/)[0].trim();
            if (valuePart && !labelPattern.test(valuePart)) {
              const cleanedText = valuePart.replace(/\s*Sao\s+chép.*/i, '').trim();
              if (cleanedText) {
                return cleanedText;
              }
            }
          }
        }
      }
      
      return '';
    },

    /**
     * Find section by class name or heading text
     */
    findSectionByClassOrHeading: (className, headingPattern, defaultId, Utils) => {
      // Ưu tiên 1: Tìm theo class name
      const sectionByClass = Utils.safeQuery(`.${className}, [class*="${className}"]`);
      if (sectionByClass) {
        // Đảm bảo class name đúng (không phải class khác chứa className)
        const sectionClass = sectionByClass.className || '';
        if (sectionClass.includes(className) || sectionClass === className) {
          return sectionByClass.id || null;
        }
      }
      
      // Ưu tiên 2: Tìm theo heading text
      const allSections = Utils.safeQueryAll('[id^="detail-content-"]');
      for (const sec of allSections) {
        const heading = Utils.safeQuery('h2, h3, h4', sec);
        if (heading) {
          const headingText = Utils.getText(heading);
          if (headingPattern && headingPattern.test(headingText)) {
            return sec.id;
          }
        }
      }
      
      // KHÔNG dùng defaultId - return null nếu không tìm thấy
      return null;
    },

    /**
     * Extract basic info (name, sku, brand, slug)
     */
    extractBasicInfo: (container, Utils) => {
      const fullText = Utils.getText(container);
      
      // Extract name
      let name = '';
      const nameSelectors = [
        'h1',
        '[data-test-id="product-name"]',
        '[class*="product-name"]',
        '[class*="product-title"]',
        'div:first-child',
      ];
      for (const sel of nameSelectors) {
        const nameEl = Utils.safeQuery(sel, container);
        if (nameEl) {
          const nameText = Utils.getText(nameEl).trim();
          if (nameText && nameText.length > 10 && !nameText.match(/^\d+$/) && !nameText.includes('đánh giá')) {
            name = nameText.split('\n')[0].trim();
            break;
          }
        }
      }
      // Fallback: tìm div có text dài nhất không chứa button/price
      if (!name) {
        const allDivs = Utils.safeQueryAll('div', container);
        for (const div of allDivs) {
          const divText = Utils.getText(div).trim();
          if (divText.length > 20 && divText.length < 200 && 
              !divText.includes('Chọn') && !divText.includes('đánh giá') &&
              !divText.match(/^\d+[.,]?\d*\s*[₫đ]/)) {
            name = divText.split('\n')[0].trim();
            break;
          }
        }
      }
      
      // Extract SKU
      let sku = '';
      const skuEl = Utils.safeQuery('[data-test-id="sku"]', container);
      if (skuEl) {
        sku = Utils.getText(skuEl).trim();
      } else {
        const skuMatch = fullText.match(/\b\d{6,8}\b/);
        if (skuMatch) {
          sku = skuMatch[0];
        } else {
          sku = Utils.getText(Utils.safeQuery('[class*="sku"], [class*="code"]', container));
        }
      }
      
      // Extract brand
      // Strategy 1 (primary): brand is rendered as a hyperlink to the brand
      // listing page, e.g. <a href="/thuong-hieu/hlh-biopharma">HLH BIOPHARMA</a>.
      // This is the most reliable anchor on Long Châu detail pages.
      let brand = '';
      const brandLink = Utils.safeQuery('a[href*="/thuong-hieu/"], a[href*="thuong-hieu"]', container);
      if (brandLink) {
        const linkText = Utils.getText(brandLink).trim();
        if (_isValidBrand(linkText)) {
          brand = linkText;
        }
      }

      // Strategy 2: fall back to text after the "Thương hiệu" label in fullText.
      if (!brand) {
        const labelMatch = fullText.match(/Thương\s+hiệu[:\s]+([^\n\r]+)/i);
        if (labelMatch) {
          // Take the first sensible token group (avoid trailing labels like
          // "Số đăng ký..." that may be on the same line in some layouts).
          const candidate = labelMatch[1].trim().split(/\s{2,}|\t|\|/)[0].trim();
          if (_isValidBrand(candidate)) {
            brand = candidate;
          }
        }
      }

      // Strategy 3 (last resort): the legacy `div.font-medium` heuristic, but
      // only when its text actually contains the "Thương hiệu" label so we
      // don't capture gallery overlays like "Xem thêm 4 ảnh".
      if (!brand) {
        const brandEl = Utils.safeQuery('div.font-medium', container);
        if (brandEl) {
          const brandText = Utils.getText(brandEl);
          const m = brandText.match(/Thương\s+hiệu[:\s]+([^\n\r]+)/i);
          if (m) {
            const candidate = m[1].trim();
            if (_isValidBrand(candidate)) brand = candidate;
          }
        }
      }
      
      // Extract slug from URL
      const url = window.location.href || '';
      const urlMatch = url.match(/\/([^\/]+)\.html$/);
      const slug = urlMatch ? urlMatch[1] : '';
      
      return { name, sku, brand, slug };
    }
  };
})();
