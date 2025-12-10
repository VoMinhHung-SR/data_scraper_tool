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
    // Cấu trúc giống với DOM scraping để export thống nhất "1 click"
    formatProductDetail: (product) => {
      if (!product?.sku) return null;

      // Extract price info
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
      } else if (product.priceDisplay) {
        priceDisplay = product.priceDisplay;
        priceValue = product.priceValue || 0;
      }

      // Extract category info
      const category = Array.isArray(product.category) ? product.category : [];
      const categoryPath = category.length > 0 
        ? category.map(c => c.name || c).join(' > ') 
        : (product.categoryPath || '');
      const categorySlug = category.length > 0
        ? category.map(c => c.slug || c).join('/')
        : (product.categorySlug || '');

      // Extract images
      const mainImage = product.image || product.mainImage || '';
      const images = Array.isArray(product.images) 
        ? product.images 
        : (Array.isArray(product.gallery) ? product.gallery : (mainImage ? [mainImage] : []));

      // Gom nhóm specifications thành object (giống DOM scraping)
      const specifications = {};
      
      // Extract từ các field riêng lẻ vào specifications object
      if (product.registrationNumber || product.registration) {
        specifications['Số đăng ký'] = product.registrationNumber || product.registration;
      }
      if (product.origin || product.country) {
        specifications['Xuất xứ thương hiệu'] = product.origin || product.country;
      }
      if (product.manufacturer || product.manufacturerName) {
        specifications['Nhà sản xuất'] = product.manufacturer || product.manufacturerName;
      }
      if (product.shelfLife || product.expiryDate) {
        specifications['Hạn sử dụng'] = product.shelfLife || product.expiryDate;
      }
      if (product.packaging || product.packageSize) {
        specifications['Quy cách'] = product.packaging || product.packageSize;
      }
      if (product.specification) {
        // Nếu specification là string, có thể parse hoặc giữ nguyên
        try {
          const specObj = typeof product.specification === 'string' 
            ? JSON.parse(product.specification) 
            : product.specification;
          if (typeof specObj === 'object' && specObj !== null) {
            Object.assign(specifications, specObj);
          } else {
            specifications['Thông số kỹ thuật'] = product.specification;
          }
        } catch (e) {
          specifications['Thông số kỹ thuật'] = product.specification;
        }
      }

      // Extract package size từ specifications hoặc packaging
      const packageSize = specifications['Quy cách'] || product.packaging || product.packageSize || '';

      // Extract rating và reviews
      const rating = product.rating || product.averageRating || '';
      const reviewCount = product.reviewCount || product.totalReviews || '';
      const commentCount = product.commentCount || product.totalComments || '';
      const reviews = reviewCount && commentCount 
        ? `${reviewCount} đánh giá, ${commentCount} bình luận` 
        : '';

      // Extract các section (giống DOM scraping)
      const description = product.fullDescription || product.shortDescription || product.description || product.content || '';
      const ingredient = product.ingredients || product.composition || specifications['Thành phần'] || '';
      const usage = product.indications || product.uses || '';
      const dosage = product.dosage || product.usage || '';
      const adverseEffect = product.contraindications || product.warnings || '';
      const careful = ''; // API không có field này, để trống
      const preservation = product.storage || '';

      // Build link
      const slug = product.slug || '';
      const link = slug ? `https://nhathuoclongchau.com.vn/${slug}` : '';
      const url = link || window.location.href;

      // Return format giống DOM scraping để export thống nhất
      return {
        // Thông tin cơ bản
        name: (product.name || product.webName || '').trim(),
        sku: (product.sku || '').trim(),
        brand: (product.brand || product.brandName || '').trim(),
        price: priceDisplay.trim(),
        packageSize: packageSize.trim(),
        
        // Rating và reviews
        rating: String(rating || '').trim(),
        reviewCount: String(reviewCount || '').trim(),
        commentCount: String(commentCount || '').trim(),
        reviews: reviews.trim(),
        
        // Category
        category: category,
        categoryPath: categoryPath.trim(),
        categorySlug: categorySlug.trim(),
        
        // Images
        image: mainImage.trim(),
        images: images.filter(img => img && typeof img === 'string' && img.trim()),
        
        // Các section từ detail-content-* (giống DOM scraping)
        description: description.trim(),
        ingredient: ingredient.trim(),
        usage: usage.trim(),
        dosage: dosage.trim(),
        adverseEffect: adverseEffect.trim(),
        careful: careful.trim(),
        preservation: preservation.trim(),
        
        // Thông tin bổ sung
        registrationNumber: (specifications['Số đăng ký'] || '').trim(),
        origin: (specifications['Xuất xứ thương hiệu'] || '').trim(),
        manufacturer: (specifications['Nhà sản xuất'] || '').trim(),
        shelfLife: (specifications['Hạn sử dụng'] || '').trim(),
        ingredients: ingredient.trim(), // Alias cho ingredient
        
        // Specifications object (gom nhóm giống DOM scraping)
        specifications: specifications,
        
        // Metadata
        url: url.trim(),
        link: link.trim(),
        scrapedAt: new Date().toISOString(),
        source: 'API',
        
        // Additional fields từ API (giữ lại để tương thích)
        webName: product.webName || product.name || '',
        slug: slug,
        prices: product.prices || [],
        priceObj: priceObj,
        priceValue: priceValue,
        productRanking: product.productRanking || 0,
        displayCode: product.displayCode || 1,
        isPublish: product.isPublish !== undefined ? product.isPublish : true
      };
    }
  };
})();

