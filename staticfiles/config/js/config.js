/* ============================================================
   config.js — Fixalius · Editor de config.ini
   ============================================================ */
(function () {
  'use strict';

  var URLS = window.FIXALIUS_URLS || {
    config:       '/config/api/config/',
    configSave:   '/config/api/config/save/',
    configReload: '/config/api/config/reload/'
  };
  var $ = window.jQuery;

  // ---------- Toasts (sustituyen a DevExpress.ui.notify) ----------
  function notify(message, type, duration) {
    var stack = document.getElementById('cfg-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'cfg-toast-stack';
      stack.className = 'cfg-toast-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    var icons = {
      success: 'fa-check-circle',
      error:   'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info:    'fa-info-circle'
    };
    var el = document.createElement('div');
    el.className = 'cfg-toast ' + (type || 'info');
    el.innerHTML =
      '<i class="fas ' + (icons[type] || icons.info) + '" aria-hidden="true"></i>' +
      '<span class="cfg-toast-msg"></span>';
    el.querySelector('.cfg-toast-msg').textContent = String(message || '');
    stack.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s ease, transform .25s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      setTimeout(function () { el.remove(); }, 260);
    }, duration || 3000);
  }

  function handleError(msg, type, dur) { notify(msg, type || 'error', dur || 4000); }
  function handleSuccess(msg, dur) { notify(msg, 'success', dur || 2200); }

  // ---------- CSRF ----------
  function getCsrfToken() {
    var m = document.querySelector('meta[name="csrf-token"]');
    if (m) return m.getAttribute('content');
    if (window.getCookie) return window.getCookie('csrftoken');
    var c = document.cookie.split(';').find(function (x) {
      return x.trim().startsWith('csrftoken=');
    });
    return c ? decodeURIComponent(c.trim().substring('csrftoken='.length)) : '';
  }

  // ---------- Utilidades ----------
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
  }
  function cssEscape(s) {
    return String(s).replace(/(["\\\]\[.#:>+~*^$|()=,/{}])/g, '\\$1');
  }

  // ---------- Loading ----------
  var activeRequests = 0;
  function showLoading(msg) {
    activeRequests++;
    if (window.showLoading) window.showLoading(msg);
    else {
      var overlay = document.getElementById('global-loading');
      if (overlay) {
        overlay.classList.add('is-visible');
        var s = document.getElementById('global-loading-msg');
        if (s && msg) s.textContent = msg;
      }
    }
  }
  function hideLoading() {
    activeRequests--;
    if (activeRequests <= 0) {
      activeRequests = 0;
      if (window.hideLoading) window.hideLoading();
      else {
        var overlay = document.getElementById('global-loading');
        if (overlay) overlay.classList.remove('is-visible');
      }
    }
  }

  // ---------- Estado ----------
  var _configData = null;
  var _originalSnapshot = null;
  var _activeChip = 'all';
  var _searchText = '';
  var _seccionFiltro = '';
  var _selectedField = null;
  var _activeDpTab = 'info';
  var _collapsedSections = {};

  var TYPE_LABELS = { boolean: 'Booleano', integer: 'Entero', float: 'Decimal', string: 'Texto' };
  var TYPE_ICONS  = { boolean: 'fa-toggle-on', integer: 'fa-hashtag', float: 'fa-percent', string: 'fa-font' };

  function fieldId(sectionName, key) {
    return 'cfg__' + sectionName + '__' + key;
  }

  // ---------- Carga ----------
  function fetchConfig() {
    showLoading('Cargando config.ini…');
    return $.ajax({ url: URLS.config, method: 'GET', dataType: 'json' })
      .done(function (data) {
        _configData = data;
        _originalSnapshot = snapshotValues(data);
        renderAll();
      })
      .fail(function (xhr) {
        var msg = 'Error al cargar config.ini';
        try { var j = JSON.parse(xhr.responseText); if (j.detail) msg = j.detail; } catch (e) {}
        handleError(msg);
        renderErrorState(msg);
      })
      .always(function () { hideLoading(); });
  }

  function snapshotValues(data) {
    var snap = {};
    (data.sections || []).forEach(function (sec) {
      (sec.keys || []).forEach(function (k) {
        snap[fieldId(sec.name, k.key)] = k.value;
      });
    });
    return JSON.stringify(snap);
  }

  function currentValues() {
    var vals = {};
    (_configData.sections || []).forEach(function (sec) {
      (sec.keys || []).forEach(function (k) {
        vals[fieldId(sec.name, k.key)] = k.value;
      });
    });
    return vals;
  }

  function hasUnsavedChanges() {
    if (!_configData) return false;
    return JSON.stringify(currentValues()) !== _originalSnapshot;
  }

  // ---------- Render principal ----------
  function renderErrorState(msg) {
    var container = document.getElementById('configSectionsContainer');
    if (!container) return;
    container.innerHTML =
      '<div class="cfg-empty-state is-error">' +
        '<i class="fas fa-triangle-exclamation"></i>' +
        '<span>' + escapeHtml(msg) + '</span>' +
      '</div>';
  }

  function renderAll() {
    populateSeccionFilter();
    renderSections();
    renderKpis();
    updateFilterBadge();
    renderPagerSummary();
    var lu = document.getElementById('last-update-text');
    if (lu) lu.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    var pathEl = document.getElementById('cfg-path');
    if (pathEl && _configData && _configData.path) pathEl.textContent = '· ' + _configData.path;
  }

  function populateSeccionFilter() {
    var sel = document.getElementById('filter-seccion');
    if (!sel || !_configData) return;
    var current = sel.value;
    sel.innerHTML = '<option value="">Todas las secciones</option>';
    (_configData.sections || []).forEach(function (sec) {
      var opt = document.createElement('option');
      opt.value = sec.name;
      opt.textContent = sec.name;
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
  }

  function matchesFilters(sectionName, item) {
    if (_activeChip === 'modificados') {
      var id = fieldId(sectionName, item.key);
      var origVals = JSON.parse(_originalSnapshot || '{}');
      if (JSON.stringify(origVals[id]) === JSON.stringify(item.value)) return false;
    } else if (_activeChip === 'vacios') {
      if (item.value !== '' && item.value !== null && item.value !== undefined) return false;
    }
    if (_seccionFiltro && sectionName !== _seccionFiltro) return false;
    if (_searchText) {
      var hay = (sectionName + ' ' + item.key + ' ' + String(item.value)).toLowerCase();
      if (hay.indexOf(_searchText.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function renderSections() {
    var container = document.getElementById('configSectionsContainer');
    if (!container || !_configData) return;

    if (!_configData.exists) {
      container.innerHTML =
        '<div class="cfg-empty-state is-error">' +
          '<i class="fas fa-file-circle-xmark"></i>' +
          '<span>No se encontró config.ini (' + escapeHtml(_configData.path || '') + ')</span>' +
        '</div>';
      return;
    }
    if (!_configData.sections || _configData.sections.length === 0) {
      container.innerHTML =
        '<div class="cfg-empty-state">' +
          '<i class="fas fa-inbox"></i>' +
          '<span>El archivo config.ini no contiene secciones</span>' +
        '</div>';
      return;
    }

    var html = '';
    _configData.sections.forEach(function (sec) {
      var rowsHtml = '';
      var sectionVisibleCount = 0;
      sec.keys.forEach(function (item) {
        var visible = matchesFilters(sec.name, item);
        if (visible) sectionVisibleCount++;
        rowsHtml += renderFieldRow(sec.name, item, visible);
      });
      var sectionVisible = sectionVisibleCount > 0;
      var collapsed = !!_collapsedSections[sec.name];
      html +=
        '<div class="cfg-section-card' + (sectionVisible ? '' : ' is-hidden') + (collapsed ? ' collapsed' : '') + '" data-section="' + escapeHtml(sec.name) + '">' +
          '<div class="cfg-section-header" data-toggle="section">' +
            '<div class="csh-icon"><i class="fas fa-layer-group"></i></div>' +
            '<div class="csh-title">' + escapeHtml(sec.name) + '</div>' +
            '<div class="csh-count">' + sec.keys.length + ' parámetro' + (sec.keys.length === 1 ? '' : 's') + '</div>' +
            '<i class="fas fa-chevron-down csh-chevron"></i>' +
          '</div>' +
          '<div class="cfg-section-body">' + rowsHtml + '</div>' +
        '</div>';
    });
    container.innerHTML = html;
    wireFieldEvents();
    renderFloatingBar();
  }

  function renderFieldRow(sectionName, item, visible) {
    var id = fieldId(sectionName, item.key);
    var isModified = isFieldModified(sectionName, item.key, item.value);
    var typeLabel = TYPE_LABELS[item.type] || 'Texto';
    var control = '';

    if (item.type === 'boolean') {
      control =
        '<label class="cfr-toggle">' +
          '<input type="checkbox" id="' + id + '" data-section="' + escapeHtml(sectionName) + '" data-key="' + escapeHtml(item.key) + '" data-type="boolean"' + (item.value ? ' checked' : '') + '>' +
          '<span class="toggle-track"></span>' +
          '<span class="toggle-label">' + (item.value ? 'Activado' : 'Desactivado') + '</span>' +
        '</label>';
    } else if (item.type === 'integer' || item.type === 'float') {
      control =
        '<input type="number" id="' + id + '" data-section="' + escapeHtml(sectionName) + '" data-key="' + escapeHtml(item.key) + '" data-type="' + item.type + '"' +
        (item.type === 'float' ? ' step="any"' : ' step="1"') +
        ' value="' + escapeHtml(item.value) + '">';
    } else {
      var isEmpty = item.value === '' || item.value === null || item.value === undefined;
      control =
        '<input type="text" id="' + id + '" data-section="' + escapeHtml(sectionName) + '" data-key="' + escapeHtml(item.key) + '" data-type="string"' +
        ' class="' + (isEmpty ? 'is-empty' : '') + '"' +
        ' placeholder="(vacío)"' +
        ' value="' + escapeHtml(item.value) + '">';
    }

    return '<div class="cfg-field-row' + (isModified ? ' is-modified' : '') + (visible ? '' : ' is-hidden') + '" data-section="' + escapeHtml(sectionName) + '" data-key="' + escapeHtml(item.key) + '">' +
      '<div class="cfr-label">' +
        '<div class="cfr-key-wrap">' +
          '<span class="cfr-key">' + escapeHtml(item.key) + '</span>' +
          '<button type="button" class="cfr-info-btn" title="Ver detalle" data-action="detail" data-section="' + escapeHtml(sectionName) + '" data-key="' + escapeHtml(item.key) + '"><i class="fas fa-circle-info"></i></button>' +
        '</div>' +
        '<span class="cfr-type-tag"><i class="fas ' + (TYPE_ICONS[item.type] || 'fa-font') + '"></i> ' + typeLabel + '</span>' +
      '</div>' +
      '<div class="cfr-control">' + control + '</div>' +
    '</div>';
  }

  function isFieldModified(sectionName, key, currentValue) {
    if (!_originalSnapshot) return false;
    var id = fieldId(sectionName, key);
    var origVals = JSON.parse(_originalSnapshot);
    return JSON.stringify(origVals[id]) !== JSON.stringify(currentValue);
  }

  function wireFieldEvents() {
    $('.cfr-control input[type="text"], .cfr-control input[type="number"]')
      .off('input')
      .on('input', function () {
        var $el = $(this);
        var section = $el.data('section');
        var key = $el.data('key');
        var type = $el.data('type');
        var raw = $el.val();
        var value = (type === 'integer') ? parseInt(raw, 10)
                  : (type === 'float')   ? parseFloat(raw)
                                         : raw;
        if ((type === 'integer' || type === 'float') && isNaN(value)) value = raw;
        updateFieldValue(section, key, value);
        $el.toggleClass('is-empty', type === 'string' && raw === '');
        refreshRowModifiedState(section, key);
        if (_selectedField && _selectedField.sectionName === section && _selectedField.key === key) {
          _selectedField.value = value;
          renderDpTab(_activeDpTab, _selectedField);
        }
      });

    $('.cfr-toggle input[type="checkbox"]')
      .off('change')
      .on('change', function () {
        var $el = $(this);
        var section = $el.data('section');
        var key = $el.data('key');
        var checked = $el.is(':checked');
        updateFieldValue(section, key, checked);
        $el.closest('.cfr-toggle').find('.toggle-label').text(checked ? 'Activado' : 'Desactivado');
        refreshRowModifiedState(section, key);
        if (_selectedField && _selectedField.sectionName === section && _selectedField.key === key) {
          _selectedField.value = checked;
          renderDpTab(_activeDpTab, _selectedField);
        }
      });

    $('[data-action="detail"]').off('click').on('click', function () {
      var $b = $(this);
      showFieldDetail($b.data('section'), $b.data('key'));
    });

    $('[data-toggle="section"]').off('click').on('click', function () {
      toggleSection(this);
    });
  }

  function updateFieldValue(sectionName, key, value) {
    var sec = _configData.sections.find(function (s) { return s.name === sectionName; });
    if (!sec) return;
    var item = sec.keys.find(function (k) { return k.key === key; });
    if (!item) return;
    item.value = value;
    renderKpis();
    renderFloatingBar();
  }

  function refreshRowModifiedState(sectionName, key) {
    var sec = _configData.sections.find(function (s) { return s.name === sectionName; });
    var item = sec && sec.keys.find(function (k) { return k.key === key; });
    if (!item) return;
    var modified = isFieldModified(sectionName, key, item.value);
    var $row = $('.cfg-field-row[data-section="' + cssEscape(sectionName) + '"][data-key="' + cssEscape(key) + '"]');
    $row.toggleClass('is-modified', modified);
  }

  // ---------- KPIs ----------
  function renderKpis() {
    if (!_configData) return;
    var totalSecciones = (_configData.sections || []).length;
    var totalParametros = 0;
    (_configData.sections || []).forEach(function (s) { totalParametros += s.keys.length; });
    var modificados = 0;
    var origVals = JSON.parse(_originalSnapshot || '{}');
    (_configData.sections || []).forEach(function (sec) {
      sec.keys.forEach(function (k) {
        var id = fieldId(sec.name, k.key);
        if (JSON.stringify(origVals[id]) !== JSON.stringify(k.value)) modificados++;
      });
    });
    setKpi('kpi-secciones', totalSecciones);
    setKpi('kpi-parametros', totalParametros);
    setKpi('kpi-modificados', modificados);
    setKpi('kpi-estado', _configData.exists ? 'OK' : 'Falta');

    var estadoCard = document.getElementById('kpi-estado');
    if (estadoCard) estadoCard.style.color = _configData.exists ? 'var(--success)' : 'var(--danger)';
    var modCard = document.getElementById('kpi-modificados');
    if (modCard) modCard.style.color = modificados > 0 ? 'var(--warning)' : 'var(--text-900)';
  }

  function setKpi(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    el.classList.remove('loading');
  }

  // ---------- Filtros ----------
  function updateFilterBadge() {
    var count = 0;
    if (_activeChip && _activeChip !== 'all') count++;
    if (_seccionFiltro) count++;
    if (_searchText) count++;
    var badge = document.getElementById('active-filter-badge');
    if (!badge) return;
    if (count > 0) {
      document.getElementById('active-filter-count').textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function applyQuickFilters() {
    renderSections();
    updateFilterBadge();
    renderPagerSummary();
  }

  document.querySelectorAll('.cfg-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.cfg-chip').forEach(function (c) { c.classList.remove('active'); });
      this.classList.add('active');
      _activeChip = this.getAttribute('data-filter');
      applyQuickFilters();
    });
  });

  document.getElementById('clear-search').addEventListener('click', function () {
    document.getElementById('filter-search').value = '';
    this.classList.remove('visible');
    _searchText = '';
    applyQuickFilters();
  });

  var _searchTimer;
  document.getElementById('filter-search').addEventListener('input', function () {
    var v = this.value.trim();
    document.getElementById('clear-search').classList.toggle('visible', v.length > 0);
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(function () {
      _searchText = v;
      applyQuickFilters();
    }, 220);
  });

  document.getElementById('filter-seccion').addEventListener('change', function () {
    _seccionFiltro = this.value;
    applyQuickFilters();
  });

  function renderPagerSummary() {
    var info = document.getElementById('pager-info');
    var ctrl = document.getElementById('pager-controls');
    if (!info || !_configData) return;
    var totalSecciones = (_configData.sections || []).length;
    var totalParametros = 0;
    var visibles = 0;
    (_configData.sections || []).forEach(function (sec) {
      sec.keys.forEach(function (item) {
        totalParametros++;
        if (matchesFilters(sec.name, item)) visibles++;
      });
    });
    if (totalParametros === 0) {
      info.textContent = 'Sin parámetros';
    } else if (visibles === totalParametros) {
      info.textContent = totalParametros + ' parámetros en ' + totalSecciones + ' secciones';
    } else {
      info.textContent = visibles + ' de ' + totalParametros + ' parámetros (filtrados)';
    }
    if (ctrl) ctrl.innerHTML = '';
  }

  // ---------- Colapsar sección ----------
  function toggleSection(headerEl) {
    var card = headerEl.closest('.cfg-section-card');
    if (!card) return;
    var name = card.dataset.section;
    var collapsed = card.classList.toggle('collapsed');
    _collapsedSections[name] = collapsed;
  }

  // ---------- Panel de detalle ----------
  function showFieldDetail(sectionName, key) {
    var sec = _configData.sections.find(function (s) { return s.name === sectionName; });
    var item = sec && sec.keys.find(function (k) { return k.key === key; });
    if (!item) return;

    _selectedField = { sectionName: sectionName, key: key, type: item.type, value: item.value, raw: item.raw };

    var av = document.getElementById('dp-avatar');
    if (av) av.innerHTML = '<i class="fas ' + (TYPE_ICONS[item.type] || 'fa-font') + '"></i>';
    var nameEl = document.getElementById('dp-name');
    if (nameEl) nameEl.textContent = key;
    var codigoEl = document.getElementById('dp-codigo');
    if (codigoEl) codigoEl.textContent = sectionName;
    var ciudadEl = document.getElementById('dp-ciudad');
    if (ciudadEl) ciudadEl.textContent = TYPE_LABELS[item.type] || 'Texto';
    var tipoEl = document.getElementById('dp-kpi-inm');
    if (tipoEl) tipoEl.textContent = TYPE_LABELS[item.type] || 'Texto';
    var estadoEl = document.getElementById('dp-kpi-inc');
    if (estadoEl) {
      var modified = isFieldModified(sectionName, key, item.value);
      estadoEl.textContent = modified ? 'Modificado' : 'Original';
      estadoEl.style.color = modified ? 'var(--warning)' : 'var(--success)';
    }
    renderDpTab(_activeDpTab, _selectedField);
    document.getElementById('detail-panel').classList.add('visible');
    document.getElementById('detail-panel').setAttribute('aria-hidden', 'false');

    document.querySelectorAll('.cfg-field-row').forEach(function (r) { r.classList.remove('row-selected'); });
    var rowEl = document.querySelector('.cfg-field-row[data-section="' + cssEscape(sectionName) + '"][data-key="' + cssEscape(key) + '"]');
    if (rowEl) rowEl.classList.add('row-selected');
  }

  document.getElementById('detail-close').addEventListener('click', function () {
    document.getElementById('detail-panel').classList.remove('visible');
    document.getElementById('detail-panel').setAttribute('aria-hidden', 'true');
    _selectedField = null;
    document.querySelectorAll('.cfg-field-row').forEach(function (r) { r.classList.remove('row-selected'); });
  });

  document.querySelectorAll('.cfg-detail-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.cfg-detail-tab').forEach(function (t) { t.classList.remove('active'); });
      this.classList.add('active');
      _activeDpTab = this.getAttribute('data-tab');
      if (_selectedField) renderDpTab(_activeDpTab, _selectedField);
    });
  });

  function dpRow(icon, label, value, accent) {
    return '<div class="cfg-dp-row">' +
      '<span class="cfg-dp-label"><i class="fas fa-' + icon + '"></i>' + escapeHtml(label) + '</span>' +
      '<span class="cfg-dp-value' + (accent ? ' accent' : '') + '">' +
        escapeHtml(String(value === '' || value === null || value === undefined ? '–' : value)) +
      '</span></div>';
  }
  function dpSection(title) {
    return '<div class="cfg-dp-section">' + escapeHtml(title) + '</div>';
  }

  function renderDpTab(tab, f) {
    var body = document.getElementById('dp-body');
    if (!body || !f) return;
    if (tab === 'info') {
      body.innerHTML =
        dpSection('Identificación') +
        dpRow('layer-group', 'Sección', f.sectionName) +
        dpRow('key', 'Clave', f.key) +
        dpRow('tag', 'Tipo', TYPE_LABELS[f.type] || 'Texto') +
        dpSection('Valor actual') +
        dpRow('pen', 'Valor', f.value, true) +
        dpRow('circle-check', 'Estado', isFieldModified(f.sectionName, f.key, f.value) ? 'Modificado (sin guardar)' : 'Sin cambios');
    } else if (tab === 'raw') {
      var line = f.key + ' = ' + (f.value === null || f.value === undefined ? '' : f.value);
      body.innerHTML =
        '<div style="background:var(--bg-subtle);border:1px solid var(--border);border-radius:10px;padding:14px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;line-height:1.7;white-space:pre-wrap;color:var(--text-700)">' +
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--fx-cyan);margin-bottom:8px;font-family:var(--font-body)">' +
            '<i class="fas fa-code" style="margin-right:6px"></i>Representación .ini' +
          '</div>' +
          '[' + escapeHtml(f.sectionName) + ']\n' + escapeHtml(line) +
        '</div>';
    }
  }

  // ---------- Floating bar ----------
  function renderFloatingBar() {
    var existing = document.getElementById('cfg-floating-bar');
    var changed = hasUnsavedChanges();
    if (!existing) {
      var pager = document.getElementById('pager');
      if (!pager) return;
      var bar = document.createElement('div');
      bar.id = 'cfg-floating-bar';
      bar.className = 'cfg-floating-bar hidden';
      bar.innerHTML =
        '<span><i class="fas fa-triangle-exclamation"></i> Tienes cambios sin guardar</span>' +
        '<span class="cfb-actions">' +
          '<button type="button" data-action="reload">Descartar</button>' +
          '<button type="button" class="primary" data-action="save">Guardar cambios</button>' +
        '</span>';
      pager.parentNode.insertBefore(bar, pager);
      existing = bar;
      bar.querySelector('[data-action="reload"]').addEventListener('click', reloadConfig);
      bar.querySelector('[data-action="save"]').addEventListener('click', saveConfig);
    }
    existing.classList.toggle('hidden', !changed);
    var saveBtn = document.getElementById('btn-guardar');
    if (saveBtn) saveBtn.classList.toggle('has-changes', changed);
  }

  // ---------- Guardar ----------
  function saveConfig() {
    if (!_configData) return;
    if (!hasUnsavedChanges()) {
      handleSuccess('No hay cambios que guardar', 1800);
      return;
    }
    var payload = {
      sections: _configData.sections.map(function (sec) {
        return {
          name: sec.name,
          keys: sec.keys.map(function (k) {
            return { key: k.key, value: k.value, type: k.type };
          })
        };
      })
    };
    showLoading('Guardando config.ini…');
    $.ajax({
      url: URLS.configSave,
      method: 'POST',
      contentType: 'application/json',
      headers: { 'X-CSRFToken': getCsrfToken() },
      data: JSON.stringify(payload)
    })
    .done(function (resp) {
      handleSuccess('Configuración guardada correctamente');
      _configData = resp;
      _originalSnapshot = snapshotValues(resp);
      renderAll();
    })
    .fail(function (xhr) {
      var msg = 'Error al guardar config.ini';
      try { var j = JSON.parse(xhr.responseText); if (j.detail) msg = j.detail; } catch (e) {}
      handleError(msg);
    })
    .always(function () { hideLoading(); });
  }

  // ---------- Recargar ----------
  function reloadConfig() {
    if (hasUnsavedChanges()) {
      if (!window.confirm('Hay cambios sin guardar. ¿Recargar desde disco y descartarlos?')) return;
    }
    showLoading('Recargando config.ini…');
    $.ajax({
      url: URLS.configReload,
      method: 'POST',
      headers: { 'X-CSRFToken': getCsrfToken() }
    })
    .done(function (data) {
      _configData = data;
      _originalSnapshot = snapshotValues(data);
      _selectedField = null;
      document.getElementById('detail-panel').classList.remove('visible');
      renderAll();
      handleSuccess('Datos recargados', 1800);
    })
    .fail(function (xhr) {
      var msg = 'Error al recargar config.ini';
      try { var j = JSON.parse(xhr.responseText); if (j.detail) msg = j.detail; } catch (e) {}
      handleError(msg);
    })
    .always(function () { hideLoading(); });
  }

  // Aviso al salir con cambios pendientes
  window.addEventListener('beforeunload', function (e) {
    if (hasUnsavedChanges()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ---------- Densidad ----------
  function setDensity(btn) {
    document.querySelectorAll('.cfg-density-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var d = btn.dataset.d || '';
    document.body.classList.remove('density-compact', 'density-comfortable');
    if (d) document.body.classList.add(d);
    localStorage.setItem('fixalius_density_config', d);
  }
  document.querySelectorAll('.cfg-density-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { setDensity(this); });
  });
  (function initDensity() {
    var saved = localStorage.getItem('fixalius_density_config') || 'density-compact';
    if (saved) document.body.classList.add(saved);
    document.querySelectorAll('.cfg-density-btn').forEach(function (b) {
      b.classList.toggle('active', (b.dataset.d || '') === saved);
    });
  })();

  // ---------- Dark mode ----------
  (function initTheme() {
    if (localStorage.getItem('fixalius_theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      var i = document.getElementById('darkmode-icon');
      if (i) i.className = 'fas fa-sun';
    }
  })();

  document.getElementById('btn-darkmode').addEventListener('click', function () {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fixalius_theme', next);
    var i = document.getElementById('darkmode-icon');
    if (i) i.className = next === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  });

  // ---------- Botones de acción ----------
  document.getElementById('btn-reload').addEventListener('click', reloadConfig);
  document.getElementById('btn-guardar').addEventListener('click', saveConfig);

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', fetchConfig);
})();