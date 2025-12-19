/**
 * Export với data thực tế từ PopupState hoặc data.test
 * Chạy trong console của popup extension
 */

console.log('🚀 Export Real Data - Starting...\n');

(async function() {
  try {
    // Step 1: Try to get data from PopupState first
    console.log('📋 Step 1: Getting data from PopupState...');
    let realData = null;
    
    if (window.PopupState && typeof window.PopupState.getData === 'function') {
      realData = window.PopupState.getData();
      console.log(`✅ Found ${Array.isArray(realData) ? realData.length : 0} items in PopupState`);
      
      if (!realData || !Array.isArray(realData) || realData.length === 0) {
        console.log('⚠️  PopupState is empty, trying to load from data.test...');
        realData = null;
      }
    } else {
      console.log('⚠️  PopupState.getData not available, trying to load from data.test...');
    }
    
    // Step 2: If no data in PopupState, load from data.test
    if (!realData || realData.length === 0) {
      console.log('\n📋 Step 2: Loading data from test/data.test...');
      try {
        const url = chrome.runtime.getURL('test/data.test');
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const text = await response.text();
        realData = JSON.parse(text);
        console.log(`✅ Loaded ${realData.length} items from data.test`);
      } catch (error) {
        console.error('❌ Error loading data.test:', error);
        console.log('💡 Make sure manifest.json has web_accessible_resources for test/data.test');
        return;
      }
    }
    
    // Step 3: Verify data
    if (!realData || !Array.isArray(realData) || realData.length === 0) {
      console.error('❌ No data available to export!');
      return;
    }
    
    console.log(`\n✅ Ready to export ${realData.length} items`);
    console.log('📊 Sample item structure:', Object.keys(realData[0] || {}).join(', '));
    
    // Step 4: Check ExportHandler
    if (!window.DataScraperExportHandler) {
      console.error('❌ ExportHandler not found!');
      return;
    }
    
    // Step 5: Mock PopupDisplay
    if (!window.PopupDisplay) {
      window.PopupDisplay = {
        showMessage: (msg, type) => {
          const colors = {
            success: 'color: #4CAF50; font-weight: bold;',
            error: 'color: #f44336; font-weight: bold;',
            warning: 'color: #ff9800; font-weight: bold;',
            loading: 'color: #2196F3; font-weight: bold;',
            info: 'color: #2196F3;'
          };
          console.log(`%c[${type.toUpperCase()}] ${msg}`, colors[type] || '');
        }
      };
    }
    
    // Step 6: Export (simple - no tracking to avoid crash)
    console.log(`\n🚀 Exporting ${realData.length} items to CSV...`);
    console.log('💡 This will trigger download. Check your Downloads folder after export completes.');
    console.log('💡 Press Ctrl+J to open Downloads page\n');
    
    const startTime = performance.now();
    
    try {
      window.DataScraperExportHandler.exportData('csv', realData);
      console.log('✅ Export command sent successfully');
      console.log('⏳ Waiting for download to complete...');
      
      // Simple check after delay
      setTimeout(() => {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`\n📊 Export Status (after ${elapsed}s):`);
        console.log('   💡 Check your Downloads folder for the CSV file');
        console.log('   💡 Press Ctrl+J to open Downloads page');
        console.log('   💡 File name should start with: scraped-data-');
        console.log(`   💡 Expected size: ~${(realData.length * 11).toFixed(0)} KB (approx)`);
        console.log(`   💡 Expected lines: ${realData.length + 1} (1 header + ${realData.length} data rows)`);
      }, 3000);
      
    } catch (error) {
      console.error('❌ Error during export:', error);
      console.error('Stack:', error.stack);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  }
})();

