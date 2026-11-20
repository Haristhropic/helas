/* Router console — the only script the dashboard ships.
   It does four things: mount the charts from their data, fold the sidebar on a
   phone, filter the models table, and copy a value to the clipboard. Nothing
   here is an entrance animation; the motion is feedback on a control. */
(function () {
  'use strict';

  var FMT = {
    int: Charts.fmt.int,
    compact: Charts.fmt.compact,
    pct0: Charts.fmt.pct(0),
  };

  function mountCharts() {
    var nodes = document.querySelectorAll('[data-chart]');
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.getAttribute('data-mounted') === '1') return;
      var cfg;
      try {
        cfg = JSON.parse(el.getAttribute('data-chart'));
      } catch (err) {
        return;
      }
      var kind = cfg.kind;
      delete cfg.kind;
      if (typeof cfg.format === 'string') cfg.format = FMT[cfg.format] || FMT.int;
      if (typeof cfg.tickFormat === 'string') cfg.tickFormat = FMT[cfg.tickFormat] || FMT.int;
      var draw = Charts[kind];
      if (typeof draw === 'function') {
        draw(el, cfg);
        el.setAttribute('data-mounted', '1');
      }
    });
  }

  function initMenu() {
    var button = document.querySelector('[data-menu]');
    var nav = document.getElementById('app-nav');
    if (!button || !nav) return;

    button.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !nav.classList.contains('open')) return;
      nav.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
      button.focus();
    });
  }

  function initFilter() {
    var input = document.querySelector('[data-filter]');
    if (!input) return;

    var rows = Array.prototype.slice.call(document.querySelectorAll('tbody tr[data-search]'));
    var empty = document.querySelector('tr.no-match');
    var count = document.querySelector('[data-count]');
    if (!rows.length) return;

    function run() {
      var query = input.value.trim().toLowerCase();
      var shown = 0;
      rows.forEach(function (row) {
        var hit = query === '' || row.getAttribute('data-search').indexOf(query) !== -1;
        row.hidden = !hit;
        if (hit) shown += 1;
      });
      if (empty) empty.hidden = shown !== 0;
      if (count) count.textContent = String(shown);
    }

    input.addEventListener('input', run);
    input.addEventListener('search', run);
  }

  function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {});
    }
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      /* nothing to fall back to */
    }
    document.body.removeChild(area);
    return Promise.resolve();
  }

  function flash(el) {
    el.classList.add('copied');
    window.setTimeout(function () {
      el.classList.remove('copied');
    }, 900);
  }

  function initCopy() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
      button.addEventListener('click', function () {
        writeClipboard(button.getAttribute('data-copy')).then(function () {
          flash(button);
        });
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-copy-from]'), function (button) {
      button.addEventListener('click', function () {
        var source = document.getElementById(button.getAttribute('data-copy-from'));
        if (!source) return;
        writeClipboard(source.value).then(function () {
          flash(button);
        });
      });
    });
  }

  function initPrefill() {
    var select = document.querySelector('[data-provider-select]');
    var keyField = document.getElementById('pk-key');
    if (!select) return;

    Array.prototype.forEach.call(document.querySelectorAll('[data-prefill]'), function (button) {
      button.addEventListener('click', function () {
        select.value = button.getAttribute('data-prefill');
        if (!keyField) return;
        var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        keyField.focus({ preventScroll: true });
        keyField.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
      });
    });
  }

  /**
   * On a phone a table stops being a table: each cell is labelled from its own
   * column header, so the value can sit at the far edge and still say what it is.
   * The first cell is the row's title and stays unlabelled.
   */
  function initTables() {
    Array.prototype.forEach.call(document.querySelectorAll('table.table'), function (table) {
      var heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) {
        return th.textContent.trim();
      });
      if (!heads.length) return;

      Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), function (row) {
        if (row.classList.contains('no-match')) return;
        var cells = row.children;
        for (var i = 1; i < cells.length; i += 1) {
          if (!cells[i].hasAttribute('data-label') && heads[i]) {
            cells[i].setAttribute('data-label', heads[i]);
          }
          if (cells[i].textContent.trim().length > 24) {
            cells[i].classList.add('cell-long');
          }
        }
      });
    });
  }

  function start() {
    mountCharts();
    initMenu();
    initFilter();
    initCopy();
    initPrefill();
    initTables();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
