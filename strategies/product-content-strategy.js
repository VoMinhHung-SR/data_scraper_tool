(() => {
  'use strict';

  // ============================================
  // PRODUCT CONTENT STRATEGY
  // ============================================
  // Owns extraction of all product "content" fields rendered in the
  // detail-content-* sections + the ingredients popup.
  //
  // Output contract (single object resolved by `extract`):
  //   - description, usage, dosage, adverseEffect, careful, preservation:
  //       sanitized HTML strings (allowed tags only, no scripts, no images,
  //       no inline styles or event handlers). Empty string when absent.
  //   - ingredients: comma-separated string "Name: amount, Name: amount, ..."
  //       — kept in this shape for backward compatibility with the FE parser
  //       at oupharmacy-store/src/components/products/ProductDescriptionSection.tsx
  //       (`parseIngredients`). Empty string when absent.
  //
  // Race-condition contract: every helper that mutates the page (popup
  // trigger clicks) is awaited before returning, and the popup is closed
  // again before `extract` resolves. Callers may safely run further DOM
  // reads after `await extract(...)` without seeing residual modal state.

  // ---------- HTML sanitization ----------
  // Tag allow-list: structural prose + tables. Crucially excludes
  // <img>, <picture>, <video>, <svg>, <iframe>, <script>, <style>.
  // Note: <A> intentionally NOT in this list. Source pages link to the
  // scraped vendor (Long Châu) — exposing those URLs would advertise the
  // source. Anchors are converted to <STRONG> below to preserve the
  // author's semantic emphasis on key terms (drug names, conditions, ...)
  // without leaking the external href.
  const ALLOWED_TAGS = new Set([
    'P', 'BR', 'BLOCKQUOTE',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'UL', 'OL', 'LI',
    'STRONG', 'B', 'EM', 'I', 'U', 'SUB', 'SUP', 'CODE',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
    'DIV', 'SPAN'
  ]);

  // Selector for elements removed wholesale, including all descendants.
  const STRIP_SELECTOR = [
    'script', 'style', 'iframe', 'link', 'meta',
    'form', 'input', 'select', 'textarea', 'button',
    'svg', 'audio', 'video', 'img', 'picture', 'source', 'track',
    'noscript', 'object', 'embed', 'canvas',
    '[class*="toggle"]', '[class*="collapse"]', '[class*="expand"]',
    '[aria-hidden="true"]'
  ].join(',');

  // Per-tag attribute allow-list. Anything else is dropped (including
  // class/style/data-*/id/event handlers). Defends against XSS even though
  // FE will sanitize again.
  // Anchors are removed before this is consulted, so no per-tag exception
  // is needed — every allowed tag ships zero attributes.
  const allowedAttrsFor = (_tagName) => {
    return new Set();
  };

  /**
   * Walk the cloned tree and apply sanitization rules in-place.
   *
   * Strategy: depth-first, post-order so we can `unwrap` unknown tags
   * after their children are already sanitized.
   */
  const sanitizeNode = (root) => {
    if (!root) return;

    // Phase 1: drop banned subtrees.
    root.querySelectorAll(STRIP_SELECTOR).forEach((el) => el.remove());

    // Phase 2: scrub attributes + transform anchors + unwrap unknown tags.
    // Snapshot to array because we mutate during iteration.
    const all = Array.from(root.querySelectorAll('*'));
    for (const el of all) {
      const tag = el.tagName;

      // Anchors → <strong>. Preserves author intent (these were highlighted
      // key terms) without leaking the source vendor's URL. Done BEFORE the
      // ALLOWED_TAGS check because <A> is intentionally excluded above.
      if (tag === 'A') {
        const parent = el.parentNode;
        if (!parent) continue;
        const ownerDoc = el.ownerDocument || document;
        const strong = ownerDoc.createElement('strong');
        while (el.firstChild) strong.appendChild(el.firstChild);
        parent.replaceChild(strong, el);
        continue;
      }

      if (!ALLOWED_TAGS.has(tag)) {
        // Unknown tag: replace the element with its children to keep the
        // text content visible without preserving its semantics.
        const parent = el.parentNode;
        if (!parent) continue;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        continue;
      }
      const allowedAttrs = allowedAttrsFor(tag);
      // Snapshot attributes; el.attributes is live.
      const attrs = Array.from(el.attributes);
      for (const a of attrs) {
        if (!allowedAttrs.has(a.name)) el.removeAttribute(a.name);
      }
    }
  };

  /**
   * Compact whitespace between tags + strip outer whitespace, without
   * collapsing whitespace inside <pre>/<code> (none in our pipeline).
   */
  const compactHtml = (html) => {
    if (!html) return '';
    return html
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();
  };

  /**
   * Resolve the section element by class first, falling back to id.
   * Matches the existing `findSectionByClassOrHeading` semantics so that
   * the heading-based tab labels still work.
   */
  const findSection = (className, headingPattern, fallbackId, Utils, Extractors) => {
    const sectionId = (Extractors && typeof Extractors.findSectionByClassOrHeading === 'function')
      ? Extractors.findSectionByClassOrHeading(className, headingPattern, fallbackId, Utils)
      : null;
    // Strict class match — guards against picking an `ingredient`/`usage`
    // section when looking for `description`.
    const byClass = Utils.safeQuery(`.${className}, [class*="${className}"]`);
    if (byClass && (byClass.className || '').includes(className)) return byClass;
    if (sectionId) return Utils.safeQuery(`#${sectionId}`);
    return null;
  };

  /**
   * Extract one content section as sanitized HTML. Returns '' when the
   * section is missing (Long Châu hides several optional tabs depending
   * on product category, e.g. supplements omit `dosage`).
   */
  const extractSectionHtml = (className, headingPattern, fallbackId, Utils, Extractors) => {
    const section = findSection(className, headingPattern, fallbackId, Utils, Extractors);
    if (!section) return '';
    const cleaned = section.cloneNode(true);
    // The per-section heading ("Mô tả sản phẩm", "Cách dùng", ...) is
    // rendered by the FE renderer; remove it from the body to avoid a
    // duplicated heading in the final UI.
    const headInside = Utils.safeQuery('h2,h3,h4', cleaned);
    if (headInside) headInside.remove();
    sanitizeNode(cleaned);
    return compactHtml(cleaned.innerHTML);
  };

  // ---------- ingredients (3-case extractor) ----------

  const TRIGGER_LABEL_PATTERN = /Xem\s+b[ảa]ng\s+th[àa]nh\s+ph[ầa]n/i;

  /**
   * Find the Radix dialog trigger button for the ingredients popup.
   * Long Châu marks it with `aria-haspopup="dialog"` and the visible
   * label "Xem bảng thành phần". The button can sit either inside the
   * `.ingredient` section OR next to the "Thành phần" row in the spec
   * panel (Case A subvariants observed across products).
   */
  const findIngredientsTrigger = (Utils) => {
    const candidates = [];
    const triggerSel = 'button[aria-haspopup="dialog"]';
    const ingredientSection = Utils.safeQuery('.ingredient, [class*="ingredient"]')
      || Utils.safeQuery('#detail-content-1');
    if (ingredientSection) {
      Utils.safeQueryAll(triggerSel, ingredientSection).forEach((b) => candidates.push(b));
    }
    Utils.safeQueryAll(triggerSel).forEach((b) => {
      const label = (b.textContent || '').trim();
      if (TRIGGER_LABEL_PATTERN.test(label)) candidates.push(b);
    });
    // De-dupe (a button could appear in both lists) and prefer the one
    // whose label matches the expected wording — defensive against pages
    // that have other dialog triggers (e.g. "Xem giấy công bố sản phẩm").
    const seen = new Set();
    const labelled = [];
    const unlabelled = [];
    for (const b of candidates) {
      if (seen.has(b)) continue;
      seen.add(b);
      const label = (b.textContent || '').trim();
      if (TRIGGER_LABEL_PATTERN.test(label)) labelled.push(b);
      else unlabelled.push(b);
    }
    return labelled[0] || unlabelled[0] || null;
  };

  /**
   * Dispatch a Radix-friendly click sequence. Some Radix versions listen
   * on `pointerdown` instead of `click` (or both); calling `.click()`
   * alone is not always sufficient to flip the open state. Best-effort:
   * we synthesize the full sequence and then call `.click()` as well so
   * legacy `onClick` handlers fire too. Errors are swallowed because
   * `PointerEvent` may be unavailable in older browsers / mocks.
   */
  const dispatchRadixClick = (el) => {
    try {
      const PE = (typeof PointerEvent === 'function') ? PointerEvent : null;
      if (PE) {
        el.dispatchEvent(new PE('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
        el.dispatchEvent(new PE('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
      }
    } catch (_) { /* ignore */ }
    try { el.click(); } catch (_) { /* ignore */ }
  };

  /**
   * Click the popup trigger and poll for the dialog node to appear,
   * then for its <table> body to become non-empty. Returns the dialog
   * HTMLElement (rendered into a Radix portal under document.body) or
   * null if the trigger wasn't found / dialog never mounted in time.
   *
   * Two-stage poll because Long Châu sometimes lazy-loads the table
   * content AFTER the dialog shell mounts (separate fetch). Returning
   * the empty shell would yield ingredients = "".
   */
  const revealIngredientsDialog = async (Utils) => {
    const trigger = findIngredientsTrigger(Utils);
    if (!trigger) return null;
    dispatchRadixClick(trigger);

    const POLL_INTERVAL_MS = 50;
    const MAX_WAIT_MS = 3000;
    const findDialog = () =>
      document.querySelector('[role="dialog"][data-state="open"]')
      || document.querySelector('[role="dialog"]');
    const start = Date.now();
    let dlg = null;
    while (Date.now() - start < MAX_WAIT_MS) {
      dlg = findDialog();
      if (dlg) {
        // Stage 2: wait for table rows. Some products lazy-load the
        // ingredient table after the shell mounts.
        const table = dlg.querySelector('table');
        if (table) {
          const rows = table.querySelectorAll('tr');
          if (rows && rows.length >= 1) break; // has data rows (header optional)
        } else {
          // No table at all yet — keep polling, content might still hydrate.
        }
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    return dlg;
  };

  /**
   * Best-effort cleanup so a manual scrape doesn't leave a stray modal
   * blocking the user's view. Tries the Radix close button (X) first,
   * then falls back to dispatching ESC. Awaits one micro-tick to let
   * Radix run its unmount transitions.
   */
  const closeIngredientsDialog = async (dialog) => {
    if (!dialog) return;
    const closeBtn = dialog.querySelector(
      'button[aria-label*="Close" i], button[aria-label*="\u0110\u00f3ng" i]'
    );
    if (closeBtn) {
      try { closeBtn.click(); } catch (_) { /* ignore */ }
    } else {
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      } catch (_) { /* ignore */ }
    }
    await new Promise((r) => setTimeout(r, 50));
  };

  /**
   * Parse the dialog table into "Name: amount" entries. Skips header rows
   * and the basis line ("Thành phần cho 2 viên:").
   */
  const parseDialogTable = (dialog, Utils) => {
    const table = Utils.safeQuery('table', dialog);
    if (!table) return '';
    const pairs = [];
    Utils.safeQueryAll('tr', table).forEach((tr) => {
      const cells = Utils.safeQueryAll('td', tr);
      if (cells.length === 0) return;
      const name = Utils.getText(cells[0]).trim();
      const amount = cells.length >= 2 ? Utils.getText(cells[1]).trim() : '';
      if (!name || /^(Thông tin thành phần|Hàm lượng|Thành phần cho)/i.test(name)) return;
      pairs.push(amount ? `${name}: ${amount}` : name);
    });
    return pairs.join(', ');
  };

  /**
   * Inline table inside `.ingredient` section. Used when the page renders
   * the ingredients table directly without a popup wrapper. Same skip
   * rules as the popup parser — only the cell layout differs.
   */
  const parseInlineIngredientsTable = (section, Utils) => {
    if (!section) return '';
    const table = Utils.safeQuery('table', section);
    if (!table) return '';
    const pairs = [];
    Utils.safeQueryAll('tr', table).forEach((tr) => {
      const cells = Utils.safeQueryAll('td', tr);
      if (cells.length === 0) return;
      const name = Utils.getText(cells[0]).trim();
      const amount = cells.length >= 2 ? Utils.getText(cells[1]).trim() : '';
      if (!name || name.length < 2) return;
      if (/^(Thông tin thành phần|Hàm lượng|Thành phần cho)/i.test(name)) return;
      pairs.push(amount ? `${name}: ${amount}` : name);
    });
    return pairs.join(', ');
  };

  /**
   * Strip ONLY the trailing "Xem bảng thành phần" popup-trigger label
   * off an inline-spec value. Long Châu concatenates that label into the
   * spec cell text alongside the actual ingredients value:
   *
   *   raw:  "1 viên chứa: Vitamin C (100mg), Niacin (16mg ne) Xem bảng thành phần"
   *   out:  "1 viên chứa: Vitamin C (100mg), Niacin (16mg ne)"
   *
   * The leading "X <unit> chứa:" prefix is INTENTIONALLY preserved
   * (reverted from v1.3.2's normalize). Rationale: the prefix carries
   * pharmacology basis ("per 1 capsule / per 5 ml / per 1 sachet") that
   * downstream consumers (DB / FE / clinicians) need to interpret the
   * amounts. Dropping it loses context. The FE table parser
   * (`parseIngredients` in ProductDescriptionSection.tsx) accepts this
   * shape; it just renders the prefix as a leading sub-row.
   */
  const stripInlineSpecValue = (raw) => {
    if (!raw) return '';
    return String(raw)
      .replace(/Xem\s+b[ảa]ng\s+th[àa]nh\s+ph[ầa]n\s*$/i, '')
      .trim();
  };

  /**
   * Structure-based spec-row finder for the "Thành phần" label.
   *
   * Long Châu's modern layout (verified 2026-05-09 against
   * `scraped-data-1-1-{inline,multi,no}.json` + a comma-list product DOM
   * sample) renders each spec row as:
   *
   *   <div class="flex umd:flex-col umd:gap-0.5">
   *     <div>Thành phần</div>                  <!-- label cell, first child -->
   *     <div>…value content…</div>             <!-- value cell, second+ children -->
   *   </div>
   *
   * The value cell's contents vary widely between product types:
   *   - Drug (Exopadin): single sentence
   *       "1 viên chứa: Fexofenadin Hydroclorid (60mg)"
   *   - Powder/supplement (current screenshot): comma-list with mixed
   *       plain text + inline `<a>` links
   *       "Chất béo thực vật, Đạm whey, Maltodextrin, …"
   *   - Vitamin (Kudos): same shape but with trailing trigger label
   *       "1 viên chứa: Vitamin C (100mg)… Xem bảng thành phần"
   *
   * The walker:
   *   - Anchors the LABEL match (`^Thành phần$`) so heading-only nodes
   *     ("Thành phần" inside <h2>) and trigger labels ("Xem bảng thành
   *     phần") never identify a row.
   *   - Reconstructs valueText from `children.slice(1)` (concatenating
   *     all non-label children) so it works whether the value is wrapped
   *     in `[data-theme-element="article"]`, plain text, or a mixture
   *     of text + `<a>` links.
   *   - Skips nodes inside an open `[role="dialog"]` to avoid picking up
   *     a popup row by accident if the popup happens to still be open
   *     (shouldn't happen because Case A closes the dialog, but defensive).
   *
   * Why not reuse `Extractors.extractSpecRowValueByLabel`:
   *   - Its early `if (labelPattern.test(valueText)) continue;` guard
   *     mis-skips inline values that contain the trailing trigger label.
   *   - It anchors on `[data-theme-element="article"]` which the
   *     comma-list layout doesn't have on every leaf.
   */
  const INGREDIENTS_LABEL_EXACT = /^\s*Th\u00e0nh\s+ph\u1ea7n\s*$/i;
  const findInlineIngredientsSpecValue = (Utils) => {
    if (!Utils || !Utils.safeQueryAll) return '';
    const MAX_LABEL_CELL_LEN = 30;
    // Scan element containers that could hold a label/value pair.
    // Restricting to common spec-row tags keeps the cost bounded on
    // large pages.
    const candidates = Utils.safeQueryAll('div, section, article');
    for (const node of candidates) {
      const children = node.children ? Array.from(node.children) : [];
      if (children.length < 2) continue;

      // Reject if the "label" child is actually a heading. Headings inside
      // the description section ("Thành phần") would otherwise look like a
      // label cell with the next paragraph mistaken for its value.
      const firstTag = (children[0].tagName || '').toUpperCase();
      if (firstTag === 'H1' || firstTag === 'H2' || firstTag === 'H3' ||
          firstTag === 'H4' || firstTag === 'H5' || firstTag === 'H6') continue;

      const firstText = Utils.getText(children[0]).trim();
      if (!firstText || firstText.length > MAX_LABEL_CELL_LEN) continue;
      if (!INGREDIENTS_LABEL_EXACT.test(firstText)) continue;

      // Defensive scoping: don't pick up rows inside an open popup OR
      // inside a content section (description / usage / careful / …)
      // where prose may use "Thành phần" as a sub-heading topic.
      if (typeof node.closest === 'function') {
        if (node.closest('[role="dialog"]')) continue;
        if (node.closest('.description, [class*="description"], .usage, [class*="usage"], .careful, [class*="careful"]')) continue;
      }

      const valueParts = children.slice(1)
        .map((c) => Utils.getText(c).trim())
        .filter(Boolean);
      const valueText = valueParts.join(' ').replace(/\s+/g, ' ').trim();
      if (!valueText) continue;

      // Skip if the row's value cell only contains the popup trigger
      // (no other content). Means the actual ingredients live in the
      // dialog and Case A should have caught them; falling back to a
      // bare "Xem bảng thành phần" string is wrong.
      if (TRIGGER_LABEL_PATTERN.test(valueText) && valueText.length < 40) continue;

      return stripInlineSpecValue(valueText);
    }
    return '';
  };

  /**
   * 3-case ingredients extractor.
   *
   *   Case A: popup Radix dialog → click trigger, parse dialog table,
   *           close dialog. Yields rich "Name: amount" pairs.
   *   Case B: no publication → spec table also missing the row → return ''.
   *   Case C: inline value in spec table ("1 viên chứa: …") → take as-is;
   *           the FE parser will split it into a single table row.
   *
   * `Extractors` is optional; when provided we use the modern div-based
   * spec helper (`extractSpecRowValueByLabel`) which works on Long Châu's
   * current layout where the legacy `<table><tr>` parser yields nothing.
   */
  const extractIngredients = async (specifications, Utils, Extractors) => {
    // Case A: try the popup first. Yields amount info that's not present
    // in the inline DOM at all.
    const dialog = await revealIngredientsDialog(Utils);
    if (dialog) {
      const fromDialog = parseDialogTable(dialog, Utils);
      await closeIngredientsDialog(dialog);
      if (fromDialog) return fromDialog;
    }

    // Inline `.ingredient` table fallback (older product layouts).
    const section = Utils.safeQuery('.ingredient, [class*="ingredient"]')
      || Utils.safeQuery('#detail-content-1');
    if (section) {
      const fromInline = parseInlineIngredientsTable(section, Utils);
      if (fromInline) return fromInline;
    }

    // Case C (modern layout): div-based spec row keyed by label "Thành phần".
    // Preferred path because the legacy table parser produces an empty
    // `specifications` dict for current Long Châu pages.
    const fromSpecRow = findInlineIngredientsSpecValue(Utils);
    if (fromSpecRow) return fromSpecRow;

    // Case C (legacy layout): table-based `specifications` dict fallback.
    if (specifications && specifications['Thành phần']) {
      return stripInlineSpecValue(specifications['Thành phần']);
    }

    // Case B: nothing publishable.
    return '';
  };

  // ---------- adverseEffect / preservation guard ----------

  /**
   * Long Châu sometimes renders a "Bảo quản" subsection inside the
   * "Tác dụng phụ" container when a product has no real adverse-effect
   * data. Catch the misclassification by inspecting the visible text of
   * the produced HTML.
   */
  const guardAdverseVsPreservation = (html) => {
    if (!html) return '';
    // Cheap text view of the HTML for keyword sniffing.
    const text = html.replace(/<[^>]+>/g, ' ');
    if (
      /n\u01a1i\s+kh\u00f4/i.test(text) ||
      /b\u1ea3o\s+qu\u1ea3n/i.test(text) ||
      /nhi\u1ec7t\s+\u0111\u1ed9/i.test(text) ||
      /tr\u00e1nh\s+\u00e1nh\s+s\u00e1ng/i.test(text)
    ) {
      return '';
    }
    return html;
  };

  // ---------- public entry ----------

  /**
   * Single public entry point used by detail-scraper. Sequencing is
   * deterministic (see plan §1.5):
   *   1. Synchronously grab 6 HTML sections.
   *   2. Async resolve ingredients (popup may open + close mid-flight).
   *   3. Apply adverseEffect / preservation guard.
   *   4. Return aggregated content object.
   *
   * The caller is responsible for first running
   * `_revealHiddenSpecSection` so any spec rows the strategy depends on
   * (currently none — but see the inline-spec ingredients fallback) are
   * already mounted.
   */
  const extract = async (specifications, Utils, Extractors) => {
    const description = extractSectionHtml('description', /M\u00f4\s+t\u1ea3\s+s\u1ea3n\s+ph\u1ea9m/i, 'detail-content-0', Utils, Extractors);
    const usage = extractSectionHtml('usage', /C\u00f4ng\s+d\u1ee5ng/i, 'detail-content-2', Utils, Extractors);
    const dosage = extractSectionHtml('dosage', /C\u00e1ch\s+d\u00f9ng/i, 'detail-content-3', Utils, Extractors);
    const adverseRaw = extractSectionHtml('adverseEffect', /T\u00e1c\s+d\u1ee5ng\s+ph\u1ee5/i, 'detail-content-4', Utils, Extractors);
    const careful = extractSectionHtml('careful', /L\u01b0u\s+\u00fd/i, 'detail-content-5', Utils, Extractors);
    const preservation = extractSectionHtml('preservation', /B\u1ea3o\s+qu\u1ea3n/i, 'detail-content-6', Utils, Extractors);

    const ingredients = await extractIngredients(specifications, Utils, Extractors);

    const adverseEffect = guardAdverseVsPreservation(adverseRaw);

    return {
      description: description || '',
      ingredients: ingredients || '',
      usage: usage || '',
      dosage: dosage || '',
      adverseEffect: adverseEffect || '',
      careful: careful || '',
      preservation: preservation || ''
    };
  };

  window.DataScraperProductContentStrategy = {
    extract,
    // Exposed mainly for unit testing / future reuse.
    _extractSectionHtml: extractSectionHtml,
    _extractIngredients: extractIngredients,
    _sanitizeNode: sanitizeNode,
    _revealIngredientsDialog: revealIngredientsDialog,
    _closeIngredientsDialog: closeIngredientsDialog,
    _guardAdverseVsPreservation: guardAdverseVsPreservation
  };
})();
