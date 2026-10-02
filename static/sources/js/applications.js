/* ============================================================
   applications.js — Fixalius · Casos de éxito (SuccessCase)
   ============================================================ */
(function () {
  'use strict';

  var URLS   = JSON.parse(document.getElementById('app-urls').textContent || '{}');
  var I18N   = JSON.parse(document.getElementById('app-i18n').textContent || '{}');
  var $      = window.jQuery;

  // ---------- i18n shorthand ----------
  function T(k) { return I18N[k] || k; }

  // ---------- CSRF ----------
  function csrf() {
    var el = document.querySelector('meta[name="csrf-token"]');
    return el ? el.getAttribute('content') : (window.getCookie ? window.getCookie('csrftoken') : '');
  }

  // ---------- Estado global ----------
  var state = {
    all: [],
    filtered: [],
    page: 0,
    pageSize: 25,
    search: '',
    sector: '',
    chip: 'all',
    sectors: [],
    clients: [],
    grid: null
  };

  // ---------- Utilidades ----------
  function esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function extractError(xhr, fallback) {
    var j = null;
    try { j = JSON.parse(xhr.responseText); } catch (e) {}
    if (!j) return fallback;
    if (j.detail) return j.detail;
    if (j.error) return j.error;
    var parts = [];
    Object.keys(j).forEach(function (k) {
      var v = j[k];
      if (Array.isArray(v)) parts.push(k + ': ' + v.join(' '));
      else if (typeof v === 'string') parts.push(k + ': ' + v);
    });
    return parts.length ? parts.join(' | ') : fallback;
  }
  function notify(msg, type, dur) {
    if (window.DevExpress && DevExpress.ui && DevExpress.ui.notify) {
      DevExpress.ui.notify({ message: msg, type: type || 'info', displayTime: dur || 3000 });
    } else {
      console.log('[notify:' + (type || 'info') + ']', msg);
    }
  }

  // ---------- Filtros ----------
  function applyFilters() {
    var list = state.all.slice();
    var s = state.search.toLowerCase().trim();

    if (s) {
      list = list.filter(function (r) {
        return (r.descripcion_case || '').toLowerCase().indexOf(s) >= 0
            || (r.sector_case      || '').toLowerCase().indexOf(s) >= 0
            || (r.client_name      || '').toLowerCase().indexOf(s) >= 0;
      });
    }
    if (state.sector) {
      list = list.filter(function (r) { return r.sector_case === state.sector; });
    }
    if (state.chip === 'this-year') {
      var y = new Date().getFullYear();
      list = list.filter(function (r) { return r.date_case && r.date_case.indexOf(String(y)) === 0; });
    } else if (state.chip === 'last-year') {
      var y2 = new Date().getFullYear() - 1;
      list = list.filter(function (r) { return r.date_case && r.date_case.indexOf(String(y2)) === 0; });
    }
    state.filtered = list;
  }

  // ---------- KPIs ----------
  function renderKPIs() {
    var total = state.all.length;
    var y = new Date().getFullYear();
    var thisYear = state.all.filter(function (r) { return (r.date_case || '').indexOf(String(y)) === 0; }).length;
    var sectors = {};
    var clients = {};
    state.all.forEach(function (r) {
      if (r.sector_case) sectors[r.sector_case] = 1;
      if (r.id_client)   clients[r.id_client]   = 1;
    });
    document.getElementById('kpi-total').textContent   = total;
    document.getElementById('kpi-year').textContent    = thisYear;
    document.getElementById('kpi-sectors').textContent = Object.keys(sectors).length;
    document.getElementById('kpi-clients').textContent = Object.keys(clients).length;
  }

  // ---------- Selects ----------
  function fillSectorFilter() {
    var set = {};
    state.all.forEach(function (r) { if (r.sector_case) set[r.sector_case] = 1; });
    var sel = document.getElementById('filter-sector');
    var cur = sel.value;
    sel.innerHTML = '<option value="">' + T('allSectors') + '</option>';
    Object.keys(set).sort().forEach(function (s) {
      var o = document.createElement('option');
      o.value = s; o.textContent = s;
      sel.appendChild(o);
    });
    sel.value = cur || '';
  }

  // ---------- Pager ----------
  function renderPager() {
    var total = state.filtered.length;
    var pages = Math.max(1, Math.ceil(total / state.pageSize));
    var cur = Math.min(state.page, pages - 1);
    state.page = cur;
    var start = cur * state.pageSize + 1;
    var end   = Math.min((cur + 1) * state.pageSize, total);

    var info = document.getElementById('pager-info');
    info.textContent = total === 0
      ? T('noResults')
      : start + '–' + end + ' ' + T('of') + ' ' + total;

    var ctrl = document.getElementById('pager-controls');
    ctrl.innerHTML = '';

    function mkBtn(label, disabled, fn, active) {
      var b = document.createElement('button');
      b.className = 'apps-page-btn' + (active ? ' active' : '');
      b.textContent = label;
      b.disabled = disabled;
      if (!disabled && fn) b.onclick = fn;
      return b;
    }

    ctrl.appendChild(mkBtn('‹', cur === 0, function () { state.page = cur - 1; renderGrid(); }));
    var startP = Math.max(0, cur - 2);
    var endP   = Math.min(pages - 1, startP + 4);
    startP = Math.max(0, endP - 4);
    for (var i = startP; i <= endP; i++) {
      (function (pi) {
        ctrl.appendChild(mkBtn(String(pi + 1), false, function () {
          state.page = pi; renderGrid();
        }, pi === cur));
      })(i);
    }
    ctrl.appendChild(mkBtn('›', cur >= pages - 1, function () { state.page = cur + 1; renderGrid(); }));
  }

  // ---------- Grid (DevExtreme) ----------
  function renderGrid() {
    applyFilters();
    renderKPIs();
    renderPager();

    var start = state.page * state.pageSize;
    var pageData = state.filtered.slice(start, start + state.pageSize);

    if (!state.grid) {
      state.grid = $('#appsGrid').dxDataGrid({
        dataSource: pageData,
        showBorders: false,
        rowAlternationEnabled: true,
        columnAutoWidth: false,
        hoverStateEnabled: true,
        paging: { enabled: false },
        filterRow:   { visible: false },
        headerFilter:{ visible: false },
        searchPanel: { visible: false },
        toolbar: {
          items: [
            { location: 'before', widget: 'dxButton',
              options: { icon: 'plus', text: T('newApp'), type: 'default',
                         onClick: openCreate } },
            { location: 'after', widget: 'dxButton',
              options: { icon: 'refresh', hint: T('refresh'), stylingMode: 'text',
                         onClick: function () { loadAll(); } } },
            { location: 'after', widget: 'dxButton',
              options: { icon: 'exportxlsx', hint: T('exportExcel'), stylingMode: 'text',
                         onClick: exportExcel } },
            { location: 'after', widget: 'dxButton',
              options: { icon: 'print', hint: T('print'), stylingMode: 'text',
                         onClick: printGrid } },
            'columnChooserButton'
          ]
        },
        columns: [
          {
            caption: '', width: 70, fixed: true, fixedPosition: 'left',
            allowSorting: false, allowFiltering: false, allowResizing: false,
            cellTemplate: function (c, o) {
              var img = o.data.image_url;
              var $w = $('<div class="apps-cell-thumb">');
              if (img) {
                $('<img class="apps-thumb">').attr('src', img).attr('alt', '').appendTo($w);
              } else {
                $('<div class="apps-thumb apps-thumb--placeholder"><i class="fas fa-image"></i></div>').appendTo($w);
              }
              $w.appendTo(c);
            }
          },
          {
            dataField: 'descripcion_case', caption: T('description'),
            minWidth: 260,
            cellTemplate: function (c, o) {
              var txt = o.data.descripcion_case || '';
              var shortTxt = txt.length > 90 ? txt.slice(0, 90) + '…' : txt;
              $('<div>').append(
                $('<div class="apps-cell-title">').text(shortTxt),
                $('<div class="apps-cell-sub">').text(o.data.client_name || '—')
              ).appendTo(c);
            }
          },
          {
            dataField: 'sector_case', caption: T('sector'), width: 140,
            cellTemplate: function (c, o) {
              if (o.value) $('<span class="apps-badge">').text(o.value).appendTo(c);
              else c.textContent = '—';
            }
          },
          {
            dataField: 'date_case', caption: T('date'), width: 110, dataType: 'date',
            format: 'dd/MM/yyyy',
            calculateCellValue: function (r) { return r.date_case; }
          },
          {
            dataField: 'www_case', caption: 'URL', width: 200,
            cellTemplate: function (c, o) {
              if (o.value) {
                $('<a class="apps-link-ext">')
                  .attr('href', o.value).attr('target', '_blank').attr('rel', 'noopener')
                  .html(esc(o.value.replace(/^https?:\/\//, '')) + ' <i class="fas fa-arrow-up-right-from-square"></i>')
                  .appendTo(c);
              } else c.textContent = '—';
            }
          },
          {
            caption: '', width: 140, alignment: 'center', fixed: true, fixedPosition: 'right',
            allowSorting: false, allowFiltering: false, allowResizing: false,
            cellTemplate: function (c, o) {
              var $w = $('<div>').css({ display: 'flex', gap: '4px', justifyContent: 'center' });
              $('<button class="apps-icon-btn" title="' + T('view') + '">')
                .html('<i class="fas fa-eye"></i>')
                .on('click', function (e) { e.stopPropagation(); openDetail(o.data); })
                .appendTo($w);
              $('<button class="apps-icon-btn" title="' + T('edit') + '">')
                .html('<i class="fas fa-pen"></i>')
                .on('click', function (e) { e.stopPropagation(); openEdit(o.data); })
                .appendTo($w);
              $('<button class="apps-icon-btn" title="' + T('delete') + '">')
                .html('<i class="fas fa-trash"></i>')
                .on('click', function (e) { e.stopPropagation(); confirmDelete(o.data); })
                .appendTo($w);
              $w.appendTo(c);
            }
          }
        ],
        onRowDblClick: function (e) { openDetail(e.data); }
      }).dxDataGrid('instance');
    } else {
      state.grid.option('dataSource', pageData);
    }
  }

  // ---------- Carga de datos ----------
  function loadAll() {
    var icon = document.getElementById('refresh-icon');
    if (icon) icon.classList.add('fa-spin');
    window.showLoading && window.showLoading(T('loading'));

    $.when(
      $.getJSON(URLS.list),
      $.getJSON(URLS.clients)
    ).done(function (listResp, clientsResp) {
      state.all     = (listResp[0] && listResp[0].results) || listResp[0] || [];
      state.clients = (clientsResp[0] && clientsResp[0].results) || clientsResp[0] || [];

      fillSectorFilter();
      fillClientSelect();
      state.page = 0;
      renderGrid();
      updateTimestamp();
    }).fail(function (xhr) {
      notify(extractError(xhr, T('loadError')), 'error');
    }).always(function () {
      if (icon) icon.classList.remove('fa-spin');
      window.hideLoading && window.hideLoading();
    });
  }

  function updateTimestamp() {
    var el = document.getElementById('last-update-text');
    if (!el) return;
    var now = new Date();
    el.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- Modal helpers ----------
  function openModal(id) {
    var el = document.getElementById(id);
    if (el) { el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
  }
  function closeModal(id) {
    var el = document.getElementById(id);
    if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-close]');
    if (btn) closeModal(btn.getAttribute('data-close'));
    if (e.target.classList && e.target.classList.contains('apps-modal')) {
      closeModal(e.target.id);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.apps-modal.open').forEach(function (m) { closeModal(m.id); });
    }
  });

  // ---------- Formulario ----------
  function fillClientSelect() {
    var sel = document.getElementById('field-client');
    sel.innerHTML = '<option value="">' + T('selectClient') + '</option>';
    state.clients.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.id_client;
      o.textContent = c.descripcion_client || ('#' + c.id_client);
      sel.appendChild(o);
    });
  }

  function resetForm() {
    var form = document.getElementById('edit-form');
    form.reset();
    document.getElementById('field-id').value = '';
    document.getElementById('image-preview').innerHTML = '<i class="fas fa-image"></i>';
    var err = document.getElementById('edit-form-error');
    err.textContent = ''; err.classList.remove('visible');
  }

  function openCreate() {
    resetForm();
    document.getElementById('edit-modal-title').textContent = T('newApp');
    // Fecha por defecto: hoy
    document.getElementById('field-date').value = new Date().toISOString().slice(0, 10);
    openModal('edit-modal');
  }

  function openEdit(row) {
    resetForm();
    document.getElementById('edit-modal-title').textContent = T('editApp');
    document.getElementById('field-id').value          = row.id_case;
    document.getElementById('field-client').value      = row.id_client;
    document.getElementById('field-sector').value      = row.sector_case || '';
    document.getElementById('field-date').value        = row.date_case || '';
    document.getElementById('field-description').value = row.descripcion_case || '';
    document.getElementById('field-www').value         = row.www_case || '';
    if (row.image_url) {
      var img = new Image();
      img.src = row.image_url;
      var prev = document.getElementById('image-preview');
      prev.innerHTML = ''; prev.appendChild(img);
    }
    openModal('edit-modal');
  }

  // Preview de imagen
  document.getElementById('field-image').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var prev = document.getElementById('image-preview');
      prev.innerHTML = '';
      var img = new Image(); img.src = ev.target.result;
      prev.appendChild(img);
    };
    reader.readAsDataURL(f);
  });
  document.getElementById('btn-clear-image').addEventListener('click', function () {
    document.getElementById('field-image').value = '';
    document.getElementById('image-preview').innerHTML = '<i class="fas fa-image"></i>';
  });

  // Submit del formulario
  document.getElementById('edit-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var id = document.getElementById('field-id').value;
    var err = document.getElementById('edit-form-error');
    err.textContent = ''; err.classList.remove('visible');

    // Validación mínima
    var client   = form.id_client.value;
    var sector   = form.sector_case.value.trim();
    var date     = form.date_case.value;
    var desc     = form.descripcion_case.value.trim();
    if (!client || !sector || !date || !desc) {
      err.textContent = T('requiredFields');
      err.classList.add('visible');
      return;
    }

    var fd = new FormData();
    fd.append('id_client',        client);
    fd.append('sector_case',      sector);
    fd.append('date_case',        date);
    fd.append('descripcion_case', desc);
    fd.append('www_case',         form.www_case.value.trim());
    var imgInput = document.getElementById('field-image');
    if (imgInput.files && imgInput.files[0]) {
      fd.append('image_case', imgInput.files[0]);
    }

    var submitBtn = document.getElementById('edit-submit');
    submitBtn.disabled = true;
    var method = id ? 'PATCH' : 'POST';
    var url    = id ? (URLS.detail.replace('__ID__', id)) : URLS.list;

    // Django no acepta PATCH con FormData en todos los setups; usamos POST + _method
    // para máxima compatibilidad si el backend lo soporta, o POST con _method=patch
    var finalMethod = id ? 'POST' : 'POST';
    if (id) fd.append('_method', 'PATCH');

    fetch(url, {
      method: finalMethod,
      headers: { 'X-CSRFToken': csrf() },
      body: fd,
      credentials: 'same-origin'
    })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) {
          throw new Error(extractError({ responseText: t }, T('saveError')));
        });
        return r.json();
      })
      .then(function () {
        closeModal('edit-modal');
        notify(id ? T('updated') : T('created'), 'success');
        loadAll();
      })
      .catch(function (e) {
        err.textContent = e.message || T('saveError');
        err.classList.add('visible');
      })
      .finally(function () { submitBtn.disabled = false; });
  });

  // ---------- Detalle ----------
  function openDetail(row) {
    document.getElementById('detail-modal-title').textContent = T('detail');
    var body = document.getElementById('detail-body');
    var img = row.image_url
      ? '<img src="' + esc(row.image_url) + '" alt="">'
      : '<div class="apps-thumb apps-thumb--placeholder" style="width:96px;height:96px;font-size:28px"><i class="fas fa-image"></i></div>';

    body.innerHTML =
      '<div class="apps-detail-hero">' +
        img +
        '<div class="apps-detail-hero-info">' +
          '<h3>' + esc(row.client_name || T('noClient')) + '</h3>' +
          '<p><span class="apps-badge">' + esc(row.sector_case || '—') + '</span></p>' +
          '<p style="margin-top:6px">' + T('date') + ': <b>' + fmtDate(row.date_case) + '</b></p>' +
        '</div>' +
      '</div>' +
      '<dl class="apps-detail-grid">' +
        '<dt>ID</dt><dd>#' + esc(row.id_case) + '</dd>' +
        '<dt>' + T('website') + '</dt><dd>' +
          (row.www_case
            ? '<a class="apps-link-ext" href="' + esc(row.www_case) + '" target="_blank" rel="noopener">' + esc(row.www_case) + '</a>'
            : '—') +
        '</dd>' +
        '<dt>' + T('created') + '</dt><dd>' + fmtDate(row.alta) + '</dd>' +
        '<dt>' + T('updated') + '</dt><dd>' + fmtDate(row.update) + '</dd>' +
      '</dl>' +
      '<div class="apps-detail-desc">' + esc(row.descripcion_case || '') + '</div>';

    openModal('detail-modal');
  }

  // ---------- Eliminar ----------
  function confirmDelete(row) {
    var msg = T('confirmDelete').replace('{0}', row.client_name || ('#' + row.id_case));
    if (!window.confirm(msg)) return;
    window.showLoading && window.showLoading(T('deleting'));
    fetch(URLS.detail.replace('__ID__', row.id_case), {
      method: 'DELETE',
      headers: { 'X-CSRFToken': csrf() },
      credentials: 'same-origin'
    })
      .then(function (r) {
        if (!r.ok) throw new Error(T('deleteError'));
        notify(T('deleted'), 'success');
        loadAll();
      })
      .catch(function (e) { notify(e.message, 'error'); })
      .finally(function () { window.hideLoading && window.hideLoading(); });
  }

  // ---------- Export / Print ----------
  function exportExcel() {
    if (!window.ExcelJS || !window.DevExpress || !DevExpress.excelExporter) {
      notify(T('missingLibs'), 'warning'); return;
    }
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet(T('appsSheet'));
    DevExpress.excelExporter.exportDataGrid({
      component: state.grid,
      worksheet: ws,
      autoFilterEnabled: true,
      customizeCell: function (o) {
        if (o.gridCell.rowType === 'header') {
          o.excelCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          o.excelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123E5A' } };
        }
      }
    }).then(function () {
      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      saveAs(new Blob([buf], { type: 'application/octet-stream' }),
             'Fixalius_aplicaciones_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    });
  }

  function printGrid() {
    var rows = state.filtered;
    if (!rows.length) { notify(T('noData'), 'warning'); return; }
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + T('appsTitle') + '</title>' +
      '<style>body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#111827}' +
      'h1{font-size:22px;color:#123e5a;margin:0 0 4px}small{color:#6b7280}' +
      'table{width:100%;border-collapse:collapse;margin-top:16px;font-size:11px}' +
      'th{background:#f1f5f9;text-align:left;padding:8px;border:1px solid #e2e8f0;color:#334155}' +
      'td{padding:7px 8px;border:1px solid #e2e8f0;vertical-align:top}' +
      '</style></head><body>' +
      '<h1>' + T('appsTitle') + '</h1>' +
      '<small>' + new Date().toLocaleDateString('es-ES') + ' · ' + rows.length + ' ' + T('appsCount') + '</small>' +
      '<table><thead><tr>' +
      '<th>' + T('sector') + '</th><th>' + T('client') + '</th><th>' + T('date') + '</th>' +
      '<th>' + T('description') + '</th><th>' + T('website') + '</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr>' +
        '<td>' + esc(r.sector_case || '—') + '</td>' +
        '<td>' + esc(r.client_name || '—') + '</td>' +
        '<td>' + fmtDate(r.date_case) + '</td>' +
        '<td>' + esc(r.descripcion_case || '') + '</td>' +
        '<td>' + esc(r.www_case || '—') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></body></html>';
    var w = window.open('', '_blank', 'width=1024,height=768');
    if (!w) { notify(T('popupBlocked'), 'warning'); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(function () { w.print(); }, 400);
  }

  // ---------- Eventos de filtros ----------
  var searchTimer;
  document.getElementById('filter-search').addEventListener('input', function (e) {
    var v = e.target.value.trim();
    document.getElementById('clear-search').classList.toggle('visible', v.length > 0);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.search = v; state.page = 0; renderGrid();
    }, 220);
  });
  document.getElementById('clear-search').addEventListener('click', function () {
    document.getElementById('filter-search').value = '';
    this.classList.remove('visible');
    state.search = ''; state.page = 0; renderGrid();
  });
  document.getElementById('filter-sector').addEventListener('change', function () {
    state.sector = this.value; state.page = 0; renderGrid();
  });
  document.querySelectorAll('.apps-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.apps-chip').forEach(function (c) { c.classList.remove('active'); });
      this.classList.add('active');
      state.chip = this.getAttribute('data-filter');
      state.page = 0; renderGrid();
    });
  });
  document.getElementById('btn-refresh').addEventListener('click', loadAll);

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

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', loadAll);
})();