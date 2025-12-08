(() => {
  'use strict';

  // ============================================
  // 🌐 API SCRAPER
  // ============================================
  window.DataScraperAPI = {
    // Format product từ API
    formatProduct: (product) => {
      if (!product?.sku) return null;

      let priceObj = product.price;
      let priceDisplay = '';
      let priceValue = 0;
      
      if (priceObj && typeof priceObj === 'object') {
        priceValue = priceObj.price || priceObj.value || 0;
        const unit = priceObj.measureUnitName || priceObj.unit || '';
        const currency = priceObj.currencySymbol || 'đ';
        priceDisplay = `${priceValue.toLocaleString('vi-VN')}${currency}${unit ? ' / ' + unit : ''}`;
      } else if (product.prices?.length > 0) {
        priceObj = product.prices[0];
        priceValue = priceObj.price || 0;
        const unit = priceObj.measureUnitName || '';
        const currency = priceObj.currencySymbol || 'đ';
        priceDisplay = `${priceValue.toLocaleString('vi-VN')}${currency}${unit ? ' / ' + unit : ''}`;
      }

      const link = product.slug ? `https://nhathuoclongchau.com.vn/${product.slug}` : '';

      return {
        sku: product.sku || '',
        name: product.name || product.webName || '',
        webName: product.webName || product.name || '',
        slug: product.slug || '',
        link: link,
        image: product.image || '',
        brand: product.brand || '',
        specification: product.specification || '',
        shortDescription: product.shortDescription || '',
        category: product.category || [],
        prices: product.prices || [],
        price: priceObj,
        priceDisplay: priceDisplay,
        priceValue: priceValue,
        productRanking: product.productRanking || 0,
        displayCode: product.displayCode || 1,
        isPublish: product.isPublish !== undefined ? product.isPublish : true,
        categoryPath: product.category?.map(c => c.name).join(' > ') || '',
        categorySlug: product.category?.map(c => c.slug).join('/') || ''
      };
    },

    // Parse API response
    parseResponse: (data) => {
      if (Array.isArray(data)) {
        return data.flatMap(item => 
          item.products || (item.sku ? [item] : [])
        );
      }
      return data.products || data.data || data.items || [];
    },

    // Scrape Long Châu API
    scrapeLongChau: async (options = {}) => {
      const {
        maxProducts = 100,
        pageSize = 20,
        category = null,
        codes = [],
        sortType = 4
      } = options;

      const apiUrl = 'https://api.nhathuoclongchau.com.vn/lccus/search-product-service/api/products/ecom/product/search/cate';
      const allProducts = [];
      let skipCount = 0;
      const Utils = window.DataScraperUtils;
      const log = window.DataScraperLog;

      // Auto-detect category
      let categorySlug = category || window.location.pathname.match(/\/([^\/]+)(?:\/|$)/)?.[1];
      if (categorySlug) log(`Category: ${categorySlug}`, '🔍');

      const defaultCodes = [
        'productTypes', 'objectUse', 'priceRanges', 'prescription',
        'skin', 'flavor', 'manufactor', 'indications', 'brand', 'brandOrigin'
      ];

      while (allProducts.length < maxProducts) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              skipCount,
              maxResultCount: pageSize,
              category: categorySlug ? [categorySlug] : [],
              codes: codes.length > 0 ? codes : defaultCodes,
              sortType
            })
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await response.json();
          const products = this.parseResponse(data).filter(p => p?.sku);

          if (products.length === 0) break;

          const formatted = products
            .map(p => this.formatProduct(p))
            .filter(p => p !== null);

          allProducts.push(...formatted);
          log(`Lấy ${formatted.length} sản phẩm, Tổng: ${allProducts.length}/${maxProducts}`, '📊');

          if (formatted.length < pageSize || allProducts.length >= maxProducts) break;

          skipCount += pageSize;
          await new Promise(r => setTimeout(r, 500));
        } catch (error) {
          log(`Lỗi API: ${error.message}`, '❌');
          break;
        }
      }

      log(`Hoàn thành: ${allProducts.length} sản phẩm`, '✅');
      return allProducts.slice(0, maxProducts);
    },

    // Scrape product detail từ API bằng SKU
    scrapeProductDetailBySKU: async (sku) => {
      if (!sku) return null;
      
      const log = window.DataScraperLog;
      const apiEndpoints = [
        `https://api.nhathuoclongchau.com.vn/lccus/prod-cms/api/v2/tips/product/sku?sku=${sku}`,
        `https://api.nhathuoclongchau.com.vn/lccus/search-product-service/api/products/ecom/product/detail?sku=${sku}`,
        `https://api.nhathuoclongchau.com.vn/api/product/${sku}`
      ];

      for (const apiUrl of apiEndpoints) {
        try {
          log(`Đang gọi API detail: ${apiUrl}`, '📡');
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });

          if (!response.ok) continue;

          const data = await response.json();
          
          // Parse response structure
          let productData = null;
          if (data.data && data.data.sku) {
            productData = data.data;
          } else if (data.sku) {
            productData = data;
          } else if (data.product && data.product.sku) {
            productData = data.product;
          }

          if (productData && productData.sku) {
            log(`Tìm thấy product detail từ API`, '✅');
            return this.formatProductDetail(productData);
          }
        } catch (error) {
          log(`Lỗi API ${apiUrl}: ${error.message}`, '⚠️');
          continue;
        }
      }

      return null;
    },

    // Format product detail từ API response
    formatProductDetail: (product) => {
      if (!product?.sku) return null;

      return {
        sku: product.sku || '',
        name: product.name || product.webName || '',
        webName: product.webName || product.name || '',
        slug: product.slug || '',
        link: product.slug ? `https://nhathuoclongchau.com.vn/${product.slug}` : '',
        image: product.image || product.mainImage || '',
        images: product.images || product.gallery || [],
        brand: product.brand || product.brandName || '',
        specification: product.specification || '',
        shortDescription: product.shortDescription || product.description || '',
        fullDescription: product.fullDescription || product.content || product.description || '',
        category: product.category || [],
        categoryPath: product.category?.map(c => c.name || c).join(' > ') || '',
        categorySlug: product.category?.map(c => c.slug || c).join('/') || '',
        prices: product.prices || [],
        price: product.price || null,
        priceDisplay: product.priceDisplay || '',
        priceValue: product.priceValue || 0,
        registrationNumber: product.registrationNumber || product.registration || '',
        origin: product.origin || product.country || '',
        manufacturer: product.manufacturer || product.manufacturerName || '',
        shelfLife: product.shelfLife || product.expiryDate || '',
        ingredients: product.ingredients || product.composition || '',
        indications: product.indications || product.uses || '',
        dosage: product.dosage || product.usage || '',
        contraindications: product.contraindications || product.warnings || '',
        storage: product.storage || '',
        packaging: product.packaging || product.packageSize || '',
        rating: product.rating || product.averageRating || '',
        reviewCount: product.reviewCount || product.totalReviews || '',
        commentCount: product.commentCount || product.totalComments || '',
        productRanking: product.productRanking || 0,
        isPublish: product.isPublish !== undefined ? product.isPublish : true,
        url: product.slug ? `https://nhathuoclongchau.com.vn/${product.slug}` : window.location.href,
        scrapedAt: new Date().toISOString(),
        source: 'API'
      };
    }
  };
})();

