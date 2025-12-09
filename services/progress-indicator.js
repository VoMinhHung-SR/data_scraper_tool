(() => {
  'use strict';

  // ============================================
  // 🔄 PROGRESS INDICATOR (Website overlay)
  // ============================================
  window.DataScraperProgressIndicator = {
    indicator: null,
    progressCircle: null,
    progressText: null,
    checkIcon: null,

    /**
     * Create progress indicator
     */
    create: function() {
      // Remove existing if any
      this.remove();

      // Create container
      this.indicator = document.createElement('div');
      this.indicator.id = 'dataScraperProgressIndicator';
      this.indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        z-index: 999999;
        background: white;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.3s ease;
      `;

      // Create SVG for circular progress
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '60');
      svg.setAttribute('height', '60');
      svg.style.cssText = 'transform: rotate(-90deg); position: absolute;';

      // Background circle
      const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bgCircle.setAttribute('cx', '30');
      bgCircle.setAttribute('cy', '30');
      bgCircle.setAttribute('r', '25');
      bgCircle.setAttribute('fill', 'none');
      bgCircle.setAttribute('stroke', '#e0e0e0');
      bgCircle.setAttribute('stroke-width', '4');
      svg.appendChild(bgCircle);

      // Progress circle
      this.progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      this.progressCircle.setAttribute('cx', '30');
      this.progressCircle.setAttribute('cy', '30');
      this.progressCircle.setAttribute('r', '25');
      this.progressCircle.setAttribute('fill', 'none');
      this.progressCircle.setAttribute('stroke', '#667eea');
      this.progressCircle.setAttribute('stroke-width', '4');
      this.progressCircle.setAttribute('stroke-linecap', 'round');
      this.progressCircle.setAttribute('stroke-dasharray', '157'); // 2 * PI * 25
      this.progressCircle.setAttribute('stroke-dashoffset', '157');
      this.progressCircle.style.cssText = 'transition: stroke-dashoffset 0.3s ease;';
      svg.appendChild(this.progressCircle);

      this.indicator.appendChild(svg);

      // Progress text
      this.progressText = document.createElement('div');
      this.progressText.style.cssText = `
        position: absolute;
        font-size: 12px;
        font-weight: 600;
        color: #667eea;
        z-index: 1;
      `;
      this.progressText.textContent = '0%';
      this.indicator.appendChild(this.progressText);

      // Check icon (hidden initially)
      this.checkIcon = document.createElement('div');
      this.checkIcon.style.cssText = `
        position: absolute;
        font-size: 24px;
        color: #4CAF50;
        display: none;
        z-index: 2;
      `;
      this.checkIcon.textContent = '✓';
      this.indicator.appendChild(this.checkIcon);

      // Add to body
      document.body.appendChild(this.indicator);

      // Click to remove
      this.indicator.addEventListener('click', () => {
        this.remove();
      });
    },

    /**
     * Update progress (0-100)
     */
    update: function(percent) {
      if (!this.indicator) {
        this.create();
      }

      const clampedPercent = Math.min(100, Math.max(0, percent));
      const offset = 157 - (157 * clampedPercent / 100);

      if (this.progressCircle) {
        this.progressCircle.setAttribute('stroke-dashoffset', offset);
      }

      if (this.progressText) {
        this.progressText.textContent = Math.round(clampedPercent) + '%';
      }

      // Change color based on progress
      if (this.progressCircle) {
        if (clampedPercent >= 100) {
          this.progressCircle.setAttribute('stroke', '#4CAF50');
        } else if (clampedPercent >= 50) {
          this.progressCircle.setAttribute('stroke', '#2196F3');
        } else {
          this.progressCircle.setAttribute('stroke', '#667eea');
        }
      }
    },

    /**
     * Show completion (checkmark)
     */
    complete: function() {
      if (!this.indicator) return;

      this.update(100);

      // Hide progress text, show check icon
      if (this.progressText) {
        this.progressText.style.display = 'none';
      }

      if (this.checkIcon) {
        this.checkIcon.style.display = 'block';
      }

      // Auto remove after 3 seconds
      setTimeout(() => {
        this.remove();
      }, 3000);
    },

    /**
     * Remove indicator
     */
    remove: function() {
      if (this.indicator && this.indicator.parentNode) {
        this.indicator.parentNode.removeChild(this.indicator);
      }
      this.indicator = null;
      this.progressCircle = null;
      this.progressText = null;
      this.checkIcon = null;
    }
  };
})();

