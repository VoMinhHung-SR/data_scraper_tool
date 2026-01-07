# Dynamic Filters Feature

Tính năng Dynamic Filters cho phép tạo bộ lọc động dựa trên các variants (biến thể) của từng category trong dữ liệu sản phẩm.

## Tổng quan

Dynamic Filters tự động phân tích dữ liệu CSV và tạo các bộ lọc phù hợp cho từng category, bao gồm:
- **Thương hiệu (Brand)**: Danh sách các thương hiệu có trong category
- **Xuất xứ thương hiệu (Brand Origin)**: Danh sách các nước xuất xứ
- **Nước sản xuất (Manufacturer)**: Danh sách các nhà sản xuất
- **Giá bán (Price Range)**: Các khoảng giá phổ biến trong category

## Cấu trúc Module

### 1. `core/filter-analyzer.js`
Module phân tích dữ liệu CSV để extract các filter variants:
- Parse CSV files
- Extract category information
- Analyze products và group theo category
- Tính toán statistics (min, max, average, median price)

### 2. `core/dynamic-filter-generator.js`
Module tạo filter configurations:
- Generate filter config cho từng category
- Tạo filter options với labels và metadata
- Support subcategory filters

### 3. `core/filter-query-utils.js`
Utilities để query và filter products:
- Match products với filter criteria
- Filter products array
- Calculate filter counts
- Build filter criteria từ user selections

### 4. `core/filter-router.js`
Module xử lý routing và trả về filter configurations:
- Load filter config từ JSON file
- Extract category từ URL path
- Trả về filter config phù hợp với route
- Support fallback to parent category
- Cache filter configs

### 5. `generate-dynamic-filters.js`
Script Node.js để generate filter config từ CSV data:
- Đọc tất cả CSV files trong một category directory
- Analyze products và extract variants
- Generate filter configurations
- Export ra JSON file

## Cách sử dụng

### Generate Filter Config

```bash
node generate-dynamic-filters.js <category-directory> [output-file]
```

Ví dụ:
```bash
node generate-dynamic-filters.js test/data/new/duoc-mi-pham
```

Script sẽ:
1. Đọc tất cả CSV files trong thư mục
2. Phân tích products và extract variants
3. Tạo filter configurations cho mỗi category
4. Lưu kết quả vào `dynamic-filters.json`

### Output Format

File `dynamic-filters.json` có cấu trúc:

```json
{
  "metadata": {
    "generatedAt": "2026-01-07T08:37:23.258Z",
    "categoryDirectory": "test/data/new/duoc-mi-pham",
    "totalProducts": 624,
    "totalCategories": 39
  },
  "globalVariants": {
    "brands": [...],
    "origins": [...],
    "manufacturers": [...],
    "priceRanges": [...]
  },
  "categoryFilters": {
    "duoc-my-pham/cham-soc-co-the": {
      "categorySlug": "duoc-my-pham/cham-soc-co-the",
      "filters": [
        {
          "id": "brand",
          "type": "checkbox",
          "label": "Thương hiệu",
          "field": "basicInfo.brand",
          "searchable": true,
          "options": [
            {
              "value": "PURE",
              "label": "PURE",
              "count": null
            }
          ],
          "showMore": true
        },
        {
          "id": "priceRange",
          "type": "button",
          "label": "Giá bán",
          "field": "pricing.currentPriceValue",
          "options": [
            {
              "value": "under_100k",
              "label": "Dưới 100.000₫",
              "min": 0,
              "max": 100000
            }
          ],
          "priceStats": {
            "min": 49500,
            "max": 500000,
            "average": 150000,
            "median": 120000
          }
        }
      ],
      "metadata": {
        "productCount": 81,
        "lastUpdated": "2026-01-07T08:37:23.258Z"
      }
    }
  }
}
```

### Sử dụng trong Code

#### Routing và Load Filter Config

**Cách 1: Sử dụng Filter Router (Recommended)**

```javascript
const FilterRouter = window.DataScraperFilterRouter;

// Load filter config (có cache tự động)
const filterConfig = await FilterRouter.loadFilterConfig(
  '/test/data/new/duoc-mi-pham/dynamic-filters.json'
);

// Lấy category từ URL hiện tại
const categorySlug = FilterRouter.getCategoryFromCurrentURL();
// Hoặc từ URL path cụ thể
const categorySlug = FilterRouter.extractCategoryFromPath('/duoc-my-pham/cham-soc-co-the');

// Lấy filter config cho category
const categoryFilters = FilterRouter.getFiltersForCategory(
  filterConfig, 
  categorySlug,
  {
    includeGlobal: true,      // Fallback to global filters nếu không tìm thấy
    fallbackToParent: true    // Fallback to parent category nếu không tìm thấy
  }
);

// Hoặc lấy trực tiếp từ route
const routeFilters = await FilterRouter.getFiltersForRoute(
  filterConfig,
  '/duoc-my-pham/cham-soc-co-the',
  { includeGlobal: true, fallbackToParent: true }
);
```

**Cách 2: Load trực tiếp (Node.js)**

```javascript
const filterConfig = require('./test/data/new/duoc-mi-pham/dynamic-filters.json');
const categorySlug = 'duoc-my-pham/cham-soc-co-the';
const config = filterConfig.categoryFilters[categorySlug];
```

**Ví dụ: API Endpoint trả về filters**

