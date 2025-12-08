(() => {
  'use strict';

  // ============================================
  // 📊 BASE SCRAPER
  // ============================================
  // Basic scraping functions: selector, table, links, images, custom
  window.DataScraperBaseScraper = {
    /**
     * Scrape by CSS selector
     * @param {string} selector - CSS selector
     * @param {Object} options - Options
     * @returns {Array|Object|null}
     */
    scrapeBySelector: (selector, options = {}) => {
      const Utils = window.DataScraperUtils;
      const log = window.DataScraperLog;
      const { attribute = null, textContent = true, multiple = true, filter = null } = options;

      try {
        const elements = Utils.safeQueryAll(selector);
        if (!elements.length) {
          log(`Không tìm thấy element với selector: ${selector}`, '⚠️');
          return [];
        }

        const results = elements.map(el => {
          let value = null;
          if (attribute) {
            value = el.getAttribute(attribute);
          } else if (textContent) {
            value = Utils.getText(el);
          } else {
            value = el.innerHTML?.trim() || '';
          }

          return {
            selector,
            value,
            html: el.outerHTML.substring(0, 200)
          };
        });

        const filtered = filter ? results.filter(filter) : results;
        log(`Scraped ${filtered.length} items từ ${selector}`, '📊');
        return multiple ? filtered : filtered[0];
      } catch (error) {
        log(`Lỗi khi scrape ${selector}: ${error.message}`, '❌');
        return multiple ? [] : null;
      }
    },

    /**
     * Scrape table data
     * @param {string} tableSelector - Table selector
     * @returns {Array}
     */
    scrapeTable: (tableSelector = 'table') => {
      const Utils = window.DataScraperUtils;
      const log = window.DataScraperLog;
      
      try {
        const table = Utils.safeQuery(tableSelector);
        if (!table) {
          log(`Không tìm thấy table với selector: ${tableSelector}`, '⚠️');
          return [];
        }

        const headers = Utils.safeQueryAll('thead th, thead td, tr:first-child th, tr:first-child td', table)
          .map(th => Utils.getText(th));

        const rows = Utils.safeQueryAll('tbody tr, tr:not(:first-child)', table)
          .map(tr => {
            const cells = Utils.safeQueryAll('td, th', tr).map(td => Utils.getText(td));
            
            if (headers.length) {
              const rowObj = {};
              headers.forEach((header, idx) => {
                rowObj[header || `Column${idx + 1}`] = cells[idx] || '';
              });
              return rowObj;
            }
            return cells;
          });

        log(`Scraped ${rows.length} rows từ table`, '📊');
        return rows;
      } catch (error) {
        log(`Lỗi khi scrape table: ${error.message}`, '❌');
        return [];
      }
    },

    /**
     * Scrape links
     * @param {string} containerSelector - Container selector
     * @returns {Array}
     */
    scrapeLinks: (containerSelector = 'body') => {
      const Utils = window.DataScraperUtils;
      const log = window.DataScraperLog;
      
      try {
        const container = Utils.safeQuery(containerSelector) || document.body;
        const links = Utils.safeQueryAll('a[href]', container)
          .map(a => ({
            text: Utils.getText(a),
            href: a.href,
            title: a.title || ''
          }))
          .filter(link => link.href && !link.href.startsWith('javascript:'));

        log(`Scraped ${links.length} links`, '🔗');
        return links;
      } catch (error) {
        log(`Lỗi khi scrape links: ${error.message}`, '❌');
        return [];
      }
    },

    /**
     * Scrape images
     * @param {string} containerSelector - Container selector
     * @returns {Array}
     */
    scrapeImages: (containerSelector = 'body') => {
      const Utils = window.DataScraperUtils;
      const log = window.DataScraperLog;
      
      try {
        const container = Utils.safeQuery(containerSelector) || document.body;
        const images = Utils.safeQueryAll('img[src]', container)
          .map(img => ({
            src: img.src,
            alt: img.alt || '',
            title: img.title || '',
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height
          }))
          .filter(img => img.src);

        log(`Scraped ${images.length} images`, '🖼️');
        return images;
      } catch (error) {
        log(`Lỗi khi scrape images: ${error.message}`, '❌');
        return [];
      }
    },

    /**
     * Scrape custom data with config
     * @param {Object} config - Configuration object
     * @returns {Array}
     */
    scrapeCustom: (config) => {
      const Utils = window.DataScraperUtils;
      const log = window.DataScraperLog;
      
      try {
        const { selectors, type = 'object' } = config;
        const results = [];

        if (type === 'list') {
          const container = Utils.safeQuery(selectors.container);
          if (!container) return [];

          const items = Utils.safeQueryAll(selectors.item, container);
          items.forEach(item => {
            const data = {};
            Object.keys(selectors.fields).forEach(key => {
              const fieldSelector = selectors.fields[key];
              const element = Utils.safeQuery(fieldSelector, item);
              data[key] = element?.textContent?.trim() || element?.getAttribute('href') || '';
            });
            results.push(data);
          });
        } else {
          const data = {};
          Object.keys(selectors).forEach(key => {
            const element = Utils.safeQuery(selectors[key]);
            data[key] = element?.textContent?.trim() || element?.getAttribute('href') || element?.src || '';
          });
          results.push(data);
        }

        log(`Scraped ${results.length} custom items`, '📊');
        return results;
      } catch (error) {
        log(`Lỗi khi scrape custom: ${error.message}`, '❌');
        return [];
      }
    }
  };
})();

