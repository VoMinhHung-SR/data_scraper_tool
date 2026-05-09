(() => {
  'use strict';

  // ============================================
  // 📦 DETAIL SCRAPER
  // ============================================
  // Product detail scraping (API + DOM fallback)
  window.DataScraperDetailScraper = {
    /**
     * Main function to scrape product detail
     */
    scrapeProductDetail: async (forceAPI = false) => {
      try {
        const Utils = window.DataScraperUtils;
        const domData = await window.DataScraperDetailScraper.scrapeProductDetailFromDOM();
        
        // Accept both flat and grouped detail formats
        const hasFlatFields = domData && (domData.name || domData.sku);
        const hasGroupedFields = domData && domData.basicInfo && (domData.basicInfo.name || domData.basicInfo.sku);

        if (hasFlatFields || hasGroupedFields) {
          return domData;
        }
        
        return null;
      } catch (error) {
        return await window.DataScraperDetailScraper.scrapeProductDetailFromDOM();
      }
    },

    /**
     * Click "Xem tất cả thông tin" (or equivalent) to mount the hidden
     * second-half spec rows (Quy cách, Nhà sản xuất, Nước sản xuất, Hạn sử
     * dụng, …) before extraction.
     *
     * Long Châu's product-detail page renders the spec panel in two
     * `div.space-y-4` blocks. The second block is gated behind an expand
     * button and is not present in the DOM at all until clicked — CSS
     * `display:none` is NOT used, so any selector-based extractor will miss
     * those rows on a fresh page load.
     *
     * The function is best-effort and idempotent:
     * - If no expand button is found (button already triggered, or product
     *   page has fully expanded layout), it returns silently.
     * - After clicking it polls for `[data-theme-element="article"]` count to
     *   grow (React render cycle), bounded by `MAX_WAIT_MS`. The poll grace
     *   period is generous because mobile/slow connections can take a beat to
     *   re-render.
     */
    _revealHiddenSpecSection: async (Utils) => {
      try {
        const EXPAND_LABEL_PATTERN = /Xem\s+tất\s+cả\s+thông\s+tin/i;
        const POLL_INTERVAL_MS = 50;
        const MAX_WAIT_MS = 1500;

        const findButton = () => {
          // Prefer cursor-pointer wrappers (Long Châu's clickable container
          // pattern); fall back to <button>. Match by visible text so we
          // ride out class-name churn between releases.
          const candidates = Utils.safeQueryAll(
            'div[class*="cursor-pointer"], button, [role="button"]'
          );
          for (const el of candidates) {
            const text = Utils.getText(el).trim();
            if (text && EXPAND_LABEL_PATTERN.test(text) && text.length < 80) {
              return el;
            }
          }
          return null;
        };

        const btn = findButton();
        if (!btn) return false;

        const beforeCount = Utils.safeQueryAll('[data-theme-element="article"]').length;
        try { btn.click(); } catch (_) { return false; }

        const start = Date.now();
        while (Date.now() - start < MAX_WAIT_MS) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          const afterCount = Utils.safeQueryAll('[data-theme-element="article"]').length;
          if (afterCount > beforeCount) return true;
        }
        // Click happened but DOM didn't grow within the budget. Fall through
        // — extraction will still run; worst case the field stays empty.
        return true;
      } catch (_) {
        return false;
      }
    },

    /**
     * Scrape product detail from DOM
     */
    scrapeProductDetailFromDOM: async () => {
      try {
        const Utils = window.DataScraperUtils;
        const Extractors = window.DataScraperDetailExtractors;

        // Long Châu's "Thông tin sản phẩm" panel splits its rows across two
        // `div.space-y-4` blocks. The second block (containing fields like
        // `Quy cách`, `Nhà sản xuất`, `Nước sản xuất`, `Hạn sử dụng`) is
        // conditionally rendered by React — it's NOT in the DOM until the
        // user clicks "Xem tất cả thông tin". Trigger that click first so the
        // hidden rows mount before any extractor runs.
        await window.DataScraperDetailScraper._revealHiddenSpecSection(Utils);

        // ============================================
        // 1. INITIALIZE CONTAINER
        // ============================================
        const productInfoContainer = Utils.safeQuery('[data-lcpr="prr-id-product-detail-product-information"]') ||
                                     Utils.safeQuery('[class*="product-detail"]') ||
                                     document.body;
        
        const fullText = Utils.getText(productInfoContainer);
        const detailContainer = Utils.safeQuery('[class*="product-detail-container"], [class*="po.t.-detail"]', productInfoContainer) || productInfoContainer;
        
        // ============================================
        // 2. EXTRACT BASIC INFO (name, sku, brand, slug)
        // ============================================
        const basicInfo = Extractors.extractBasicInfo(productInfoContainer, Utils);
        let name = basicInfo.name;
        let sku = basicInfo.sku;
        let brand = basicInfo.brand;
        const slug = basicInfo.slug;
        
        // ============================================
        // 3. EXTRACT PRICING INFO
        // ============================================
        const priceInfo = Extractors.extractPriceInfo(productInfoContainer, Utils);
        
        // ============================================
        // EXTRACT SPECIFICATIONS (để dùng cho packageSize và các field khác)
        // ============================================
        const specifications = {};
        Utils.safeQueryAll('[class*="spec"] tr, [class*="attribute"] tr, table tr, [class*="info"] tr', productInfoContainer).forEach(row => {
          const cells = Utils.safeQueryAll('td, th', row);
          if (cells.length >= 2) {
            const key = Utils.getText(cells[0]).trim().replace(/[:\s]+$/, '');
            const value = Utils.getText(cells[1]).trim();
            if (key && value && key !== value && !key.includes('Chọn')) {
              specifications[key] = value;
            }
          }
        });
        
        // Extract từ các div có label-value pattern
        Utils.safeQueryAll('[class*="info-item"], [class*="detail-item"]', productInfoContainer).forEach(item => {
          const label = Utils.getText(Utils.safeQuery('[class*="label"], [class*="title"]', item));
          const value = Utils.getText(Utils.safeQuery('[class*="value"], [class*="content"]', item));
          if (label && value && !label.includes('Chọn')) {
            specifications[label] = value;
          }
        });
      let price = priceInfo.currentPrice || '';
      
      // Nếu không có giá, set thành rỗng (sẽ được format thành CONSULT sau)
      if (!price || price.trim() === '') {
        price = '';
      }
      
      // ============================================
      // 4. EXTRACT PACKAGE SIZE
      // ============================================
      let packageSize = '';
      
      // Tìm tất cả các row/div có thể chứa specifications (ưu tiên div.flex)
      const specRows = Utils.safeQueryAll('div[class*="flex"], tr, div[class*="detail-item"], div[class*="spec"]', detailContainer);
      
      for (const row of specRows) {
        const rowText = Utils.getText(row).trim();
        // Kiểm tra nếu row chứa label "Quy cách"
        if (/Quy\s+cách/i.test(rowText)) {
          // Tìm element [data-theme-element="article"] trong row này (element ngang hàng)
          // Đây là element chứa giá trị "Hộp 20 ống"
          const articleEl = Utils.safeQuery('[data-theme-element="article"]', row);
          if (articleEl) {
            const articleText = Utils.getText(articleEl).trim();
            // Kiểm tra nếu text có pattern package (Hộp, Gói, Vỉ, etc.) kèm số
            if (/^(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp|Tuyp|Miếng|Thùng|Lốc|Lọ|Bình|Túi|Hũ)\s+.*\d+/i.test(articleText)) {
              packageSize = articleText;
              break;
            }
          }
          
          // Nếu không tìm thấy article element, tìm div có class text-gray-10 và text-body trong row
          // (element ngang hàng với label "Quy cách")
          if (!packageSize) {
            // Tìm tất cả div trong row có class chứa text-gray-10 và text-body
            const valueDivs = Utils.safeQueryAll('div', row);
            for (const div of valueDivs) {
              const divClass = div.className || '';
              const divText = Utils.getText(div).trim();
              
              // Kiểm tra nếu div có class text-gray-10 và text-body (hoặc text-body1, text-body2)
              // và text có pattern package kèm số, và không phải là label "Quy cách"
              if ((divClass.includes('text-gray-10') && (divClass.includes('text-body') || divClass.includes('text-body1') || divClass.includes('text-body2'))) &&
                  /^(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp|Tuyp|Miếng|Thùng|Lốc|Lọ|Bình|Túi|Hũ)\s+.*\d+/i.test(divText) &&
                  !/Quy\s+cách/i.test(divText)) {
                packageSize = divText;
                break;
              }
            }
          }
          
          // Nếu vẫn chưa tìm thấy, tìm div có class text-gray-10 hoặc text-body trong row
          if (!packageSize) {
            const valueDivs = Utils.safeQueryAll('div[class*="text-gray-10"], div[class*="text-body"]', row);
            for (const div of valueDivs) {
              const divText = Utils.getText(div).trim();
              // Kiểm tra nếu text có pattern package kèm số và không phải là label
              if (/^(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp|Tuyp|Miếng|Thùng|Lốc|Lọ|Bình|Túi|Hũ)\s+.*\d+/i.test(divText) && !/Quy\s+cách/i.test(divText)) {
                packageSize = divText;
                break;
              }
            }
          }
          
          // Nếu vẫn chưa tìm thấy, lấy text sau "Quy cách" trong cùng row
          if (!packageSize) {
            const parts = rowText.split(/Quy\s+cách/i);
            if (parts.length > 1) {
              const valuePart = parts[1].trim().split(/\n/)[0].trim();
              if (/^(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp|Tuyp|Miếng|Thùng|Lốc|Lọ|Bình|Túi|Hũ)\s+.*\d+/i.test(valuePart)) {
                packageSize = valuePart;
              }
            }
          }
          
          if (packageSize) break;
        }
      }
      
      // Strategy 1b: Nếu không tìm thấy trong table, tìm element [data-theme-element="article"] 
      // trong product detail container với context đúng (có class text-gray-10, text-body)
      if (!packageSize && detailContainer) {
        // Tìm tất cả element [data-theme-element="article"] trong detail container
        const articleEls = Utils.safeQueryAll('[data-theme-element="article"]', detailContainer);
        for (const articleEl of articleEls) {
          const articleText = Utils.getText(articleEl).trim();
          // Kiểm tra nếu text có pattern package (Hộp, Gói, Vỉ, etc.) kèm số
          if (/^(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp|Tuyp|Miếng|Thùng|Lốc|Lọ|Bình|Túi|Hũ)\s+.*\d+/i.test(articleText)) {
            // Kiểm tra xem element có nằm trong context đúng không
            // Tìm parent có class chứa text-gray-10 và text-body
            let current = articleEl.parentElement;
            let found = false;
            let depth = 0;
            while (current && depth < 5) {
              const parentClass = current.className || '';
              // Kiểm tra nếu parent có class text-gray-10 và text-body (hoặc text-body1, text-body2)
              if ((parentClass.includes('text-gray-10') && parentClass.includes('text-body')) ||
                  (parentClass.includes('product-detail-container') || parentClass.includes('po.t.-detail'))) {
                // Kiểm tra xem có nằm gần label "Quy cách" không
                const parentText = Utils.getText(current).trim();
                if (/Quy\s+cách/i.test(parentText)) {
                  found = true;
                  break;
                }
              }
              current = current.parentElement;
              depth++;
            }
            
            if (found) {
              packageSize = articleText;
              break;
            }
          }
        }
      }
      
      // Strategy 2: Tìm từ data-test="unit"
      if (!packageSize) {
        const unitEl = Utils.safeQuery('[data-test="unit"]', productInfoContainer);
        if (unitEl) {
          packageSize = Utils.getText(unitEl).trim();
        }
      }
      
      // Strategy 3: Tìm element có class text-gray-10 text-body2 (packageSize trong CONSULT case)
      if (!packageSize) {
        const allDivs = Utils.safeQueryAll('div', productInfoContainer);
        let packageSizeEl = null;
        for (const div of allDivs) {
          const classList = div.className || '';
          if (classList.includes('text-gray-10') && classList.includes('text-body2')) {
            const text = Utils.getText(div).trim();
            // Kiểm tra nếu text bắt đầu bằng pattern package (Hộp, Gói, Vỉ, etc.)
            if (/^(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp|Tuyp|Miếng|Thùng|Lốc|Lọ|Bình|Túi|Hũ)\s*(x\s*)?\d+/i.test(text)) {
              packageSizeEl = div;
              break;
            }
          }
        }
        
        if (packageSizeEl) {
          const packageText = Utils.getText(packageSizeEl).trim();
          // Lấy toàn bộ text nếu có số (ví dụ: "Hộp 20 ống"), nếu không chỉ lấy đơn vị
          if (/\d/.test(packageText)) {
            packageSize = packageText;
          } else {
            const unitMatch = packageText.match(/^(Hộp|Chai|Tuýp|Tuyp|Miếng|Gói|Vỉ|Ống|Viên|ml|g|Thùng|Lốc|Lọ|Bình|Túi|Hũ)/i);
            if (unitMatch) {
              packageSize = unitMatch[1];
            } else {
              packageSize = packageText;
            }
          }
        }
      }
      
      // Strategy 4: Tìm từ specifications table (Quy cách)
      if (!packageSize) {
        if (specifications['Quy cách']) {
          packageSize = specifications['Quy cách'].trim();
        }
      }
      
      // Strategy 5: Fallback - tìm từ fullText bằng regex
      if (!packageSize) {
        const packageMatch = fullText.match(/(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp|Tuyp|Miếng|Thùng|Lốc|Lọ|Bình|Túi|Hũ)\s+(\d+)\s*(ống|viên|vỉ|gói|ml|g|chai|tuýp|tuyp|miếng|thùng|lốc|lọ|bình|túi|hũ)/i);
        if (packageMatch) {
          packageSize = packageMatch[0].trim();
        } else {
          const simpleMatch = fullText.match(/(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp|Tuyp|Miếng|Thùng|Lốc|Lọ|Bình|Túi|Hũ)\s*(x\s*)?\d+[^\s]*/i);
          if (simpleMatch) {
            packageSize = simpleMatch[0].trim();
          }
        }
      }
      
      // ============================================
      // 5. EXTRACT PACKAGE OPTIONS (VARIANTS)
      // ============================================
        // Helper: Extract giá cho variant (fallback method)
        const extractPriceForVariant = (variantDiv, container) => {
          let variantPrice = '';
          let variantPriceValue = 0;

          // Tìm giá trong parent container
          const parent = variantDiv.parentElement;
          if (parent) {
            const priceSelectors = [
              'span[class*="font-semibold"]',
              'span[class*="font-bold"]',
              '[data-test="price"]'
            ];

            for (const selector of priceSelectors) {
              const priceEl = Utils.safeQuery(selector, parent);
              if (priceEl) {
                const priceText = Utils.getText(priceEl).trim();
                
                // Kiểm tra xem có phải là sản phẩm cần tư vấn không
                const isConsultProduct = priceText && (
                  priceText.toLowerCase().includes('tư vấn') ||
                  priceText.toLowerCase().includes('consult') ||
                  priceText.toLowerCase().includes('liên hệ') ||
                  priceText.toLowerCase().includes('cần tư vấn')
                );
                
                if (!isConsultProduct) {
                  const priceMatch = priceText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*([₫đ])/);
                  if (priceMatch) {
                    variantPrice = priceText;
                    const numStr = priceMatch[1].replace(/[.,]/g, '');
                    variantPriceValue = parseInt(numStr, 10) || 0;
                    break;
                  }
                }
              }
            }
          }

          const priceDisplay = variantPrice || (variantPriceValue > 0 ? `${variantPriceValue.toLocaleString('vi-VN')}₫` : 'CONSULT');

          return {
            price: variantPrice,
            priceDisplay: priceDisplay,
            priceValue: variantPriceValue
          };
        };
        
        // Tìm tất cả các variant options và giá tương ứng bằng cách click vào từng variant
        const extractPackageOptionsFromDOM = async (container) => {
          const packageOptions = [];
          
          // Tìm container chứa các variant options
          const variantContainer = Utils.safeQuery('[data-lcpr="prr-id-product-detail-product-information"]', container) ||
                                   Utils.safeQuery('[class*="product-detail"]', container) ||
                                   container;
          
          // Tìm tất cả variant buttons
          // Ưu tiên tìm bằng data-test="unit_lv1" (theo DOM path user cung cấp)
          const variantButtons = [];
          // Dedupe responsive (mobile/desktop) duplicates: Long Châu render 2 nhóm
          // qua Tailwind `umd:` / `omd:` prefix. offsetParent đôi khi không lọc hết
          // → chốt theo unit code đã normalize.
          const seenUnitCodes = new Set();
        
        // Strategy 1: Tìm bằng data-test="unit_lv1"
        const unitButtons = Utils.safeQueryAll('[data-test="unit_lv1"], [data-test*="unit"]', variantContainer);
        for (const btn of unitButtons) {
          const btnText = Utils.getText(btn).trim();
          if (/^(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp|Tuyp|Miếng|Thùng|Lốc|Lọ|Bình|Túi|Hũ|Hộp\s+Ống)$/i.test(btnText)) {
            if (btn.offsetParent !== null && !btn.disabled) {
              const unitCode = Extractors.normalizeUnitCode(btnText);
              if (seenUnitCodes.has(unitCode)) continue;
              seenUnitCodes.add(unitCode);
              variantButtons.push({
                element: btn,
                text: btnText,
                isSelected: btn.classList.contains('bg-blue') || 
                           btn.classList.contains('selected') ||
                           btn.getAttribute('aria-selected') === 'true' ||
                           btn.getAttribute('data-test')?.includes('selected') ||
                           btn.style.backgroundColor.includes('blue')
              });
            }
          }
        }
        
        // Strategy 2: Nếu không tìm thấy, tìm bằng class và text
        if (variantButtons.length === 0) {
          const allButtons = Utils.safeQueryAll('button, div[role="button"], div[class*="cursor-pointer"], div[class*="inline-flex"]', variantContainer);
          
          for (const btn of allButtons) {
            const btnText = Utils.getText(btn).trim();
            // Kiểm tra nếu text là variant option (Hộp, Gói, Vỉ, Ống, Viên, ml, g, Chai, Tuýp, Tuyp, Miếng, Thùng, Lốc, Lọ, Bình, Túi, Hũ, Hộp Ống)
            if (/^(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp|Tuyp|Miếng|Thùng|Lốc|Lọ|Bình|Túi|Hũ|Hộp\s+Ống)$/i.test(btnText)) {
              // Kiểm tra xem button có thể click được không
              if (btn.offsetParent !== null && !btn.disabled) {
                const unitCode = Extractors.normalizeUnitCode(btnText);
                if (seenUnitCodes.has(unitCode)) continue;
                seenUnitCodes.add(unitCode);
                variantButtons.push({
                  element: btn,
                  text: btnText,
                  isSelected: btn.classList.contains('bg-blue') || 
                             btn.classList.contains('selected') ||
                             btn.getAttribute('aria-selected') === 'true' ||
                             btn.style.backgroundColor.includes('blue')
                });
              }
            }
          }
        }
        
        // Nếu không tìm thấy buttons, fallback về cách cũ (tìm div có class text-body2 text-gray-10)
        if (variantButtons.length === 0) {
          const variantDivs = Utils.safeQueryAll('div', variantContainer);
          const processedVariants = new Set();
          
          for (const div of variantDivs) {
            const classList = div.className || '';
            if (classList.includes('text-body2') && classList.includes('text-gray-10')) {
              const variantText = Utils.getText(div).trim();
              if (/^(Hộp|Gói|Vỉ|Ống|Viên|ml|g|Chai|Tuýp|Tuyp|Miếng|Thùng|Lốc|Lọ|Bình|Túi|Hũ|Hộp\s+Ống)/i.test(variantText)) {
                if (processedVariants.has(variantText)) continue;
                processedVariants.add(variantText);
                
                // Tìm giá từ DOM (fallback method)
                const variantPrice = extractPriceForVariant(div, container);
                
                const unitName = variantText.trim();
                const unitCode = Extractors.normalizeUnitCode(unitName);
                
                packageOptions.push({
                  unit: unitCode,
                  unitDisplay: unitName,
                  price: variantPrice.price || '',
                  priceDisplay: variantPrice.priceDisplay || 'CONSULT',
                  priceValue: variantPrice.priceValue || 0,
                  specification: packageSize || '',
                  isDefault: packageOptions.length === 0,
                  isAvailable: true,
                  conversion: null
                });
              }
            }
          }
          
          return packageOptions;
        }
        
        // Tìm price element để theo dõi thay đổi
        // Tìm trong cùng container với variant buttons để đảm bảo đúng element
        const variantParent = variantButtons.length > 0 ? variantButtons[0].element.closest('[class*="flex"], [class*="container"]') : null;
        const searchContainer = variantParent || container;
        
        // Tìm price element - ưu tiên data-test="price", sau đó tìm trong cùng container với variant
        let priceElement = Utils.safeQuery('[data-test="price"]', searchContainer) ||
                          Utils.safeQuery('[data-test="price"]', container);
        
        // Nếu không tìm thấy, tìm span có font-semibold/bold gần variant buttons
        if (!priceElement && variantButtons.length > 0) {
          const variantContainer = variantButtons[0].element.closest('div[class*="flex"]');
          if (variantContainer) {
            priceElement = Utils.safeQuery('span[class*="font-semibold"], span[class*="font-bold"], span[class*="text-heading"], span[class*="text-title"]', variantContainer);
          }
        }
        
        // Fallback: tìm trong toàn bộ container
        if (!priceElement) {
          priceElement = Utils.safeQuery('span[class*="font-semibold"], span[class*="font-bold"]', container);
        }
        
        // Tìm unit element - ưu tiên data-test="unit"
        let unitElement = Utils.safeQuery('[data-test="unit"]', searchContainer) ||
                         Utils.safeQuery('[data-test="unit"]', container);
        
        // Nếu không tìm thấy, tìm gần price element
        if (!unitElement && priceElement) {
          const priceParent = priceElement.parentElement;
          if (priceParent) {
            unitElement = Utils.safeQuery('span[class*="text-title"], span[class*="text-label"], [data-test="unit"]', priceParent);
          }
        }
        
        // Lưu variant mặc định hiện tại
        const defaultVariant = variantButtons.find(v => v.isSelected) || variantButtons[0];
        
        // Helper: Chờ giá cập nhật sau khi click variant
        // Tìm lại price element mỗi lần check để đảm bảo lấy element mới nhất
        const waitForPriceUpdate = (oldPrice, maxWait = 3000) => {
          return new Promise((resolve) => {
            let attempts = 0;
            const checkInterval = setInterval(() => {
              attempts++;
              
              // Tìm lại price và unit element mỗi lần check (DOM có thể đã thay đổi)
              let currentPriceEl = Utils.safeQuery('[data-test="price"]', searchContainer) ||
                                  Utils.safeQuery('[data-test="price"]', container);
              if (!currentPriceEl) {
                const variantContainer = variantButtons.length > 0 ? variantButtons[0].element.closest('div[class*="flex"]') : null;
                if (variantContainer) {
                  currentPriceEl = Utils.safeQuery('span[class*="font-semibold"], span[class*="font-bold"]', variantContainer);
                }
              }
              if (!currentPriceEl) {
                currentPriceEl = Utils.safeQuery('span[class*="font-semibold"], span[class*="font-bold"]', container);
              }
              
              let currentUnitEl = Utils.safeQuery('[data-test="unit"]', searchContainer) ||
                                 Utils.safeQuery('[data-test="unit"]', container);
              if (!currentUnitEl && currentPriceEl) {
                const priceParent = currentPriceEl.parentElement;
                if (priceParent) {
                  currentUnitEl = Utils.safeQuery('span[class*="text-title"], span[class*="text-label"], [data-test="unit"]', priceParent);
                }
              }
              
              const currentPrice = currentPriceEl ? Utils.getText(currentPriceEl).trim() : '';
              const currentUnit = currentUnitEl ? Utils.getText(currentUnitEl).trim() : '';
              
              // Nếu giá đã thay đổi (khác oldPrice) hoặc đã chờ đủ lâu
              if (currentPrice && currentPrice !== oldPrice && currentPrice.match(/\d+[.,]?\d*\s*[₫đ]/)) {
                clearInterval(checkInterval);
                resolve({ price: currentPrice, unit: currentUnit });
              } else if (attempts * 100 >= maxWait) {
                // Timeout - trả về giá hiện tại (có thể vẫn là oldPrice nếu không thay đổi)
                clearInterval(checkInterval);
                resolve({ price: currentPrice || oldPrice, unit: currentUnit });
              }
            }, 100);
          });
        };
        
        // Helper: Extract giá từ price element (tìm lại element mỗi lần để đảm bảo lấy giá mới nhất)
        // Bao gồm cả original price (line-through) để tính discount
        const extractCurrentPrice = () => {
          // Tìm lại price và unit element để đảm bảo lấy giá mới nhất sau khi click
          let currentPriceEl = Utils.safeQuery('[data-test="price"]', searchContainer) ||
                              Utils.safeQuery('[data-test="price"]', container);
          if (!currentPriceEl) {
            const variantContainer = variantButtons.length > 0 ? variantButtons[0].element.closest('div[class*="flex"]') : null;
            if (variantContainer) {
              currentPriceEl = Utils.safeQuery('span[class*="font-semibold"], span[class*="font-bold"], span[class*="text-heading"], span[class*="text-title"]', variantContainer);
            }
          }
          if (!currentPriceEl) {
            currentPriceEl = Utils.safeQuery('span[class*="font-semibold"], span[class*="font-bold"]', container);
          }
          
          let currentUnitEl = Utils.safeQuery('[data-test="unit"]', searchContainer) ||
                             Utils.safeQuery('[data-test="unit"]', container);
          if (!currentUnitEl && currentPriceEl) {
            const priceParent = currentPriceEl.parentElement;
            if (priceParent) {
              currentUnitEl = Utils.safeQuery('span[class*="text-title"], span[class*="text-label"], [data-test="unit"]', priceParent);
            }
          }
          
          const priceText = currentPriceEl ? Utils.getText(currentPriceEl).trim() : '';
          const unitText = currentUnitEl ? Utils.getText(currentUnitEl).trim() : '';
          
          // Kiểm tra xem priceText có phải là giá thực sự không
          // Nếu có text như "tư vấn", "consult", "liên hệ" thì không phải giá
          const isConsultProduct = priceText && (
            priceText.toLowerCase().includes('tư vấn') ||
            priceText.toLowerCase().includes('consult') ||
            priceText.toLowerCase().includes('liên hệ') ||
            priceText.toLowerCase().includes('cần tư vấn')
          );
          
          // Extract current price value - chỉ nếu có pattern giá
          let priceValue = 0;
          let validPrice = '';
          
          if (priceText && !isConsultProduct) {
            const priceMatch = priceText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*([₫đ])/);
            if (priceMatch) {
              validPrice = priceText;
              const numStr = priceMatch[1].replace(/[.,]/g, '');
              priceValue = parseInt(numStr, 10) || 0;
            }
          }
          
          // Tìm original price (line-through) trong cùng container
          let originalPrice = '';
          let originalPriceValue = 0;
          let discount = 0;
          let discountPercent = 0;
          
          const priceContainer = currentPriceEl ? currentPriceEl.closest('div[class*="flex"], div[class*="container"]') : null;
          if (priceContainer) {
            const originalPriceEl = Utils.safeQuery('p[class*="line-through"], span[class*="line-through"], div[class*="line-through"]', priceContainer) ||
                                   Utils.safeQuery('p.text-gray-7, span.text-gray-7', priceContainer);
            
            if (originalPriceEl) {
              const originalPriceText = Utils.getText(originalPriceEl).trim();
              const originalPriceMatch = originalPriceText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*([₫đ])/);
              if (originalPriceMatch) {
                originalPrice = originalPriceText;
                const numStr = originalPriceMatch[1].replace(/[.,]/g, '');
                originalPriceValue = parseInt(numStr, 10) || 0;
                
                // Tính discount
                if (priceValue > 0 && originalPriceValue > 0 && originalPriceValue > priceValue) {
                  discount = originalPriceValue - priceValue;
                  discountPercent = Math.round((discount / originalPriceValue) * 100);
                }
              }
            }
          }
          
          // Format price display
          let priceDisplay = 'CONSULT';
          if (validPrice && unitText) {
            priceDisplay = `${validPrice} / ${unitText}`;
          } else if (validPrice) {
            priceDisplay = validPrice;
          }
          
          return {
            price: validPrice || '',
            priceDisplay: priceDisplay,
            priceValue: priceValue,
            unit: unitText || '',
            originalPrice: originalPrice || '',
            originalPriceValue: originalPriceValue || 0,
            discount: discount || 0,
            discountPercent: discountPercent || 0
          };
        };
        
        // Tối ưu: Nếu chỉ có 1 variant, không cần click và delay, chỉ extract giá hiện tại
        if (variantButtons.length === 1) {
          const variant = variantButtons[0];
          try {
            // Extract giá hiện tại (không cần click)
            const priceInfo = extractCurrentPrice();
            
            // Normalize unit
            const unitName = variant.text.trim();
            const unitCode = Extractors.normalizeUnitCode(unitName);
            
            packageOptions.push({
              unit: unitCode,
              unitDisplay: unitName,
              price: priceInfo.price || '',
              priceDisplay: priceInfo.priceDisplay || 'CONSULT',
              priceValue: priceInfo.priceValue || 0,
              originalPrice: priceInfo.originalPrice || '',
              originalPriceValue: priceInfo.originalPriceValue || 0,
              discount: priceInfo.discount || 0,
              discountPercent: priceInfo.discountPercent || 0,
              specification: packageSize || '',
              isDefault: true,
              isAvailable: true,
              conversion: null
            });
          } catch (error) {
            console.warn(`[Scraper] Error extracting price for single variant ${variant.text}:`, error);
            // Vẫn thêm variant với giá rỗng
            const unitCode = Extractors.normalizeUnitCode(variant.text.trim());
            packageOptions.push({
              unit: unitCode,
              unitDisplay: variant.text.trim(),
              price: '',
              priceDisplay: 'CONSULT',
              priceValue: 0,
              originalPrice: '',
              originalPriceValue: 0,
              discount: 0,
              discountPercent: 0,
              specification: packageSize || '',
              isDefault: true,
              isAvailable: true,
              conversion: null
            });
          }
        } else {
          // Click vào từng variant và lấy giá (chỉ khi có > 1 variant)
          for (let i = 0; i < variantButtons.length; i++) {
            const variant = variantButtons[i];
            
            try {
              // Lấy giá hiện tại trước khi click (tìm lại element để đảm bảo đúng)
              let currentPriceEl = Utils.safeQuery('[data-test="price"]', searchContainer) ||
                                  Utils.safeQuery('[data-test="price"]', container);
              if (!currentPriceEl) {
                currentPriceEl = Utils.safeQuery('span[class*="font-semibold"], span[class*="font-bold"]', container);
              }
              const oldPrice = currentPriceEl ? Utils.getText(currentPriceEl).trim() : '';
              
              // Click vào variant button
              variant.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              await new Promise(resolve => setTimeout(resolve, 200)); // Chờ scroll
              
              // Click button (thử nhiều cách)
              try {
                // Method 1: Direct click
                variant.element.click();
              } catch (e) {
                // Method 2: Dispatch mouse events
                const clickEvent = new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window
                });
                variant.element.dispatchEvent(clickEvent);
              }
              
              // Method 3: Dispatch mousedown + mouseup + click (để đảm bảo React nhận được event)
              try {
                const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
                const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
                variant.element.dispatchEvent(mouseDownEvent);
                await new Promise(resolve => setTimeout(resolve, 50));
                variant.element.dispatchEvent(mouseUpEvent);
                await new Promise(resolve => setTimeout(resolve, 50));
                variant.element.click();
              } catch (e) {
                // Ignore
              }
              
              // Chờ giá cập nhật (tối ưu timeout dựa trên DOM ready state)
              const maxWait = document.readyState === 'complete' ? 2000 : 3000;
              await waitForPriceUpdate(oldPrice, maxWait);
              
              // Chờ DOM cập nhật - dùng requestAnimationFrame khi DOM ready (nhanh hơn)
              if (document.readyState === 'complete') {
                await new Promise(resolve => {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => resolve());
                  });
                });
              } else {
                await new Promise(resolve => setTimeout(resolve, 300));
              }
              
              // Extract giá sau khi click (tìm lại element để đảm bảo lấy giá mới)
              const priceInfo = extractCurrentPrice();
              
              // Normalize unit
              const unitName = variant.text.trim();
              const unitCode = Extractors.normalizeUnitCode(unitName);
              
              packageOptions.push({
                unit: unitCode,
                unitDisplay: unitName,
                price: priceInfo.price || '',
                priceDisplay: priceInfo.priceDisplay || 'CONSULT',
                priceValue: priceInfo.priceValue || 0,
                originalPrice: priceInfo.originalPrice || '',
                originalPriceValue: priceInfo.originalPriceValue || 0,
                discount: priceInfo.discount || 0,
                discountPercent: priceInfo.discountPercent || 0,
                specification: packageSize || '',
                isDefault: variant === defaultVariant,
                isAvailable: true,
                conversion: null
              });
              
              // Chờ một chút trước khi click variant tiếp theo (tối ưu khi DOM ready)
              if (document.readyState === 'complete') {
                await new Promise(resolve => requestAnimationFrame(resolve));
              } else {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              
            } catch (error) {
              console.warn(`[Scraper] Error extracting price for variant ${variant.text}:`, error);
              // Vẫn thêm variant với giá rỗng
              const unitCode = Extractors.normalizeUnitCode(variant.text.trim());
              packageOptions.push({
                unit: unitCode,
                unitDisplay: variant.text.trim(),
                price: '',
                priceDisplay: 'CONSULT',
                priceValue: 0,
                originalPrice: '',
                originalPriceValue: 0,
                discount: 0,
                discountPercent: 0,
                specification: packageSize || '',
                isDefault: variant === defaultVariant,
                isAvailable: true,
                conversion: null
              });
            }
          }
          
          // Reset về variant mặc định (chỉ khi có > 1 variant)
          if (defaultVariant && defaultVariant.element) {
            try {
              defaultVariant.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              await new Promise(resolve => setTimeout(resolve, 100));
              defaultVariant.element.click();
              await new Promise(resolve => setTimeout(resolve, 300));
            } catch (e) {
              // Ignore reset error
            }
          }
        }

        // Safety net: dedupe by unit code in case any branch double-pushed
        // (vd Strategy 3 fallback hoặc race khi click variants).
        if (packageOptions.length > 1) {
          const dedupedByCode = new Map();
          for (const opt of packageOptions) {
            const key = opt.unit || opt.unitDisplay || '';
            if (!dedupedByCode.has(key)) dedupedByCode.set(key, opt);
          }
          if (dedupedByCode.size !== packageOptions.length) {
            packageOptions.length = 0;
            packageOptions.push(...dedupedByCode.values());
          }
        }

        return packageOptions;
      };
      
      // Extract package options từ DOM (async - click vào từng variant để lấy giá)
      let packageOptions = [];
      try {
        packageOptions = await extractPackageOptionsFromDOM(productInfoContainer);
        if (!Array.isArray(packageOptions)) {
          packageOptions = [];
        }
      } catch (error) {
        console.warn('[Scraper] Error in extractPackageOptionsFromDOM:', error);
        packageOptions = [];
      }
      
      // Nếu không tìm thấy packageOptions từ DOM, tạo một option từ price và packageSize hiện có
      if (packageOptions.length === 0 && (price || packageSize)) {
        const unitName = packageSize || '';
        const unitCode = unitName.toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .replace(/^(hop|hoop)$/i, 'hop')
          .replace(/^(vi|vỉ)$/i, 'vi')
          .replace(/^(vien|viên)$/i, 'vien')
          .replace(/^(goi|gói)$/i, 'goi')
          .replace(/^(chai)$/i, 'chai')
          .replace(/^(tuyp|tuýp)$/i, 'tuyp')
          .replace(/^(ong|ống)$/i, 'ong')
          || 'default';
        
        // Extract price value từ price string
        let priceValue = 0;
        if (price) {
          const priceMatch = price.match(/(\d+[.,]?\d*)/);
          if (priceMatch) {
            const numStr = priceMatch[1].replace(/[.,]/g, '');
            priceValue = parseInt(numStr, 10) || 0;
          }
        }
        
        packageOptions.push({
          unit: unitCode,
          unitDisplay: unitName || '',
          price: price || '',
          priceDisplay: price || (priceValue > 0 ? `${priceValue.toLocaleString('vi-VN')}₫` : 'CONSULT'),
          priceValue: priceValue,
          specification: packageSize || '',
          isDefault: true,
          isAvailable: true,
          conversion: null
        });
      }
      
      // Extract rating và reviews - tìm các span cụ thể
      let rating = '';
      let reviewCount = '';
      let commentCount = '';
      
      // Tìm rating (số sao)
      const ratingEl = Utils.safeQuery('span[class*="inline-flex"]', productInfoContainer);
      if (ratingEl) {
        const ratingText = Utils.getText(ratingEl).trim();
        const ratingMatch = ratingText.match(/^(\d+)$/);
        if (ratingMatch) {
          rating = ratingMatch[1];
        }
      }
      
      // Tìm review count và comment count
      const reviewSpans = Utils.safeQueryAll('span[class*="text-blue"]', productInfoContainer);
      reviewSpans.forEach(span => {
        const text = Utils.getText(span).trim();
        const reviewMatch = text.match(/(\d+)\s*đánh\s+giá/i);
        const commentMatch = text.match(/(\d+)\s*bình\s+luận/i);
        if (reviewMatch) {
          reviewCount = reviewMatch[1];
        }
        if (commentMatch) {
          commentCount = commentMatch[1];
        }
      });
      
      // ============================================
      // 7. EXTRACT CATEGORY
      // ============================================
      let categoryPath = '';
      let categorySlug = '';
      let category = [];
      
      // Try product detail breadcrumb first (more specific)
      const productBreadcrumb = Utils.safeQuery('[data-lcpr="prr-id-product-detail-breadcrumb"]') ||
                                 Utils.safeQuery('[data-lcpr="prr-id-category-breadcrumb"]') ||
                                 Utils.safeQuery('ol[class*="breadcrumb"]') ||
                                 Utils.safeQuery('[class*="breadcrumb"]');
      
      if (productBreadcrumb) {
        const breadcrumbLinks = Utils.safeQueryAll('a', productBreadcrumb);
        if (breadcrumbLinks.length > 0) {
          // Extract category path and slugs from breadcrumb links
          const categoryNames = [];
          const categorySlugs = [];
          
          breadcrumbLinks.forEach(link => {
            const linkText = Utils.getText(link).trim();
            const linkHref = link.href || '';
            
            // Skip "Trang chủ" (Homepage)
            if (linkText && !linkText.match(/trang\s+chủ|homepage/i)) {
              categoryNames.push(linkText);
              
              // Extract slug from href - flexible for any category path
              if (linkHref) {
                try {
                  const urlObj = new URL(linkHref);
                  const pathSegments = urlObj.pathname.split('/').filter(p => p && !p.includes('.html') && !p.includes('.'));
                  
                  if (pathSegments.length > 0) {
                    // Use the last segment as slug (or all segments for nested categories)
                    categorySlugs.push(pathSegments[pathSegments.length - 1]);
      } else {
                    // Fallback: extract from URL path
                    const pathMatch = linkHref.match(/\/([^\/]+)\/?$/);
                    if (pathMatch && !pathMatch[1].includes('.')) {
                      categorySlugs.push(pathMatch[1]);
                    }
                  }
                } catch (e) {
                  // Fallback: extract from URL path
                  const pathMatch = linkHref.match(/\/([^\/]+)\/?$/);
                  if (pathMatch && !pathMatch[1].includes('.')) {
                    categorySlugs.push(pathMatch[1]);
                  }
                }
              }
            }
          });
          
          if (categoryNames.length > 0) {
            categoryPath = categoryNames.join(' > ');
            categorySlug = categorySlugs.join('/');
            category = categoryNames.map((name, idx) => ({
              name: name,
              slug: categorySlugs[idx] || ''
            }));
          }
        } else {
          // Fallback: extract from breadcrumb text
          const breadcrumbText = Utils.getText(productBreadcrumb);
          if (breadcrumbText) {
            const parts = breadcrumbText.split('/').map(p => p.trim()).filter(p => p && !p.match(/trang\s+chủ|homepage/i));
            if (parts.length > 0) {
              categoryPath = parts.join(' > ');
              category = parts.map(name => ({ name: name, slug: '' }));
            }
          }
        }
      }
      
      // Fallback: try category link - flexible for any category
      if (!categoryPath) {
        // Find any link that looks like a category link (has path segments, no .html)
        const allLinks = Utils.safeQueryAll('a[href]', productInfoContainer);
        for (const categoryLink of allLinks) {
          const href = categoryLink.href || '';
          // Accept same-domain or relative links that look like category paths (no .html, has path segments)
          const isSameSite = href.startsWith('http') ? href.includes(window.location.host) : true;
          if (href && isSameSite && 
              !href.includes('.html') && 
              href.match(/\/[^\/]+\/[^\/]+$/)) {
            categoryPath = Utils.getText(categoryLink).trim();
            if (categoryPath) {
              try {
                const urlObj = new URL(href);
                const pathSegments = urlObj.pathname.split('/').filter(p => p);
                if (pathSegments.length > 0) {
                  categorySlug = pathSegments[pathSegments.length - 1];
                  category = [{ name: categoryPath, slug: categorySlug }];
                  break;
                }
              } catch (e) {
                // Skip invalid URL
              }
            }
          }
        }
      }
      
      // Fallback: try category from table
      if (!categoryPath) {
        const categoryRow = Utils.safeQuery('tr.content-container, tr[class*="category"]', productInfoContainer);
        if (categoryRow) {
          const rowText = Utils.getText(categoryRow);
          const categoryMatch = rowText.match(/Danh\s+mục[:\s]+([^\n\r]+)/i);
          if (categoryMatch) {
            categoryPath = categoryMatch[1].trim();
            category = [{ name: categoryPath, slug: '' }];
          }
        }
      }
      
      // Fallback: extract from URL - flexible for any category path
      if (!categoryPath && window.location.pathname) {
        const pathParts = window.location.pathname.split('/').filter(p => p && !p.includes('.html') && !p.includes('.'));
        if (pathParts.length > 0) {
          // Use all path parts as category (no filtering - accept any category)
          categoryPath = pathParts.join(' > ');
          categorySlug = pathParts.join('/');
          category = pathParts.map(name => ({ name: name, slug: name }));
        }
      }
      
      // ============================================
      // 8. EXTRACT IMAGES
      // ============================================
      let mainImage = '';
      const imageSelectors = [
        'img[src*="cdn.nhathuoclongchau.com.vn"]',
        'img[class*="gallery-img"]',
        'img[class*="product-image"]',
        'img[class*="main-image"]',
        'img[src*="product"]'
      ];
      for (const sel of imageSelectors) {
        const imgEl = Utils.safeQuery(sel, productInfoContainer);
        if (imgEl && imgEl.src && imgEl.src.includes('cdn.nhathuoclongchau.com.vn') && !imgEl.src.includes('Badge') && !imgEl.src.includes('smalls')) {
          mainImage = imgEl.src;
          break;
        }
      }
      
      // Extract all images - loại bỏ duplicate và badge images
      // Normalize URL để loại bỏ duplicate (cùng ảnh nhưng khác size)
      const normalizeImageUrl = (url) => {
        if (!url) return '';
        // Loại bỏ size parameters để so sánh
        return url.replace(/\/unsafe\/\d+x\d+\/filters:quality\(\d+\)\//, '/unsafe/');
      };
      
      const allImageElements = Utils.safeQueryAll('img[src*="cdn.nhathuoclongchau.com.vn"]', productInfoContainer);
      const imageSet = new Set(); // Dùng Set để loại bỏ duplicate (theo normalized URL)
      const images = [];
      
      // Thêm mainImage trước nếu có
      if (mainImage) {
        const normalizedMain = normalizeImageUrl(mainImage);
        if (normalizedMain && !imageSet.has(normalizedMain)) {
          imageSet.add(normalizedMain);
          images.push(mainImage);
        }
      }
      
      // Thêm các images khác (loại bỏ badge, smalls, và duplicate)
      allImageElements.forEach(img => {
        const src = img.src;
        if (src && 
            src.includes('cdn.nhathuoclongchau.com.vn') && 
            !src.includes('Badge') && 
            !src.includes('smalls')) {
          const normalizedSrc = normalizeImageUrl(src);
          if (normalizedSrc && !imageSet.has(normalizedSrc)) {
            imageSet.add(normalizedSrc);
            images.push(src);
          }
        }
      });
      
      // ============================================
      // EXTRACT PRODUCT CONTENT (description / ingredients / usage / dosage /
      // adverseEffect / careful / preservation)
      // ============================================
      // All 7 fields are produced by `DataScraperProductContentStrategy`
      // (see strategies/product-content-strategy.js). It owns:
      //   - sanitized HTML extraction for the 6 prose fields,
      //   - popup-aware ingredients extraction (Radix dialog click + parse +
      //     auto-close), with fallback to inline table or spec row,
      //   - the adverseEffect ↔ preservation guard.
      // The strategy awaits its own popup mutation to fully unwind before
      // resolving so the spec extraction below sees a clean DOM.
      const ContentStrategy = window.DataScraperProductContentStrategy;
      const content = ContentStrategy
        ? await ContentStrategy.extract(specifications, Utils, Extractors)
        : { description: '', ingredients: '', usage: '', dosage: '', adverseEffect: '', careful: '', preservation: '' };
      const description = content.description;
      const ingredients = content.ingredients;
      const usage = content.usage;
      const dosage = content.dosage;
      const adverseEffect = content.adverseEffect;
      const careful = content.careful;
      const preservation = content.preservation;
      
      // Extract thông tin bổ sung từ specifications table
      // Tìm element [data-theme-element="article"] trong row có label tương ứng
      let origin = '';
      let manufacturer = '';
      let shelfLife = '';
      
      // Extract origin và manufacturer từ div.flex.gap-2.flex-wrap.items-center
      // Strategy 1: Tìm div có class chứa "flex gap-2 flex-wrap items-center"
      const brandOriginDiv = Utils.safeQuery('div.flex.gap-2.flex-wrap.items-center, div[class*="flex"][class*="gap-2"][class*="flex-wrap"][class*="items-center"]', detailContainer) ||
                             Utils.safeQuery('div.flex[class*="gap-2"]', detailContainer);
      
      if (brandOriginDiv) {
        const brandOriginText = Utils.getText(brandOriginDiv).trim();
        
        // Extract origin: tìm span có class text-text-secondary text-caption
        const originSpan = Utils.safeQuery('span[class*="text-text-secondary"][class*="text-caption"], span[class*="text-text-secondary"]', brandOriginDiv);
        if (originSpan) {
          origin = Utils.getText(originSpan).trim();
        } else {
          // Fallback: extract từ text "Việt Nam" hoặc country name
          const originMatch = brandOriginText.match(/^([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+?)(?:\s+Thương\s+hiệu|$)/i);
          if (originMatch && originMatch[1]) {
            origin = originMatch[1].trim();
          }
        }
        
        // Extract manufacturer: tìm link a.text-blue-5 hoặc text sau "Thương hiệu:"
        const manufacturerLink = Utils.safeQuery('a[class*="text-blue-5"], a[href*="thuong-hieu"]', brandOriginDiv);
        if (manufacturerLink) {
          manufacturer = Utils.getText(manufacturerLink).trim();
        } else {
          // Fallback: extract từ text sau "Thương hiệu:"
          const manufacturerMatch = brandOriginText.match(/Thương\s+hiệu[:\s]+([^\s]+(?:\s+[^\s]+)*?)(?:\s|$)/i);
          if (manufacturerMatch && manufacturerMatch[1]) {
            manufacturer = manufacturerMatch[1].trim();
          }
        }
      }
      
      // Strategy 2: Fallback về extractSpecValue
      if (!origin) {
        origin = Extractors.extractSpecValue(/Nước\s+sản\s+xuất/i, detailContainer, Utils);
        if (!origin) {
          origin = Extractors.extractSpecValue(/Xuất\s+xứ\s+thương\s+hiệu/i, detailContainer, Utils);
        }
      }
      if (!origin && specifications['Nước sản xuất']) {
        origin = specifications['Nước sản xuất'].split(/\s+/)[0];
      } else if (!origin && specifications['Xuất xứ thương hiệu']) {
        origin = specifications['Xuất xứ thương hiệu'].split(/\s+/)[0];
      }
      if (!origin) {
        const originMatch = fullText.match(/Nước\s+sản\s+xuất[:\s]+([^\n\r]+)/i) || 
                           fullText.match(/Xuất\s+xứ\s+thương\s+hiệu[:\s]+([^\n\r]+)/i);
        if (originMatch) {
          origin = originMatch[1].trim().split(/\s+/)[0];
        }
      }
      
      if (!manufacturer) {
        manufacturer = Extractors.extractSpecValue(/Nhà\s+sản\s+xuất/i, detailContainer, Utils);
      }
      if (!manufacturer && specifications['Nhà sản xuất']) {
        manufacturer = specifications['Nhà sản xuất'].split('\n')[0].trim();
      }
      if (!manufacturer) {
        const manufacturerMatch = fullText.match(/Nhà\s+sản\s+xuất[:\s]+([^\n\r]+)/i);
        if (manufacturerMatch) {
          manufacturer = manufacturerMatch[1].trim().split('\n')[0].trim();
        }
      }
      
      // Extract shelfLife (Hạn sử dụng)
      // Strategy 0 (preferred, 2026 layout): match the spec row by its value
      // column class (`div.flex-1.!max-w-full`) and verify the row label.
      // This is a tighter scope than the historical strategies below, which
      // were over-broad and surfaced the wrong article element when the layout
      // had multiple `[data-theme-element="article"]` nodes per page.
      shelfLife = Extractors.extractSpecRowValueByLabel(/Hạn\s+sử\s+dụng/i, detailContainer, Utils);

      // Strategy 1: Tìm div.space-y-4 (hoặc container tương tự) - hạn sử dụng thường là element cuối cùng
      const spaceY4Container = !shelfLife
        ? (Utils.safeQuery('div.space-y-4, div[class*="space-y-4"]', detailContainer) ||
           Utils.safeQuery('div[class*="space-y"]', detailContainer))
        : null;
      
      if (spaceY4Container) {
        const containerText = Utils.getText(spaceY4Container).trim();
        // Kiểm tra nếu container chứa text "Hạn sử dụng"
        if (/Hạn\s+sử\s+dụng/i.test(containerText)) {
          // Tìm tất cả [data-theme-element="article"] trong container
          const articleEls = Utils.safeQueryAll('[data-theme-element="article"]', spaceY4Container);
          
          // Lấy element cuối cùng (hạn sử dụng thường là element cuối cùng)
          if (articleEls.length > 0) {
            // Tìm element cuối cùng có text hợp lệ (không phải label, có nội dung)
            for (let i = articleEls.length - 1; i >= 0; i--) {
              const articleEl = articleEls[i];
              const articleText = Utils.getText(articleEl).trim();
              // Đảm bảo không phải là label "Hạn sử dụng" và có nội dung
              if (articleText && !/Hạn\s+sử\s+dụng/i.test(articleText) && articleText.length > 0) {
                // Loại bỏ các text không cần thiết như "Sao chép"
                shelfLife = articleText.replace(/\s*Sao\s+chép.*/i, '').trim();
                if (shelfLife) {
                  break;
                }
              }
            }
          }
          
          // Fallback: Nếu không tìm thấy article element, extract trực tiếp từ text
          if (!shelfLife) {
            const shelfMatch = containerText.match(/Hạn\s+sử\s+dụng\s+([^\n\r]+?)(?:\s*$|$)/i);
            if (shelfMatch && shelfMatch[1]) {
              shelfLife = shelfMatch[1].trim();
              // Loại bỏ các text không cần thiết nếu có
              shelfLife = shelfLife.replace(/\s*Sao\s+chép.*/i, '').trim();
            }
          }
        }
      }
      
      // Strategy 2: Fallback - Tìm div.flex có text chứa "Hạn sử dụng" - lấy element cuối cùng
      if (!shelfLife) {
        const shelfLifeDivs = Utils.safeQueryAll('div.flex', detailContainer);
        for (const div of shelfLifeDivs) {
          const divText = Utils.getText(div).trim();
          // Kiểm tra nếu div chứa text "Hạn sử dụng" (label)
          if (/Hạn\s+sử\s+dụng/i.test(divText)) {
            // Tìm element [data-theme-element="article"] trong toàn bộ subtree của div.flex
            const articleEls = Utils.safeQueryAll('[data-theme-element="article"]', div);
            
            // Lấy element cuối cùng thay vì element đầu tiên
            if (articleEls.length > 0) {
              for (let i = articleEls.length - 1; i >= 0; i--) {
                const articleEl = articleEls[i];
                const articleText = Utils.getText(articleEl).trim();
                // Đảm bảo không phải là label "Hạn sử dụng" và có nội dung
                if (articleText && !/Hạn\s+sử\s+dụng/i.test(articleText) && articleText.length > 0) {
                  // Loại bỏ các text không cần thiết như "Sao chép"
                  shelfLife = articleText.replace(/\s*Sao\s+chép.*/i, '').trim();
                  if (shelfLife) {
                    break;
                  }
                }
              }
            }
            
            // Fallback: Nếu không tìm thấy article element, extract trực tiếp từ text
            if (!shelfLife) {
              const shelfMatch = divText.match(/Hạn\s+sử\s+dụng\s+([^\n\r]+?)(?:\s*$|$)/i);
              if (shelfMatch && shelfMatch[1]) {
                shelfLife = shelfMatch[1].trim();
                // Loại bỏ các text không cần thiết nếu có
                shelfLife = shelfLife.replace(/\s*Sao\s+chép.*/i, '').trim();
                if (shelfLife && shelfLife !== 'Hạn sử dụng') {
                  break;
                }
              }
            }
            
            // Fallback: Tìm div có class text-gray-10 và text-body trong div (lấy element cuối cùng)
            if (!shelfLife) {
              const valueDivs = Utils.safeQueryAll('div', div);
              // Lặp ngược từ cuối lên đầu
              for (let i = valueDivs.length - 1; i >= 0; i--) {
                const valueDiv = valueDivs[i];
                const divClass = valueDiv.className || '';
                const divTextValue = Utils.getText(valueDiv).trim();
                
                // Kiểm tra nếu div có class text-gray-10 và text-body và không phải là label
                if ((divClass.includes('text-gray-10') && (divClass.includes('text-body') || divClass.includes('text-body1') || divClass.includes('text-body2'))) &&
                    divTextValue && !/Hạn\s+sử\s+dụng/i.test(divTextValue) && divTextValue.length > 0) {
                  shelfLife = divTextValue.trim();
                  break;
                }
              }
            }
            
            if (shelfLife) break;
          }
        }
      }
      
      // Strategy 2: Fallback về extractSpecValue
      if (!shelfLife) {
        shelfLife = Extractors.extractSpecValue(/Hạn\s+sử\s+dụng/i, detailContainer, Utils);
      }
      if (!shelfLife && specifications['Hạn sử dụng']) {
        shelfLife = specifications['Hạn sử dụng'].trim();
      }
      if (!shelfLife) {
        const shelfLifeMatch = fullText.match(/Hạn\s+sử\s+dụng[:\s]+([^\n\r]+)/i);
        if (shelfLifeMatch) {
          shelfLife = shelfLifeMatch[1].trim();
        }
      }

      // Extract registrationNumber (Số đăng ký) — Long Châu's 2026 layout puts
      // this in the same "Thông tin sản phẩm" spec table as `Hạn sử dụng`.
      // The detail-scraper used to leave this empty because the only source
      // was the legacy `<table>`-based `specifications['Số đăng ký']`, which
      // the new layout no longer emits.
      let registrationNumber = Extractors.extractSpecRowValueByLabel(
        /S[ốo]\s+đăng\s+k[ýy]/i,
        detailContainer,
        Utils
      );
      if (!registrationNumber && specifications['Số đăng ký']) {
        registrationNumber = specifications['Số đăng ký'].trim();
      }
      if (!registrationNumber) {
        const m = fullText.match(/S[ốo]\s+đăng\s+k[ýy][:\s]+([^\n\r]+)/i);
        if (m) registrationNumber = m[1].trim();
      }

      if (specifications['Quy cách'] && !packageSize) {
        packageSize = specifications['Quy cách'];
      }
      
      // Build link từ URL
      const url = window.location.href || '';
      const link = slug ? `https://nhathuoclongchau.com.vn/${slug}` : url;
      
      // Build flat structure trước (backward compatibility)
      // Format price display: nếu không có giá, set thành CONSULT
      const finalPrice = (price || '').trim();
      const priceDisplay = finalPrice || 'CONSULT';
      
      // Tính priceValue từ finalPrice
      let priceValue = 0;
      if (finalPrice) {
        const priceMatch = finalPrice.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*([₫đ])/);
        if (priceMatch) {
          const numStr = priceMatch[1].replace(/[.,]/g, '');
          priceValue = parseInt(numStr, 10) || 0;
        }
      }
      
      // Build prices array (lịch sử giá hoặc các mức giá khác nhau)
      // Hiện tại chỉ có current price và original price (nếu có)
      const prices = [];
      if (priceInfo.currentPriceValue > 0) {
        prices.push({
          price: priceInfo.currentPrice,
          priceValue: priceInfo.currentPriceValue,
          priceDisplay: priceDisplay,
          isCurrent: true,
          isOriginal: false,
          discount: priceInfo.discount || 0,
          discountPercent: priceInfo.discountPercent || 0
        });
      }
      if (priceInfo.originalPriceValue > 0 && priceInfo.originalPriceValue !== priceInfo.currentPriceValue) {
        prices.push({
          price: priceInfo.originalPrice,
          priceValue: priceInfo.originalPriceValue,
          priceDisplay: priceInfo.originalPrice,
          isCurrent: false,
          isOriginal: true,
          discount: 0,
          discountPercent: 0
        });
      }
      
      const flatProduct = {
        name: (name || '').trim(),
        sku: (sku || '').trim(),
        brand: (brand || '').trim(),
        price: finalPrice,
        priceDisplay: priceDisplay,
        priceValue: priceValue,
        currentPrice: priceInfo.currentPrice || finalPrice,
        currentPriceValue: priceInfo.currentPriceValue || priceValue,
        originalPrice: priceInfo.originalPrice || '',
        originalPriceValue: priceInfo.originalPriceValue || 0,
        discount: priceInfo.discount || 0,
        discountPercent: priceInfo.discountPercent || 0,
        prices: prices,
        packageSize: (packageSize || '').trim(),
        rating: (rating || '').trim(),
        reviewCount: (reviewCount || '').trim(),
        commentCount: (commentCount || '').trim(),
        reviews: reviewCount && commentCount ? `${reviewCount} đánh giá, ${commentCount} bình luận` : '',
        category: Array.isArray(category) && category.length > 0 ? category : [],
        categoryPath: (categoryPath || '').trim(),
        categorySlug: (categorySlug || '').trim(),
        image: (mainImage || '').trim(),
        images: Array.isArray(images) ? images.filter(img => img && typeof img === 'string' && img.trim()) : [],
        // Các section từ detail-content-*
        description: (description || '').trim(),
        ingredients: (ingredients || '').trim(),
        usage: (usage || '').trim(),
        dosage: (dosage || '').trim(),
        adverseEffect: (adverseEffect || '').trim(),
        careful: (careful || '').trim(),
        preservation: (preservation || '').trim(),
        // Thông tin bổ sung
        origin: (origin || '').trim(),
        manufacturer: (manufacturer || '').trim(),
        shelfLife: (shelfLife || '').trim(),
        registrationNumber: (registrationNumber || '').trim(),
        specifications: specifications || {},
        link: link.trim(),
        slug: slug,
        // Package options (variants) từ DOM
        packageOptions: Array.isArray(packageOptions) && packageOptions.length > 0 ? packageOptions : []
      };
      
      // Format theo cấu trúc nhóm (database-friendly) nếu có formatter
      const ProductFormatter = window.DataScraperProductFormatter;
      const product = ProductFormatter ? ProductFormatter.formatProductDetail(flatProduct) : flatProduct;

      const getField = (obj, path) => {
        const parts = path.split('.');
        let value = obj;
        for (const part of parts) {
          value = value?.[part];
          if (value === undefined) return '';
        }
        return value || '';
      };

      const setField = (obj, path, value) => {
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) current[parts[i]] = {};
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
      };

      let productName = getField(product, ProductFormatter ? 'basicInfo.name' : 'name');
      let productSku = getField(product, ProductFormatter ? 'basicInfo.sku' : 'sku');
      
      if (!productName && !productSku) {
        const extractedName = document.title || Utils.getText(Utils.safeQuery('h1')) || '';
        const urlSkuMatch = window.location.href.match(/\/(\d{6,8})\.html/);
        const extractedSku = urlSkuMatch ? urlSkuMatch[1] : '';
        
        if (extractedName) {
          setField(product, ProductFormatter ? 'basicInfo.name' : 'name', extractedName);
          productName = extractedName;
        }
        
        if (extractedSku) {
          setField(product, ProductFormatter ? 'basicInfo.sku' : 'sku', extractedSku);
          productSku = extractedSku;
        }
      }

      return (productName || productSku) ? product : null;
    } catch (error) {
      return null;
    }
  }
  };
})();