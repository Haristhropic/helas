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

  function initPlayground() {
    var form = document.getElementById('playground-form');
    if (!form) return;

    var modelEl = document.getElementById('pg-model');
    var systemEl = document.getElementById('pg-system');
    var promptEl = document.getElementById('pg-prompt');
    var submitEl = document.getElementById('pg-submit');
    var clearEl = document.getElementById('pg-clear');
    var statusEl = document.getElementById('pg-status');
    var outputEl = document.getElementById('pg-output');
    var errorEl = document.getElementById('pg-error');
    var metaEl = document.getElementById('pg-meta');
    var metaModel = document.getElementById('pg-meta-model');
    var metaProvider = document.getElementById('pg-meta-provider');
    var metaLatency = document.getElementById('pg-meta-latency');
    var metaTokens = document.getElementById('pg-meta-tokens');
    var metaFallbacks = document.getElementById('pg-meta-fallbacks');

    function setStatus(text) {
      if (statusEl) statusEl.textContent = text || '';
    }

    function setLoading(on) {
      if (submitEl) {
        submitEl.disabled = !!on;
        submitEl.textContent = on ? 'Sending…' : 'Send';
      }
      setStatus(on ? 'Routing request…' : '');
    }

    function resetResult() {
      if (outputEl) {
        outputEl.innerHTML = '<span class="pg-placeholder">Response will appear here.</span>';
      }
      if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = '';
      }
      if (metaEl) metaEl.hidden = true;
    }

    function showError(message, attempts) {
      if (errorEl) {
        var text = String(message || 'Request failed.');
        if (attempts && attempts.length) {
          try {
            text += '\n\nAttempts:\n' + JSON.stringify(attempts, null, 2);
          } catch (_) {}
        }
        errorEl.textContent = text;
        errorEl.hidden = false;
      }
      if (outputEl) {
        outputEl.innerHTML = '<span class="pg-placeholder">No successful response.</span>';
      }
      setStatus('Failed');
    }

    if (clearEl) {
      clearEl.addEventListener('click', function () {
        if (promptEl) promptEl.value = '';
        if (systemEl) systemEl.value = '';
        resetResult();
        setStatus('');
        if (promptEl) promptEl.focus();
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var prompt = promptEl ? String(promptEl.value || '').trim() : '';
      if (!prompt) {
        setStatus('Enter a prompt.');
        if (promptEl) promptEl.focus();
        return;
      }

      var messages = [];
      var system = systemEl ? String(systemEl.value || '').trim() : '';
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });

      var body = {
        model: modelEl ? modelEl.value : 'auto',
        messages: messages,
      };

      setLoading(true);
      resetResult();
      var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

      fetch('/api/playground/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () { return {}; })
            .then(function (data) { return { res: res, data: data }; });
        })
        .then(function (result) {
          var res = result.res;
          var data = result.data || {};
          var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          var clientMs = Math.round(now - t0);

          if (!res.ok) {
            var msg = (data && data.error && data.error.message) || ('Request failed (' + res.status + ')');
            var attempts = data && data.error && data.error.attempts;
            showError(msg, attempts);
            return;
          }

          var text = '';
          try {
            if (data.choices && data.choices[0] && data.choices[0].message) {
              var content = data.choices[0].message.content;
              text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
            } else {
              text = JSON.stringify(data, null, 2);
            }
          } catch (_) {
            text = String(data);
          }

          if (outputEl) outputEl.textContent = text || '(empty response)';

          if (metaEl) {
            var router = data.router || {};
            if (metaModel) metaModel.textContent = router.family || router.model_id || body.model || '—';
            if (metaProvider) metaProvider.textContent = router.provider ? ('via ' + router.provider) : 'provider unknown';
            var latency = router.latency_ms != null ? router.latency_ms : clientMs;
            if (metaLatency) metaLatency.textContent = latency + ' ms';
            var usage = data.usage || {};
            var total = usage.total_tokens != null
              ? usage.total_tokens
              : ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0));
            if (metaTokens) metaTokens.textContent = total ? (total + ' tokens') : '';
            if (metaFallbacks) {
              var fb = Number(router.fallbacks || 0);
              if (fb > 0) {
                metaFallbacks.hidden = false;
                metaFallbacks.textContent = fb + ' fallback' + (fb === 1 ? '' : 's');
                metaFallbacks.className = 'mark warn';
              } else {
                metaFallbacks.hidden = true;
                metaFallbacks.textContent = '';
              }
            }
            metaEl.hidden = false;
          }

          setStatus('Done');
        })
        .catch(function (err) {
          showError(err && err.message ? err.message : 'Network error');
        })
        .then(function () {
          setLoading(false);
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
    initPlayground();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
