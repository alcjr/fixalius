/* =========================================================================
   table_page.js — factoría del patrón de página de tabla (intranet Fixalius)
   ========================================================================= */
(function (global, $) {
  'use strict';

  var root = document.documentElement;
  var LANG = (root.getAttribute('lang') || 'es').slice(0, 2);
  var LOCALE = LANG === 'en' ? 'en-GB' : 'es-ES';

  /* ------------------------------ utilidades ------------------------------ */
  function _(s) { return typeof global.gettext === 'function' ? global.gettext(s) : s; }
  function fmt(s) {
    var a = Array.prototype.slice.call(arguments, 1), i = 0;
    return String(s).replace(/%s/g, function () { return a[i++]; });
  }
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function parseDate(v) {
    if (!v) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(v) { var d = parseDate(v); return d ? d.toLocaleDateString(LOCALE) : '—'; }
  function fmtDateTime(v) {
    var d = parseDate(v);
    return d ? d.toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' }) : '—';
  }
  function fmtNumber(n) { return Number(n).toLocaleString(LOCALE); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var PALETTE = ['#0e7490', '#7c3aed', '#c2410c', '#15803d', '#b91c1c', '#1d4ed8', '#a21caf', '#4d7c0f'];
  function avatarColor(seed) {
    var h = 0, s = String(seed || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  function initials(s) {
    var w = String(s || '').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '?';
    return (w[0][0] + (w.length > 1 ? w[1][0] : '')).toUpperCase();
  }
  function csrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    if (m && m.getAttribute('content')) return m.getAttribute('content');
    var c = document.cookie.split(';').map(function (x) { return x.trim(); })
      .filter(function (x) { return x.indexOf('fg_csrftoken=') === 0; })[0];
    return c ? decodeURIComponent(c.substring('fg_csrftoken='.length)) : '';
  }
  function notify(msg, type, ms) { DevExpress.ui.notify({ message: msg, type: type || 'info', displayTime: ms || 3000 }); }
  function apiError(xhr, fallback) {
    if (xhr && xhr.status === 429) return _('Demasiadas peticiones. Espera un momento e inténtalo de nuevo.');
    if (xhr && xhr.status === 403) return _('No tienes permiso para realizar esta acción.');
    var j = null;
    try { j = xhr.responseJSON || JSON.parse(xhr.responseText); } catch (e) { /* no JSON */ }
    if (!j) return fallback;
    if (typeof j === 'string') return j;
    if (j.detail) return j.detail;
    var parts = [];
    $.each(j, function (k, v) {
      parts.push((k === 'non_field_errors' ? '' : k + ': ') + (Array.isArray(v) ? v.join(' ') : v));
    });
    return parts.join(' · ') || fallback;
  }

  /* -------- Cargando: contador para solapar peticiones sin parpadeo --------- */
  var busyCount = 0;
  function busy(on, msg) {
    var $o = $('#tp-loading');
    busyCount = Math.max(0, busyCount + (on ? 1 : -1));
    if (!$o.length) return;
    if (msg) $o.find('span').text(msg);
    $o.prop('hidden', busyCount === 0);
    if (busyCount === 0) $o.find('span').text(_('Cargando…'));
  }

  /* ------------------------ ayudas públicas para configs ------------------- */
  function lookupSource(listUrl, key, opts) {
    opts = opts || {};
    return {
      paginate: !opts.all,
      pageSize: opts.pageSize || (opts.all ? 0 : 20),
      store: new DevExpress.data.CustomStore({
        key: key,
        load: function (o) {
          var p = {};
          if (opts.all) {
            p.all = 1;
          } else {
            p.limit = o.take || 20;
            p.offset = o.skip || 0;
          }
          if (o.searchValue) p.search = o.searchValue;
          if (opts.ordering) p.ordering = opts.ordering;
          return $.getJSON(listUrl, p).then(function (r) {
            var rows = Array.isArray(r) ? r : (r.results || []);
            return { data: rows, totalCount: r.count != null ? r.count : rows.length };
          });
        },
        byKey: function (k) { return $.getJSON(listUrl + k + '/'); }
      })
    };
  }

  function imageField(ctx, o) {
    return {
      dataField: o.field,
      colSpan: o.colSpan || 2,
      label: { text: o.label || _('Imagen') },
      template: function (itemData, $item) {
        var maxMB = o.maxMB || 5;
        var $w = $('<div class="tp-img-field">').appendTo($item);
        var $prev = $('<div class="tp-img-preview">').appendTo($w);
        var $ctl = $('<div class="tp-img-ctl">').appendTo($w);
        var $up = $('<div>').appendTo($ctl);
        var $rm = $('<button type="button" class="tp-link-btn">').text(_('Quitar imagen')).appendTo($ctl);
        var objectUrl = null;

        function paint() {
          if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
          $prev.empty();
          var f = ctx.files[o.field], src = '';
          if (f) { objectUrl = URL.createObjectURL(f); src = objectUrl; }
          else if (!ctx.clear[o.field]) {
            var cur = String(ctx.data[o.field] || '');
            src = /^(https?:\/\/|\/)/i.test(cur) && cur.slice(0, 2) !== '//' ? cur : '';
          }
          if (src) $('<img>').attr({ src: src, alt: '' }).appendTo($prev);
          else $('<i class="far fa-image" aria-hidden="true">').appendTo($prev);
          $rm.prop('hidden', !src);
        }

        var uploader = $up.dxFileUploader({
          selectButtonText: _('Seleccionar imagen'),
          labelText: '',
          accept: 'image/*',
          allowedFileExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
          uploadMode: 'useForm',
          multiple: false,
          maxFileSize: maxMB * 1024 * 1024,
          invalidMaxFileSizeMessage: fmt(_('La imagen supera %s MB'), maxMB),
          invalidFileExtensionMessage: _('Formato no admitido (usa JPG, PNG, GIF o WebP)'),
          showFileList: false,
          onValueChanged: function (e) {
            var f = e.value && e.value[0] ? e.value[0] : null;
            ctx.files[o.field] = f;
            if (f) ctx.clear[o.field] = false;
            paint();
          }
        }).dxFileUploader('instance');

        $rm.on('click', function () {
          ctx.files[o.field] = null;
          ctx.clear[o.field] = true;
          uploader.reset();
          paint();
        });
        paint();
      }
    };
  }

  function detailRow(icon, label, $value) {
    return $('<div class="tp-detail-row">').append(
      $('<div class="tp-detail-label">').append($('<i class="fas ' + icon + '" aria-hidden="true">'), $('<span>').text(label)),
      $('<div class="tp-detail-value">').append($value)
    );
  }

  /* ================================ create ================================ */
  function create(cfg) {
    var $page = $('#tablePage');
    var state = { search: '', filters: {}, chip: 'all' };
    var lookups = {};
    var grid, kpiSeq = 0, searchTimer = null, ctxRow = null, firstKpi = true;

    if (cfg.urls.list.slice(-1) !== '/') cfg.urls.list += '/';
    function itemUrl(id) { return cfg.urls.list + id + '/'; }

    function filterParams() {
      var p = {};
      if (state.search) p.search = state.search;
      if (state.chip && state.chip !== 'all') p[cfg.chipParam || 'chip'] = state.chip;
      $.each(state.filters, function (param, v) { if (v) p[param] = v; });
      return p;
    }
    function orderingFrom(sort) {
      if (!sort) return '';
      if (!Array.isArray(sort)) sort = [sort];
      return sort.map(function (s) {
        var f = (cfg.orderingMap && cfg.orderingMap[s.selector]) || s.selector;
        return (s.desc ? '-' : '') + f;
      }).join(',');
    }

    var store = new DevExpress.data.CustomStore({
      key: cfg.key,
      load: function (o) {
        var p = filterParams();
        p.limit = o.take || 25;
        p.offset = o.skip || 0;
        var ord = orderingFrom(o.sort);
        if (ord) p.ordering = ord;
        return $.ajax({ url: cfg.urls.list, data: p, dataType: 'json' }).then(function (r) {
          var rows = Array.isArray(r) ? r : (r.results || []);
          return { data: rows, totalCount: r && r.count != null ? r.count : rows.length };
        });
      }
    });

    function send(method, url, values, files, clear) {
      var multi = Object.keys(files).some(function (k) { return files[k]; });
      var req = { url: url, method: method, headers: { 'X-CSRFToken': csrf() }, dataType: 'json' };
      if (multi) {
        var fd = new FormData();
        $.each(values, function (k, v) { if (v !== undefined && v !== null) fd.append(k, v); });
        $.each(files, function (k, f) { if (f) fd.append(k, f); });
        $.each(clear, function (k, c) { if (c && !files[k]) fd.append(k, ''); });
        req.data = fd; req.processData = false; req.contentType = false;
      } else {
        var body = $.extend({}, values);
        $.each(clear, function (k, c) { if (c) body[k] = null; });
        req.data = JSON.stringify(body); req.contentType = 'application/json';
      }
      return $.ajax(req);
    }

    /* ----------------------------------- grid ---------------------------------- */
    function actionsColumn() {
      return {
        caption: '', width: 112, fixed: true, fixedPosition: 'right', alignment: 'center',
        allowSorting: false, allowResizing: false, allowReordering: false, allowHiding: false,
        showInColumnChooser: false,
        cellTemplate: function (cont, o) {
          var $a = $('<div class="tp-cell tp-cell--center"><div class="tp-actions"></div></div>').appendTo(cont).find('.tp-actions');
          [['view', 'fa-eye', _('Ver ficha')], ['edit', 'fa-pen', _('Editar')], ['del', 'fa-trash-can', _('Eliminar')]].forEach(function (a) {
            $('<button type="button" class="tp-rbtn tp-rbtn--' + a[0] + '">')
              .attr({ title: a[2], 'aria-label': a[2] })
              .html('<i class="fas ' + a[1] + '" aria-hidden="true"></i>')
              .on('click', function (ev) { ev.stopPropagation(); act(a[0], o.data); })
              .appendTo($a);
          });
        }
      };
    }

    function act(action, row) {
      closeCtx();
      if (action === 'view') openDetail(row);
      else if (action === 'edit') openEditor(row);
      else if (action === 'del') confirmDelete(row);
    }

    function buildGrid() {
      grid = $('#gridContainer').dxDataGrid({
        dataSource: store,
        remoteOperations: { paging: true, sorting: true, filtering: false, grouping: false, summary: false },
        paging: { enabled: true, pageSize: parseInt($('#page-size').val(), 10) || 25 },
        pager: { visible: false },
        sorting: { mode: 'single' },
        columns: (cfg.columns || []).concat([actionsColumn()]),
        showBorders: false,
        showColumnLines: false,
        rowAlternationEnabled: true,
        hoverStateEnabled: false,
        allowColumnResizing: true,
        columnResizingMode: 'widget',
        columnAutoWidth: false,
        wordWrapEnabled: false,
        columnChooser: { enabled: true, mode: 'select', title: _('Columnas') },
        noDataText: _('Sin resultados. Prueba a cambiar o quitar los filtros.'),
        loadPanel: { enabled: true, text: _('Cargando…') },
        toolbar: { items: ['columnChooserButton'] },
        onRowPrepared: function (e) {
          if (e.rowType !== 'data') return;
          $(e.rowElement).on('contextmenu', function (ev) { ev.preventDefault(); openCtx(ev, e.data); });
        },
        onRowClick: function (e) { if (e.rowType === 'data') openDetail(e.data); },
        onContentReady: function (e) { grid = grid || e.component; renderPager(); stamp(); },
        onDataErrorOccurred: function (e) {
          notify(apiError(e.error && e.error.xhr, _('No se pudieron cargar los datos')), 'error', 5000);
        }
      }).dxDataGrid('instance');
    }

    function renderPager() {
      var ds = grid.getDataSource();
      var total = ds ? ds.totalCount() : 0;
      if (total < 0) total = 0;
      var size = grid.pageSize(), cur = grid.pageIndex();
      var pages = Math.max(1, Math.ceil(total / size));
      if (total > 0 && cur > pages - 1) { grid.pageIndex(pages - 1); return; }

      var from = total ? cur * size + 1 : 0, to = Math.min(total, (cur + 1) * size);
      $('#pager-info').text(total ? fmt(_('%s–%s de %s'), fmtNumber(from), fmtNumber(to), fmtNumber(total)) : _('Sin resultados'));

      var $c = $('#pager-controls').empty();
      function btn(label, page, opt) {
        opt = opt || {};
        return $('<button type="button" class="tp-pgbtn">').html(label).prop('disabled', !!opt.disabled)
          .toggleClass('is-active', !!opt.active).attr('aria-label', opt.aria || null)
          .attr('aria-current', opt.active ? 'page' : null)
          .on('click', function () { if (page !== cur) grid.pageIndex(page); }).appendTo($c);
      }
      btn('<i class="fas fa-angles-left" aria-hidden="true"></i>', 0, { disabled: cur === 0, aria: _('Primera página') });
      btn('<i class="fas fa-angle-left" aria-hidden="true"></i>', cur - 1, { disabled: cur === 0, aria: _('Página anterior') });
      var shown = {}, list = [];
      [0, cur - 1, cur, cur + 1, pages - 1].forEach(function (p) { if (p >= 0 && p < pages && !shown[p]) { shown[p] = 1; list.push(p); } });
      list.sort(function (a, b) { return a - b; });
      list.forEach(function (p, i) {
        if (i > 0 && p - list[i - 1] > 1) $('<span class="tp-pgdots">…</span>').appendTo($c);
        btn(String(p + 1), p, { active: p === cur, aria: fmt(_('Página %s'), p + 1) });
      });
      btn('<i class="fas fa-angle-right" aria-hidden="true"></i>', cur + 1, { disabled: cur >= pages - 1, aria: _('Página siguiente') });
      btn('<i class="fas fa-angles-right" aria-hidden="true"></i>', pages - 1, { disabled: cur >= pages - 1, aria: _('Última página') });
    }

    function stamp() {
      $('#last-update-text').text(new Date().toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }));
    }

    function applyFilters() {
      updateFilterBadge();
      if (grid.pageIndex() !== 0) grid.pageIndex(0); else grid.refresh();
      fetchKPIs();
    }
    function refreshAll() { grid.refresh(); fetchKPIs(); }

    function updateFilterBadge() {
      var n = 0;
      if (state.search) n++;
      if (state.chip !== 'all') n++;
      $.each(state.filters, function (k, v) { if (v) n++; });
      $('#filter-count').text(n).prop('hidden', n === 0);
    }

    function loadLookup(f) {
      var $sel = $('#filter-' + f.id);
      function fill(items) {
        $sel.find('option:not(:first)').remove();
        items.forEach(function (it) {
          var value = f.valueKey ? it[f.valueKey] : it, text = f.textKey ? it[f.textKey] : it;
          if (typeof f.textFn === 'function') text = f.textFn(value, it);
          $('<option>').val(value).text(trunc(text, f.truncate || 48)).attr('title', text).appendTo($sel);
        });
      }
      if (f.options) { lookups[f.id] = f.options; fill(f.options); return; }
      if (!f.url) return;
      $.getJSON(f.url, f.query || { limit: 500 }).done(function (r) {
        var items = Array.isArray(r) ? r : (r.results || []);
        lookups[f.id] = items;
        fill(items);
        if (r.count != null && r.count > items.length) $sel.attr('title', _('Lista parcial: usa la búsqueda para acotar'));
      });
    }

    function spark($el, arr) {
      $el.empty();
      if (!arr || arr.length < 2) { $el.prop('hidden', true); return; }
      var w = 84, h = 28, max = Math.max.apply(null, arr), min = Math.min.apply(null, arr), span = (max - min) || 1;
      var pts = arr.map(function (v, i) {
        return (i * (w / (arr.length - 1))).toFixed(1) + ',' + (h - 3 - ((v - min) / span) * (h - 6)).toFixed(1);
      }).join(' ');
      $el.html('<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="' + pts + '"/></svg>').prop('hidden', false);
    }
    function setKpi(k, value, trend) {
      var $v = $('#kpi-' + k.id).removeClass('loading');
      if (value == null) { $v.text('–'); spark($('#spark-' + k.id), null); return; }
      var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var target = Number(value), text = function (n) { return fmtNumber(Math.round(n)) + (k.suffix || ''); };
      if (!firstKpi || reduce || target > 100000) { $v.text(text(target)); }
      else {
        var t0 = performance.now();
        (function step(now) {
          var p = Math.min(1, (now - t0) / 500);
          $v.text(text(target * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(step);
        })(t0);
      }
      spark($('#spark-' + k.id), trend);
    }
    function fetchKPIs() {
      if (!cfg.urls.kpis || !(cfg.kpis || []).length) return;
      var seq = ++kpiSeq;
      cfg.kpis.forEach(function (k) { $('#kpi-' + k.id).addClass('loading'); });
      $.getJSON(cfg.urls.kpis, filterParams()).done(function (r) {
        if (seq !== kpiSeq) return;
        cfg.kpis.forEach(function (k) { setKpi(k, r[k.field], r.trends && r.trends[k.field]); });
        firstKpi = false;
      }).fail(function () {
        if (seq !== kpiSeq) return;
        cfg.kpis.forEach(function (k) { $('#kpi-' + k.id).removeClass('loading').text('–'); spark($('#spark-' + k.id), null); });
      });
    }

    var $ctx = $('#ctx-menu');
    function openCtx(ev, row) {
      ctxRow = row;
      $ctx.addClass('is-open');
      var w = $ctx.outerWidth(), h = $ctx.outerHeight();
      $ctx.css({ left: Math.max(8, Math.min(ev.clientX, window.innerWidth - w - 8)), top: Math.max(8, Math.min(ev.clientY, window.innerHeight - h - 8)) });
      $ctx.find('button').first().trigger('focus');
    }
    function closeCtx() { $ctx.removeClass('is-open'); }
    $ctx.on('click', 'button[data-action]', function () { var r = ctxRow; closeCtx(); if (r) act($(this).data('action'), r); });
    $(document).on('click', function (e) { if (!$(e.target).closest('#ctx-menu').length) closeCtx(); })
      .on('keydown', function (e) { if (e.key === 'Escape') closeCtx(); });
    $('.tp-grid-body').on('scroll wheel', closeCtx);

    function popupWidth(w) { return Math.min(w, Math.round(window.innerWidth * 0.96)); }
    function disposeLater(pop, $el) { setTimeout(function () { pop.dispose(); $el.remove(); }, 0); }

    function openDetail(row) {
      closeCtx();
      if (!cfg.detail) return;
      var $el = $('<div>').appendTo(document.body), pop;
      pop = $el.dxPopup({
        width: popupWidth(cfg.detail.width || 760), height: 'auto', maxHeight: '92vh',
        showTitle: true, showCloseButton: true, dragEnabled: true, hideOnOutsideClick: true,
        shading: true, shadingColor: 'rgba(0,0,0,.45)',
        wrapperAttr: { class: 'tp-popup' },
        titleTemplate: function () {
          return $('<div class="tp-popup-title">').append($('<i class="fas ' + (cfg.detail.icon || 'fa-circle-info') + '" aria-hidden="true">'), $('<span>').text(cfg.detail.title(row)));
        },
        contentTemplate: function (c) { c.append($('<div class="tp-scroll">').append(cfg.detail.render(row))); },
        toolbarItems: [
          { widget: 'dxButton', toolbar: 'bottom', location: 'after', options: { text: _('Editar'), icon: 'edit', type: 'default', stylingMode: 'contained', onClick: function () { pop.hide(); openEditor(row); } } },
          { widget: 'dxButton', toolbar: 'bottom', location: 'after', options: { text: _('Cerrar'), stylingMode: 'outlined', onClick: function () { pop.hide(); } } }
        ],
        onHidden: function () { disposeLater(pop, $el); }
      }).dxPopup('instance');
      pop.show();
    }

    function openEditor(row) {
      closeCtx();
      var isNew = !row;
      var ctx = { data: $.extend({}, isNew ? (cfg.form.defaults ? cfg.form.defaults() : {}) : row), files: {}, clear: {}, lookups: lookups, isNew: isNew };
      var $el = $('<div>').appendTo(document.body), pop, form;

      function save() {
        var v = form.validate();
        if (!v.isValid) return;
        var values = {};
        (cfg.form.fields || []).forEach(function (f) { values[f] = ctx.data[f]; });
        busy(true, _('Guardando…'));
        send(isNew ? 'POST' : 'PATCH', isNew ? cfg.urls.list : itemUrl(row[cfg.key]), values, ctx.files, ctx.clear)
          .done(function () {
            pop.hide();
            notify(isNew ? _('Registro creado') : _('Cambios guardados'), 'success', 2000);
            refreshAll();
          })
          .fail(function (xhr) { notify(apiError(xhr, _('No se pudo guardar')), 'error', 6000); })
          .always(function () { busy(false); });
      }

      pop = $el.dxPopup({
        width: popupWidth(cfg.form.width || 760), height: 'auto', maxHeight: '92vh',
        showTitle: true, showCloseButton: true, dragEnabled: true, hideOnOutsideClick: false,
        shading: true, shadingColor: 'rgba(0,0,0,.45)',
        wrapperAttr: { class: 'tp-popup' },
        titleTemplate: function () {
          return $('<div class="tp-popup-title">').append($('<i class="fas ' + (cfg.form.icon || 'fa-pen') + '" aria-hidden="true">'),
            $('<span>').text(isNew ? cfg.form.titleNew : cfg.form.titleEdit));
        },
        contentTemplate: function (c) {
          var $f = $('<div>');
          c.append($('<div class="tp-scroll">').append($f));
          form = $f.dxForm({
            formData: ctx.data, colCount: cfg.form.colCount || 2, labelLocation: 'top',
            showColonAfterLabel: false, requiredMark: '*', items: cfg.form.items(ctx)
          }).dxForm('instance');
        },
        toolbarItems: [
          { widget: 'dxButton', toolbar: 'bottom', location: 'after', options: { text: _('Guardar'), icon: 'save', type: 'default', stylingMode: 'contained', onClick: save } },
          { widget: 'dxButton', toolbar: 'bottom', location: 'after', options: { text: _('Cancelar'), stylingMode: 'outlined', onClick: function () { pop.hide(); } } }
        ],
        onHidden: function () { disposeLater(pop, $el); }
      }).dxPopup('instance');
      pop.show();
    }

    function confirmDelete(row) {
      var name = cfg.rowTitle ? cfg.rowTitle(row) : String(row[cfg.key]);
      var html = '<div class="tp-confirm"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i><div><strong>' +
        esc(_('¿Eliminar este registro?')) + '</strong><p>' + esc(trunc(name, 120)) + '</p><p>' +
        esc(cfg.deleteWarning || _('Esta acción no se puede deshacer.')) + '</p></div></div>';
      DevExpress.ui.dialog.confirm(html, _('Confirmar eliminación')).then(function (ok) {
        if (!ok) return;
        busy(true, _('Eliminando…'));
        $.ajax({ url: itemUrl(row[cfg.key]), method: 'DELETE', headers: { 'X-CSRFToken': csrf() } })
          .done(function () { notify(_('Registro eliminado'), 'success', 2000); refreshAll(); })
          .fail(function (xhr) { notify(apiError(xhr, _('No se pudo eliminar')), 'error', 6000); })
          .always(function () { busy(false); });
      });
    }

    function fetchAll() {
      var dfd = $.Deferred(), out = [], offset = 0, LIMIT = 500, MAX = 100;
      var p = filterParams();
      var ord = orderingFrom(grid.getDataSource().sort());
      if (ord) p.ordering = ord;
      (function next(n) {
        $.getJSON(cfg.urls.list, $.extend({}, p, { limit: LIMIT, offset: offset })).done(function (r) {
          var rows = Array.isArray(r) ? r : (r.results || []);
          out = out.concat(rows);
          offset += LIMIT;
          if (!Array.isArray(r) && r.count > offset && rows.length && n < MAX) next(n + 1); else dfd.resolve(out);
        }).fail(function (xhr) { dfd.reject(xhr); });
      })(0);
      return dfd.promise();
    }

    function exportExcel() {
      if (typeof ExcelJS === 'undefined' || typeof saveAs === 'undefined') { notify(_('La exportación a Excel no está disponible'), 'warning'); return; }
      var cols = cfg.exportColumns || [];
      busy(true, _('Generando Excel…'));
      fetchAll().then(function (rows) {
        var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(cfg.exportSheet || 'Datos');
        ws.columns = cols.map(function (c, i) { return { header: c.header, key: 'c' + i, width: c.width || 22, style: c.type === 'date' ? { numFmt: 'dd/mm/yyyy' } : {} }; });
        rows.forEach(function (r) { var o = {}; cols.forEach(function (c, i) { o['c' + i] = c.value(r); }); ws.addRow(o); });
        var head = ws.getRow(1);
        head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123E5A' } };
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
        return wb.xlsx.writeBuffer().then(function (buf) {
          saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            (cfg.exportName || 'Datos') + '_' + todayISO() + '.xlsx');
          notify(fmt(_('Excel exportado (%s filas)'), fmtNumber(rows.length)), 'success', 2500);
        });
      }).fail(function (xhr) { notify(apiError(xhr, _('Error al exportar')), 'error', 5000); })
        .always(function () { busy(false); });
    }

    function printPage() {
      var cols = cfg.exportColumns || [], rows = grid.getDataSource().items();
      if (!rows.length) { notify(_('No hay datos que imprimir'), 'warning'); return; }
      var h = '<h1>' + esc(cfg.printTitle || document.title) + '</h1><p>' + esc(new Date().toLocaleString(LOCALE)) + '</p><table><thead><tr>' +
        cols.map(function (c) { return '<th>' + esc(c.header) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr>' + cols.map(function (c) {
            var v = c.value(r); if (v instanceof Date) v = v.toLocaleDateString(LOCALE);
            return '<td>' + esc(v == null ? '' : v) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
      var w = window.open('', '_blank');
      if (!w) { notify(_('El navegador bloqueó la ventana de impresión'), 'warning'); return; }
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(cfg.printTitle || document.title) + '</title><style>body{font:12px Arial,sans-serif;margin:24px}h1{font-size:18px;margin:0 0 4px}p{color:#666;margin:0 0 14px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;vertical-align:top}th{background:#123e5a;color:#fff}tr:nth-child(even) td{background:#f6f8fc}</style></head><body>' + h + '</body></html>');
      w.document.close();
      w.focus();
      w.print();
    }

    function bindUI() {
      $('#filter-search').on('input', function () {
        var v = $.trim(this.value);
        $('#clear-search').prop('hidden', !this.value);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { state.search = v; applyFilters(); }, 300);
      });
      $('#clear-search').on('click', function () {
        $('#filter-search').val('').trigger('focus'); $(this).prop('hidden', true);
        clearTimeout(searchTimer); state.search = ''; applyFilters();
      });
      (cfg.filters || []).forEach(function (f) {
        loadLookup(f);
        $('#filter-' + f.id).on('change', function () { state.filters[f.param] = this.value; applyFilters(); });
      });
      $page.on('click', '[data-chip]', function () {
        state.chip = $(this).data('chip');
        $page.find('[data-chip]').removeClass('is-active').attr('aria-pressed', 'false');
        $(this).addClass('is-active').attr('aria-pressed', 'true');
        applyFilters();
      });
      $('#page-size').on('change', function () { grid.beginUpdate(); grid.pageSize(+this.value); grid.pageIndex(0); grid.endUpdate(); });

      function setDensity(d) {
        $page.attr('data-density', d);
        $page.find('[data-density-set]').each(function () {
          var on = $(this).data('density-set') === d;
          $(this).toggleClass('is-active', on).attr('aria-pressed', String(on));
        });
        try { localStorage.setItem('fixalius_density', d); } catch (e) { /* ignorar */ }
        if (grid) grid.updateDimensions();
      }
      var saved = 'compact';
      try { saved = localStorage.getItem('fixalius_density') || 'compact'; } catch (e) { /* ignorar */ }
      setDensity(saved);
      $page.on('click', '[data-density-set]', function () { setDensity($(this).data('density-set')); });

      function themeIcon() { $('#btn-theme i').attr('class', FixaliusTheme.get() === 'dark' ? 'fas fa-sun' : 'fas fa-moon'); }
      $('#btn-theme').on('click', function () { FixaliusTheme.toggle(); themeIcon(); });
      themeIcon();

      $('#btn-new').on('click', function () { openEditor(null); });
      $('#btn-refresh').on('click', function () {
        var $i = $(this).find('i').addClass('tp-spin');
        refreshAll();
        setTimeout(function () { $i.removeClass('tp-spin'); }, 600);
      });
      $('#btn-export').on('click', exportExcel);
      $('#btn-print').on('click', printPage);
    }

    if (cfg.locale !== false && DevExpress.localization && DevExpress.localization.locale) DevExpress.localization.locale(LANG);
    buildGrid();
    bindUI();
    updateFilterBadge();
    fetchKPIs();

    return { grid: grid, refresh: refreshAll, state: state, lookups: lookups };
  }

  global.FixaliusTable = {
    create: create,
    util: {
      esc: esc,
      trunc: trunc,
      safeUrl: safeUrl,
      fmt: fmt,
      fmtDate: fmtDate,
      fmtDateTime: fmtDateTime,
      parseDate: parseDate,
      todayISO: todayISO,
      initials: initials,
      avatarColor: avatarColor,
      csrf: csrf                       // ⬅️ NUEVO: expuesto para configs
    },
    lookupSource: lookupSource,
    imageField: imageField,
    detailRow: detailRow,
    _: _
  };
})(window, jQuery);