```javascript
// Express.js example
app.get('/api/filters/:category*?', async (req, res) => {
  try {
    const FilterRouter = window.DataScraperFilterRouter;
    
    // Load filter config
    const filterConfig = await FilterRouter.loadFilterConfig(
      './test/data/new/duoc-mi-pham/dynamic-filters.json'
    );
    
    // Extract category from route
    const categoryPath = req.params.category || '';
    const categorySlug = FilterRouter.extractCategoryFromPath(categoryPath);
    
    // Get filters for category
    const filters = FilterRouter.getFiltersForCategory(
      filterConfig,
      categorySlug,
      {
        includeGlobal: true,
        fallbackToParent: true
      }
    );
    
    if (!filters) {
      return res.status(404).json({ 
        error: 'Category not found',
        categorySlug 
      });
    }
    
    res.json({
      success: true,
      categorySlug,
      filters: filters.filters,
      metadata: filters.metadata
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Ví dụ: React Component**

```javascript
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

function FilterPanel() {
  const { category } = useParams();
  const [filters, setFilters] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFilters() {
      const FilterRouter = window.DataScraperFilterRouter;
      
      // Load filter config
      const filterConfig = await FilterRouter.loadFilterConfig(
        '/api/filters-config.json'
      );
      
      // Get filters for current category
      const categoryFilters = FilterRouter.getFiltersForCategory(
        filterConfig,
        category || '',
        { includeGlobal: true, fallbackToParent: true }
      );
      
      setFilters(categoryFilters);
      setLoading(false);
    }
    
    loadFilters();
  }, [category]);

  if (loading) return <div>Loading filters...</div>;
  if (!filters) return <div>No filters available</div>;

  return (
    <div className="filter-panel">
      <h3>Bộ lọc nâng cao</h3>
      {filters.filters.map(filter => (
        <FilterSection key={filter.id} filter={filter} />
      ))}
    </div>
  );
}
```

#### Filter Products

```javascript
const FilterQueryUtils = window.DataScraperFilterQueryUtils;

// Build filter criteria từ user selections
const selections = {
  brand: ['PURE', 'Saforelle'],
  priceRange: ['under_100k', '100k_to_300k']
};

const criteria = FilterQueryUtils.buildFilterCriteria(config, selections);

// Filter products
const filteredProducts = FilterQueryUtils.filterProducts(products, criteria);
```

#### Calculate Filter Counts

```javascript
// Update filter config với product counts
const configWithCounts = FilterQueryUtils.calculateFilterCounts(products, config);
```

## Filter Types

### Checkbox Filters
- **Brand**: Thương hiệu
- **Brand Origin**: Xuất xứ thương hiệu
- **Manufacturer**: Nước sản xuất

### Button Filters
- **Price Range**: Giá bán (Dưới 100k, 100k-300k, 300k-500k, Trên 500k)

## Price Ranges

- `under_100k`: Dưới 100.000₫
- `100k_to_300k`: 100.000₫ đến 300.000₫
- `300k_to_500k`: 300.000₫ đến 500.000₫
- `over_500k`: Trên 500.000₫

## Routing Examples

### URL Patterns và Category Mapping

| URL Path | Category Slug | Filter Source |
|----------|--------------|---------------|
| `/duoc-my-pham` | `duoc-my-pham` | Exact match |
| `/duoc-my-pham/cham-soc-co-the` | `duoc-my-pham/cham-soc-co-the` | Exact match |
| `/duoc-my-pham/cham-soc-co-the/dung-dich-ve-sinh-phu-nu` | `duoc-my-pham/cham-soc-co-the/dung-dich-ve-sinh-phu-nu` | Exact match, fallback to parent |
| `/unknown-category` | `unknown-category` | Fallback to global (if enabled) |

### Response Format

Khi trả về filters qua API, format nên như sau:

```json
{
  "success": true,
  "categorySlug": "duoc-my-pham/cham-soc-co-the",
  "filters": [
    {
      "id": "brand",
      "type": "checkbox",
      "label": "Thương hiệu",
      "field": "basicInfo.brand",
      "searchable": true,
      "options": [
        {
          "value": "PURE",
          "label": "PURE",
          "count": 15
        }
      ],
      "showMore": true
    }
  ],
  "metadata": {
    "productCount": 81,
    "lastUpdated": "2026-01-07T08:37:23.258Z",
    "isGlobal": false
  }
}
```

### Error Handling

```javascript
const FilterRouter = window.DataScraperFilterRouter;

try {
  const filterConfig = await FilterRouter.loadFilterConfig('/path/to/filters.json');
  const filters = FilterRouter.getFiltersForCategory(
    filterConfig,
    categorySlug,
    { includeGlobal: false, fallbackToParent: false }
  );
  
  if (!filters) {
    // Category không tồn tại
    console.warn(`Category "${categorySlug}" not found`);
    // Có thể trả về empty filters hoặc error
    return { filters: [], error: 'Category not found' };
  }
  
  return { filters: filters.filters, metadata: filters.metadata };
} catch (error) {
  console.error('Error loading filters:', error);
  return { filters: [], error: error.message };
}
```

## Notes

- Filters được generate dựa trên dữ liệu thực tế trong CSV files
- Mỗi category có filter riêng phù hợp với variants của nó
- Filter counts có thể được tính toán động khi có products data
- Script tự động loại bỏ các filter options có ít hơn `minItemsPerFilter` items (mặc định: 1)
- Filter Router có cache tự động để tránh load lại config nhiều lần
- Khi category không tồn tại, có thể fallback về parent category hoặc global filters