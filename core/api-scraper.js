(() => {
  'use strict';

  const formatPriceDisplay = (priceObj, priceVal) => {
    const unit = priceObj.measureUnitName || priceObj.unit || '';
    const currency = priceObj.currencySymbol || 'đ';
    return `${priceVal.toLocaleString('vi-VN')}${currency}${unit ? ' / ' + unit : ''}`;
  };

  const extractPriceInfo = (product) => {
    let priceObj = product.price;
    let priceDisplay = '';
    let priceValue = 0;
    
    if (priceObj && typeof priceObj === 'object') {
      priceValue = priceObj.price || priceObj.value || 0;
      priceDisplay = formatPriceDisplay(priceObj, priceValue);
    } else if (product.prices?.length > 0) {
      priceObj = product.prices[0];
      priceValue = priceObj.price || 0;
      priceDisplay = formatPriceDisplay(priceObj, priceValue);
    }
    
    return { priceObj, priceDisplay, priceValue };
  };

  window.DataScraperAPI = {
    formatProduct: (product) => {
      if (!product?.sku) return null;

      const { priceObj, priceDisplay, priceValue } = extractPriceInfo(product);

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

    parseResponse: (data) => {
      if (Array.isArray(data)) {
        return data.flatMap(item => 
          item.products || (item.sku ? [item] : [])
        );
      }
      return data.products || data.data || data.items || [];
    },

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
      const categorySlug = category || window.location.pathname.match(/\/([^\/]+)(?:\/|$)/)?.[1];

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
          const products = this.parseResponse(data);

          if (products.length === 0) break;

          const formatted = products
            .filter(p => p?.sku)
            .map(p => this.formatProduct(p))
            .filter(p => p !== null);

          if (formatted.length === 0) break;

          allProducts.push(...formatted);

          if (formatted.length < pageSize || allProducts.length >= maxProducts) break;

          skipCount += pageSize;
          await new Promise(r => setTimeout(r, 500));
        } catch (error) {
          break;
        }
      }

      return allProducts.slice(0, maxProducts);
    },

    scrapeProductDetailBySKU: async (sku) => {
      if (!sku) return null;
      
      const apiEndpoints = [
        `https://api.nhathuoclongchau.com.vn/lccus/prod-cms/api/v2/tips/product/sku?sku=${sku}`,
        `https://api.nhathuoclongchau.com.vn/lccus/search-product-service/api/products/ecom/product/detail?sku=${sku}`,
        `https://api.nhathuoclongchau.com.vn/api/product/${sku}`
      ];

      for (const apiUrl of apiEndpoints) {
        try {
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });

          if (!response.ok) continue;

          const data = await response.json();
          
          let productData = null;
          if (data.data && data.data.sku) {
            productData = data.data;
          } else if (data.sku) {
            productData = data;
          } else if (data.product && data.product.sku) {
            productData = data.product;
          }

          if (productData && productData.sku) {
            return this.formatProductDetail(productData);
          }
        } catch (error) {
          continue;
        }
      }

      return null;
    },

    formatProductDetail: (product) => {
      if (!product?.sku) return null;

      let { priceObj, priceDisplay, priceValue } = extractPriceInfo(product);
      
      if (!priceDisplay && product.priceDisplay) {
        priceDisplay = product.priceDisplay;
        priceValue = product.priceValue || 0;
      }
      
      if (!priceDisplay || priceDisplay.trim() === '') {
        priceDisplay = 'CONSULT';
      }

      const category = Array.isArray(product.category) ? product.category : [];
      const categoryPath = category.length > 0 
        ? category.map(c => c.name || c).join(' > ') 
        : (product.categoryPath || '');
      const categorySlug = category.length > 0
        ? category.map(c => c.slug || c).join('/')
        : (product.categorySlug || '');

      let mainImage = '';
      let images = [];
      if (product.image) {
        mainImage = product.image;
      } else if (product.mainImage) {
        mainImage = product.mainImage;
      } else if (Array.isArray(product.images) && product.images.length > 0) {
        mainImage = product.images[0];
      } else if (Array.isArray(product.gallery) && product.gallery.length > 0) {
        mainImage = product.gallery[0];
      }
      
      if (!mainImage && typeof window !== 'undefined' && window.location.href.includes('.html')) {
        const DOMUtils = window.DataScraperDOMUtils;
        if (DOMUtils) {
          const imgSelectors = [
            'img[src*="cdn.nhathuoclongchau.com.vn"]',
            'img[class*="product-image"]',
            'img[class*="main-image"]',
            'img[src*="product"]'
          ];
          
          for (const sel of imgSelectors) {
            const img = DOMUtils.safeQuery(sel);
            if (img && img.src && img.src.includes('cdn.nhathuoclongchau.com.vn') && !img.src.includes('Badge')) {
              mainImage = img.src;
              break;
            }
          }
          
          if (mainImage) {
            const allImgs = DOMUtils.safeQueryAll('img[src*="cdn.nhathuoclongchau.com.vn"]');
            images = allImgs
              .map(img => img.src)
              .filter(src => src && !src.includes('Badge') && !src.includes('smalls'))
              .filter((src, idx, arr) => arr.indexOf(src) === idx);
          }
        }
      }
      
      if (!mainImage) {
        mainImage = product.image || product.mainImage || '';
      }
      if (images.length === 0) {
        images = Array.isArray(product.images) 
          ? product.images 
          : (Array.isArray(product.gallery) ? product.gallery : (mainImage ? [mainImage] : []));
      }

      let specifications = {};
      if (product.specification && typeof product.specification === 'object' && product.specification !== null) {
        specifications = product.specification;
      } else if (product.specification && typeof product.specification === 'string') {
        try {
          specifications = JSON.parse(product.specification);
        } catch (e) {
          specifications = { 'Thông số kỹ thuật': product.specification };
        }
      }

      const packageSize = specifications['Quy cách'] || product.packaging || product.packageSize || '';
      const rating = product.rating || product.averageRating || '';
      const reviewCount = product.reviewCount || product.totalReviews || '';
      const commentCount = product.commentCount || product.totalComments || '';
      const reviews = reviewCount && commentCount 
        ? `${reviewCount} đánh giá, ${commentCount} bình luận` 
        : '';

      const description = product.fullDescription || product.shortDescription || product.description || product.content || null;
      
      let ingredients = '';
      
      // Chỉ kiểm tra các field chính xác đã được cung cấp
      if (product.ingredients) {
        if (Array.isArray(product.ingredients)) {
          const names = product.ingredients
            .map(item => {
              if (typeof item === 'string') return item.trim();
              if (typeof item === 'object' && item !== null) {
                return (item.name || item.ingredientName || '').trim();
              }
              return String(item).trim();
            })
            .filter(name => name && name.length > 0);
          ingredients = names.length > 0 ? names.join(', ') : '';
        } else if (typeof product.ingredients === 'string') {
          ingredients = product.ingredients.trim();
        }
      }
      
      if (!ingredients && product.composition) {
        if (Array.isArray(product.composition)) {
          const names = product.composition
            .map(item => {
              if (typeof item === 'string') return item.trim();
              if (typeof item === 'object' && item !== null) {
                return (item.name || item.ingredientName || '').trim();
              }
              return String(item).trim();
            })
            .filter(name => name && name.length > 0);
          ingredients = names.length > 0 ? names.join(', ') : '';
        } else if (typeof product.composition === 'string') {
          ingredients = product.composition.trim();
        }
      }
      
      if (!ingredients && specifications['Thành phần']) {
        const specIngredient = specifications['Thành phần'];
        if (typeof specIngredient === 'string') {
          ingredients = specIngredient.trim();
        } else if (Array.isArray(specIngredient)) {
          const names = specIngredient.map(s => String(s).trim()).filter(s => s);
          ingredients = names.length > 0 ? names.join(', ') : '';
        }
      }
      
      if (!ingredients && typeof window !== 'undefined' && window.location.href.includes('.html')) {
        const DOMUtils = window.DataScraperDOMUtils;
        if (DOMUtils) {
          const ingredientSection = DOMUtils.safeQuery('.ingredient');
          if (ingredientSection) {
            const table = DOMUtils.safeQuery('table', ingredientSection);
            if (table) {
              const rows = DOMUtils.safeQueryAll('tr', table);
              const ingredientList = [];
              
              rows.forEach(row => {
                const cells = DOMUtils.safeQueryAll('td', row);
                if (cells.length > 0) {
                  const name = DOMUtils.getText(cells[0]).trim();
                  if (name && 
                      name.length > 2 &&
                      !name.match(/^(Thông tin thành phần|Hàm lượng|Thành phần cho)/i)) {
                    ingredientList.push(name);
                  }
                }
              });
              
              if (ingredientList.length > 0) {
                ingredients = ingredientList.join(', ');
              }
            }
          }
        }
      }
      
      const usage = product.indications || product.uses || null;
      const dosage = product.dosage || product.usage || null;
      const adverseEffect = product.contraindications || product.warnings || null;
      const careful = null;
      const preservation = product.storage || null;
      const slug = product.slug || '';
      const link = slug ? `https://nhathuoclongchau.com.vn/${slug}` : '';
      const url = link || window.location.href;

      // Extract package options from API prices array
      const packageOptions = [];
      if (Array.isArray(product.prices) && product.prices.length > 0) {
        product.prices.forEach((priceObj, index) => {
          const unitName = priceObj.measureUnitName || priceObj.unit || '';
          const unitCode = unitName.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .replace(/^(hop|hoop)$/i, 'hop')
            .replace(/^(vi|vỉ)$/i, 'vi')
            .replace(/^(vien|viên)$/i, 'vien')
            .replace(/^(goi|gói)$/i, 'goi')
            .replace(/^(chai)$/i, 'chai')
            .replace(/^(tuyp|tuýp)$/i, 'tuyp')
            || `option${index}`;
          
          const priceVal = priceObj.price || priceObj.value || 0;
          const currency = priceObj.currencySymbol || '₫';
          const priceStr = `${priceVal.toLocaleString('vi-VN')}${currency}`;
          const priceDisplayStr = `${priceStr}${unitName ? ' / ' + unitName : ''}`;
          
          packageOptions.push({
            unit: unitCode,
            unitDisplay: unitName || '',
            price: priceStr,
            priceDisplay: priceDisplayStr,
            priceValue: priceVal,
            specification: packageSize || '',
            isDefault: index === 0,
            isAvailable: true,
            conversion: null
          });
        });
      } else if (priceObj && typeof priceObj === 'object') {
        // Single price object - convert to packageOptions
        const unitName = priceObj.measureUnitName || priceObj.unit || packageSize || '';
        const unitCode = unitName.toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .replace(/^(hop|hoop)$/i, 'hop')
          .replace(/^(vi|vỉ)$/i, 'vi')
          .replace(/^(vien|viên)$/i, 'vien')
          || 'default';
        
        packageOptions.push({
          unit: unitCode,
          unitDisplay: unitName || '',
          price: priceDisplay || '',
          priceDisplay: priceDisplay || '',
          priceValue: priceValue || 0,
          specification: packageSize || '',
          isDefault: true,
          isAvailable: true,
          conversion: null
        });
      }

      const flatProduct = {
        name: product.name || product.webName || '',
        sku: product.sku || '',
        brand: product.brand || product.brandName || '',
        price: priceDisplay || '',
        packageSize: packageSize || '',
        rating: rating ? String(rating) : '',
        reviewCount: reviewCount ? String(reviewCount) : '',
        commentCount: commentCount ? String(commentCount) : '',
        reviews: reviews || '',
        category: Array.isArray(category) && category.length > 0 ? category : [],
        categoryPath: categoryPath || '',
        categorySlug: categorySlug || '',
        image: mainImage || '',
        images: Array.isArray(images) && images.length > 0 
          ? images.filter(img => img && typeof img === 'string' && img.trim())
          : [],
        description: description ? description.trim() : '',
        ingredients: ingredients || '',
        usage: usage ? usage.trim() : '',
        dosage: dosage ? dosage.trim() : '',
        adverseEffect: adverseEffect ? adverseEffect.trim() : '',
        careful: careful ? careful.trim() : '',
        preservation: preservation ? preservation.trim() : '',
        registrationNumber: specifications['Số đăng ký'] ? String(specifications['Số đăng ký']).trim() : '',
        origin: specifications['Xuất xứ thương hiệu'] ? String(specifications['Xuất xứ thương hiệu']).trim() : '',
        manufacturer: specifications['Nhà sản xuất'] ? String(specifications['Nhà sản xuất']).trim() : '',
        shelfLife: specifications['Hạn sử dụng'] ? String(specifications['Hạn sử dụng']).trim() : '',
        specifications: specifications,
        link: link || '',
        webName: product.webName || product.name || '',
        slug: slug || '',
        prices: Array.isArray(product.prices) ? product.prices : [],
        priceObj: priceObj || null,
        priceValue: priceValue || 0,
        packageOptions: packageOptions,
        productRanking: product.productRanking || 0,
        displayCode: product.displayCode || 1,
        isPublish: product.isPublish !== undefined ? product.isPublish : true
      };
      
      const ProductFormatter = window.DataScraperProductFormatter;
      return ProductFormatter ? ProductFormatter.formatProductDetail(flatProduct) : flatProduct;
    }
  };
})();

