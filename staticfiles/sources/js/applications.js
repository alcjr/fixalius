/* applications.js — tabla «Aplicaciones» (SuccessCase) */
(function (global, $) {
  'use strict';

  var FT = global.FixaliusTable;
  var U = global.FIXALIUS_PAGE.urls;
  var _ = FT._;
  var u = FT.util;

  var missing = Object.keys(global.FIXALIUS_PAGE.expected || {}).filter(function (k) { return !U[k]; });
  if (missing.length) {
    var $box = $('<div class="tp-apierror" role="alert">').append(
      $('<strong>').text(_('Faltan rutas de la API para esta tabla')),
      $('<p>').text(_('Registra estos nombres de URL o ajústalos en applications.html:')),
      $('<ul>').append(missing.map(function (k) { return $('<li>').append($('<code>').text(global.FIXALIUS_PAGE.expected[k])); }))
    );
    $('#gridContainer').empty().append($box);
    $('#pager-info').text('—');
    return;
  }

  function thumb(d) {
    var $t = $('<div class="tp-thumb">');
    var src = d.image_case || '';
    if (src && /^(https?:\/\/|\/(?!\/))/i.test(src)) {
      $('<img>').attr({ src: src, alt: '', loading: 'lazy' }).appendTo($t);
    } else {
      $t.css('background', u.avatarColor(d.sector_name)).text(u.initials(d.sector_name));
    }
    return $t;
  }

  function rowTitle(d) {
    var t = d.title || d.descripcion_case || '';
    return u.trunc(t, 80) + ' (' + (d.client_name ? u.trunc(d.client_name, 40) : '#' + d.id) + ')';
  }

  FT.create({
    key: 'id',
    urls: { list: U.list, kpis: U.kpis },
    chipParam: 'chip',
    printTitle: _('Aplicaciones'),
    exportName: 'Aplicaciones',
    exportSheet: _('Aplicaciones'),
    rowTitle: rowTitle,
    deleteWarning: _('Se eliminará la aplicación; el cliente no se verá afectado.'),

    orderingMap: {
      client_name: 'client__nombre_client',
      sector_name: 'sector__nombre_sector'
    },

    filters: [
      { id: 'sector', param: 'sector', url: U.sectors, query: {},
        valueKey: 'id', textKey: 'name' },
      { id: 'client', param: 'client', url: U.clients,
        query: { limit: 500, ordering: 'nombre_client' },
        valueKey: 'id', textKey: 'nombre_client', truncate: 46 }
    ],

    kpis: [
      { id: 'total',   field: 'total' },
      { id: 'clients', field: 'clients' },
      { id: 'sectors', field: 'sectors' },
      { id: 'year',    field: 'year' }
    ],

    columns: [
      {
        dataField: 'title', caption: _('Aplicación'), minWidth: 320,
        cellTemplate: function (cont, o) {
          var d = o.data;
          var $text = $('<div style="min-width:0">').append(
            $('<div class="tp-primary">').text(d.title || d.descripcion_case || '—').attr('title', d.title || d.descripcion_case || ''),
            $('<div class="tp-secondary">').text('#' + d.id)
          );
          $('<div class="tp-cell tp-media">').append(thumb(d), $text).appendTo(cont);
        }
      },
      {
        dataField: 'client_name', caption: _('Cliente'), width: 230,
        cellTemplate: function (cont, o) {
          var d = o.data;
          $('<div class="tp-cell tp-ellipsis">').append(
            $('<span>').text(u.trunc(d.client_name || '—', 60)).attr('title', d.client_name || '')
          ).appendTo(cont);
        }
      },
      {
        dataField: 'sector_name', caption: _('Sector'), width: 160,
        cellTemplate: function (cont, o) {
          $('<div class="tp-cell">').append(
            $('<span class="tp-badge">').text(o.value || '—').attr('title', o.value || '')
          ).appendTo(cont);
        }
      },
      {
        dataField: 'date_case', caption: _('Fecha'), dataType: 'date', width: 120,
        sortOrder: 'desc', sortIndex: 0,
        cellTemplate: function (cont, o) { $('<div class="tp-cell">').text(u.fmtDate(o.value)).appendTo(cont); }
      },
      {
        dataField: 'www_case', caption: _('Web'), width: 70, alignment: 'center', allowSorting: false,
        cellTemplate: function (cont, o) {
          var href = u.safeUrl(o.value), $c = $('<div class="tp-cell tp-cell--center">').appendTo(cont);
          if (!href) { $c.append($('<span class="tp-muted">').text('—')); return; }
          $('<a class="tp-link" target="_blank" rel="noopener noreferrer">')
            .attr({ href: href, title: href, 'aria-label': _('Abrir sitio web') })
            .html('<i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>')
            .on('click', function (e) { e.stopPropagation(); })
            .appendTo($c);
        }
      },
      {
        dataField: 'alta', caption: _('Alta'), dataType: 'datetime', width: 150, visible: false,
        cellTemplate: function (cont, o) { $('<div class="tp-cell">').text(u.fmtDateTime(o.value)).appendTo(cont); }
      },
      {
        dataField: 'update', caption: _('Última actualización'), dataType: 'datetime', width: 170, visible: false,
        cellTemplate: function (cont, o) { $('<div class="tp-cell">').text(u.fmtDateTime(o.value)).appendTo(cont); }
      }
    ],

    detail: {
      icon: 'fa-trophy',
      width: 760,
      title: function (d) { return u.trunc(d.title || d.descripcion_case, 70); },
      render: function (d) {
        var $w = $('<div>');
        var $img = $('<div class="tp-detail-img">');
        if (d.image_case && /^(https?:\/\/|\/(?!\/))/i.test(d.image_case)) {
          $('<img>').attr({ src: d.image_case, alt: '' }).appendTo($img);
        } else {
          $img.css('background', u.avatarColor(d.sector_name)).text(u.initials(d.sector_name));
        }
        $w.append($('<div class="tp-detail-hero">').append($img, $('<div>').append(
          $('<h3>').text(d.client_name || '—'),
          $('<span class="tp-badge">').text(d.sector_name || '—')
        )));

        var href = u.safeUrl(d.www_case);
        var $web = href
          ? $('<a class="tp-link" target="_blank" rel="noopener noreferrer">').attr('href', href).text(href)
          : $('<span class="tp-muted">').text('—');

        $w.append(
          d.title ? FT.detailRow('fa-heading', _('Título'), document.createTextNode(d.title)) : null,
          FT.detailRow('fa-align-left', _('Descripción'), document.createTextNode(d.descripcion_case || '—')),
          FT.detailRow('fa-calendar-day', _('Fecha de la aplicación'), document.createTextNode(u.fmtDate(d.date_case))),
          FT.detailRow('fa-globe', _('Sitio web'), $web),
          FT.detailRow('fa-clock', _('Alta'), document.createTextNode(u.fmtDateTime(d.alta))),
          FT.detailRow('fa-rotate', _('Última actualización'), document.createTextNode(u.fmtDateTime(d.update)))
        );
        return $w;
      }
    },

    form: {
      icon: 'fa-trophy',
      titleNew: _('Nueva aplicación'),
      titleEdit: _('Editar aplicación'),
      width: 760,
      colCount: 1,
      fields: ['client', 'sector', 'title', 'date_case', 'www_case', 'descripcion_case'],
      defaults: function () { return { date_case: u.todayISO() }; },
      items: function (ctx) {
        return [
          {
            itemType: 'group', caption: _('Datos de la aplicación'), colCount: 2, items: [
              {
                dataField: 'client', colSpan: 2, label: { text: _('Cliente') }, editorType: 'dxSelectBox',
                editorOptions: {
                  dataSource: FT.lookupSource(U.clients, 'id', { ordering: 'nombre_client' }),
                  valueExpr: 'id',
                  displayExpr: function (i) { return i ? u.trunc(i.nombre_client, 90) : ''; },
                  searchEnabled: true, searchTimeout: 300, minSearchLength: 0,
                  placeholder: _('Busca y selecciona un cliente…'),
                  noDataText: _('Sin resultados')
                },
                validationRules: [{ type: 'required', message: _('El cliente es obligatorio') }]
              },
              {
                dataField: 'sector', label: { text: _('Sector') }, editorType: 'dxSelectBox',
                editorOptions: {
                  dataSource: FT.lookupSource(U.sectors_all, 'id', { ordering: 'nombre_sector' }),
                  valueExpr: 'id', displayExpr: 'nombre_sector',
                  searchEnabled: true, searchTimeout: 300, minSearchLength: 0,
                  placeholder: _('Elige un sector…'), noDataText: _('Sin resultados')
                },
                validationRules: [{ type: 'required', message: _('El sector es obligatorio') }]
              },
              {
                dataField: 'title', colSpan: 2, label: { text: _('Título') },
                editorOptions: { maxLength: 200, placeholder: _('Título corto del caso') },
                validationRules: [{ type: 'stringLength', max: 200, message: _('Máximo 200 caracteres') }]
              },
              {
                dataField: 'date_case', label: { text: _('Fecha de la aplicación') }, editorType: 'dxDateBox',
                editorOptions: { type: 'date', displayFormat: 'dd/MM/yyyy', dateSerializationFormat: 'yyyy-MM-dd', openOnFieldClick: true, showClearButton: false },
                validationRules: [{ type: 'required', message: _('La fecha es obligatoria') }]
              },
              {
                dataField: 'www_case', colSpan: 2, label: { text: _('Sitio web') },
                editorOptions: { maxLength: 255, placeholder: 'https://…' },
                validationRules: [{ type: 'pattern', pattern: /^https?:\/\/\S+$/i, message: _('Introduce una URL que empiece por http:// o https://') }]
              }
            ]
          },
          {
            itemType: 'group', caption: _('Contenido'), items: [
              {
                dataField: 'descripcion_case', label: { text: _('Descripción') }, editorType: 'dxTextArea',
                editorOptions: { height: 140, maxLength: 4000, autoResizeEnabled: false },
                validationRules: [{ type: 'required', message: _('La descripción es obligatoria') }]
              },
              FT.imageField(ctx, { field: 'image_case', label: _('Imagen / logo'), colSpan: 1, maxMB: 5 })
            ]
          }
        ];
      }
    },

    exportColumns: [
      { header: _('ID'),          width: 8,  value: function (r) { return r.id; } },
      { header: _('Título'),      width: 40, value: function (r) { return r.title; } },
      { header: _('Descripción'), width: 60, value: function (r) { return r.descripcion_case; } },
      { header: _('Cliente'),     width: 36, value: function (r) { return r.client_name; } },
      { header: _('Sector'),      width: 22, value: function (r) { return r.sector_name; } },
      { header: _('Fecha'),       width: 14, type: 'date', value: function (r) { return u.parseDate(r.date_case); } },
      { header: _('Sitio web'),   width: 34, value: function (r) { return r.www_case; } }
    ]
  });
})(window, jQuery);