(() => {
  'use strict';

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

      const pricing = {
        price: data.pricing?.price || data.price || data.currentPrice || '',
        priceDisplay: priceDisplay,
        priceValue: data.pricing?.priceValue !== undefined ? data.pricing.priceValue : (data.priceValue || data.currentPriceValue || 0),
        currentPrice: data.pricing?.currentPrice || data.currentPrice || data.price || '',
        currentPriceValue: data.pricing?.currentPriceValue !== undefined ? data.pricing.currentPriceValue : (data.currentPriceValue || data.priceValue || 0),
        originalPrice: data.pricing?.originalPrice || data.originalPrice || '',
        originalPriceValue: data.pricing?.originalPriceValue !== undefined ? data.pricing.originalPriceValue : (data.originalPriceValue || 0),
        discount: data.pricing?.discount !== undefined ? data.pricing.discount : (data.discount || 0),
        discountPercent: data.pricing?.discountPercent !== undefined ? data.pricing.discountPercent : (data.discountPercent || 0),
        packageSize: data.pricing?.packageSize || data.packageSize || '',
        prices: Array.isArray(data.pricing?.prices) ? data.pricing.prices : (Array.isArray(data.prices) ? data.prices : []),
        priceObj: data.pricing?.priceObj || data.priceObj || null,
        packageOptions: Array.isArray(data.pricing?.packageOptions) ? data.pricing.packageOptions : (Array.isArray(data.packageOptions) ? data.packageOptions : [])
      };

      const rating = {
        rating: data.rating?.rating || data.rating || '',
        reviewCount: data.rating?.reviewCount || data.reviewCount || '',
        commentCount: data.rating?.commentCount || data.commentCount || '',
        reviews: data.rating?.reviews || data.reviews || ''
      };

      const category = {
        category: Array.isArray(data.category?.category) ? data.category.category : (Array.isArray(data.category) ? data.category : []),
        categoryPath: data.category?.categoryPath || data.categoryPath || '',
        categorySlug: data.category?.categorySlug || data.categorySlug || ''
      };

      const media = {
        image: data.media?.image || data.image || '',
        images: Array.isArray(data.media?.images) ? data.media.images : (Array.isArray(data.images) ? data.images : (data.image ? [data.image] : []))
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
        link: data.metadata?.link || data.link || '',
        productRanking: data.metadata?.productRanking !== undefined ? data.metadata.productRanking : (data.productRanking || 0),
        displayCode: data.metadata?.displayCode !== undefined ? data.metadata.displayCode : (data.displayCode || 1),
        isPublish: data.metadata?.isPublish !== undefined ? data.metadata.isPublish : (data.isPublish !== undefined ? data.isPublish : true)
      };

      return {
        basicInfo,
        pricing,
        rating,
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
        isPublish: groupedData.metadata?.isPublish !== undefined ? groupedData.metadata.isPublish : true
      };
    }
  };
})();

