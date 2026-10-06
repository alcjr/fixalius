/* docs.js — tabla «Documentos» (Document) */
(function (global, $) {
  'use strict';

  var FT = global.FixaliusTable;
  var P  = global.FIXALIUS_PAGE;
  var U  = P.urls;
  var _  = FT._;
  var u  = FT.util;

  var CFG = { extensions: [], maxMB: 25, canManage: false, newsletterUrl: '' };
  try { CFG = $.extend(CFG, JSON.parse(document.getElementById('doc-config').textContent)); } catch (e) { /* defaults */ }

  var missing = Object.keys(P.expected || {}).filter(function (k) { return !U[k]; });
  if (missing.length) {
    $('#gridContainer').empty().append(
      $('<div class="tp-apierror" role="alert">').append(
        $('<strong>').text(_('Faltan rutas de la API para esta tabla')),
        $('<p>').text(_('Registra estos nombres de URL o ajústalos en docs.html:')),
        $('<ul>').append(missing.map(function (k) {
          return $('<li>').append($('<code>').text(P.expected[k]));
        }))
      )
    );
    $('#pager-info').text('—');
    return;
  }

  var CATS = [
    { value: 'plantilla', text: _('Plantilla') },
    { value: 'manual',    text: _('Manual') },
    { value: 'guia',      text: _('Guía') },
    { value: 'otro',      text: _('Otro') }
  ];

  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function ext(d) { return String(d.extension || '').toUpperCase(); }
  function downloadLink(d, cls) {
    return $('<a>').addClass(cls || 'tp-link').attr({ href: d.download_url, download: d.nombre_original || '' });
  }

  // Selector de fichero para el editor (alta y sustitución)
  function fileField(ctx) {
    return {
      dataField: 'archivo',
      colSpan: 2,
      label: { text: _('Archivo') + (ctx.isNew ? ' *' : '') },
      template: function (itemData, $item) {
        var $w = $('<div>').appendTo($item);
        if (!ctx.isNew && ctx.data.nombre_original) {
          $('<div class="tp-muted" style="margin-bottom:6px">')
            .text(_('Actual:') + ' ' + ctx.data.nombre_original + ' (' + fmtSize(ctx.data.tamano) + ')')
            .appendTo($w);
        }
        $('<div>').appendTo($w).dxFileUploader({
          selectButtonText: ctx.isNew ? _('Seleccionar archivo') : _('Sustituir archivo'),
          labelText: _('o arrástralo aquí'),
          allowedFileExtensions: CFG.extensions.map(function (e) { return '.' + e; }),
          uploadMode: 'useForm',
          multiple: false,
          maxFileSize: CFG.maxMB * 1024 * 1024,
          invalidMaxFileSizeMessage: u.fmt(_('El archivo supera %s MB'), CFG.maxMB),
          invalidFileExtensionMessage: _('Formato no admitido'),
          showFileList: true,
          onValueChanged: function (e) { ctx.files.archivo = e.value && e.value[0] ? e.value[0] : null; }
        });
        $('<div class="tp-muted" style="margin-top:6px;font-size:.85em">')
          .text(u.fmt(_('Máximo %s MB. Formatos: %s'), CFG.maxMB, CFG.extensions.join(', ')))
          .appendTo($w);
      }
    };
  }

  FT.create({
    key: 'id',
    urls: { list: U.list, kpis: U.kpis },
    chipParam: 'chip',
    printTitle: _('Documentos'),
    exportName: 'Documentos',
    exportSheet: _('Documentos'),
    rowTitle: function (d) { return u.trunc(d.titulo || ('#' + d.id), 80); },
    deleteWarning: _('Se eliminará el archivo y el registro de envíos. Los enlaces ya enviados dejarán de funcionar.'),

    filters: [],

    kpis: [
      { id: 'total',     field: 'total' },
      { id: 'templates', field: 'plantillas' },
      { id: 'sent',      field: 'enviados' },
      { id: 'downloads', field: 'descargas' }
    ],

    columns: [
      {
        dataField: 'titulo', caption: _('Documento'), minWidth: 320,
        cellTemplate: function (cont, o) {
          var d = o.data, e = ext(d) || '?';
          $('<div class="tp-cell tp-media">').append(
            $('<div class="tp-thumb">').css('background', u.avatarColor(e)).text(e.slice(0, 4)),
            $('<div style="min-width:0">').append(
              $('<div class="tp-primary">').text(d.titulo).attr('title', d.titulo),
              $('<div class="tp-secondary">').text(d.nombre_original || '').attr('title', d.nombre_original || '')
            )
          ).appendTo(cont);
        }
      },
      {
        dataField: 'categoria', caption: _('Categoría'), width: 130, alignment: 'center',
        cellTemplate: function (cont, o) {
          $('<div class="tp-cell tp-cell--center">').append(
            $('<span class="tp-badge">').text(o.data.categoria_label || '—')
          ).appendTo(cont);
        }
      },
      {
        dataField: 'tamano', caption: _('Tamaño'), width: 100, alignment: 'right',
        cellTemplate: function (cont, o) { $('<div class="tp-cell">').text(fmtSize(o.value)).appendTo(cont); }
      },
      {
        dataField: 'alta', caption: _('Subido'), dataType: 'datetime', width: 160, sortOrder: 'desc', sortIndex: 0,
        cellTemplate: function (cont, o) { $('<div class="tp-cell">').text(o.value ? u.fmtDateTime(o.value) : '—').appendTo(cont); }
      },
      {
        dataField: 'descargas', caption: _('Descargas'), width: 110, alignment: 'right',
        cellTemplate: function (cont, o) {
          $('<div class="tp-cell">').text(u.fmt('%s', (o.data.descargas || 0) + (o.data.n_descargas_envios || 0))).appendTo(cont);
        }
      },
      {
        caption: '', width: 64, alignment: 'center', allowSorting: false,
        cellTemplate: function (cont, o) {
          $('<div class="tp-cell tp-cell--center">').append(
            downloadLink(o.data, 'tp-rbtn tp-rbtn--download')
              .attr({ title: _('Descargar'), 'aria-label': _('Descargar') })
              .html('<i class="fas fa-download" aria-hidden="true"></i>')
              .on('click', function (ev) { ev.stopPropagation(); })
          ).appendTo(cont);
        }
      }
    ],

    form: {
      icon: 'fa-cloud-arrow-up',
      titleNew: _('Subir documento'),
      titleEdit: _('Editar documento'),
      width: 640,
      colCount: 2,
      fields: ['titulo', 'categoria', 'descripcion'],
      defaults: function () { return { titulo: '', categoria: 'otro', descripcion: '' }; },
      items: function (ctx) {
        return [
          { dataField: 'titulo', colSpan: 2, label: { text: _('Título') }, isRequired: true,
            editorOptions: { maxLength: 200 } },
          { dataField: 'categoria', colSpan: 2, label: { text: _('Categoría') }, editorType: 'dxSelectBox',
            editorOptions: { items: CATS, valueExpr: 'value', displayExpr: 'text' } },
          { dataField: 'descripcion', colSpan: 2, label: { text: _('Descripción') }, editorType: 'dxTextArea',
            editorOptions: { height: 90, maxLength: 2000 } },
          fileField(ctx)
        ];
      }
    },

    detail: {
      icon: 'fa-file-lines',
      width: 640,
      title: function (d) { return u.trunc(d.titulo || ('#' + d.id), 70); },
      render: function (d) {
        var e = ext(d) || '?';
        var $w = $('<div>');

        $w.append(
          $('<div class="tp-detail-hero">').append(
            $('<div class="tp-detail-img">').css('background', u.avatarColor(e)).text(e.slice(0, 4)),
            $('<div>').append(
              $('<h3>').text(u.trunc(d.titulo, 120)),
              $('<span class="tp-badge">').text(d.categoria_label || '—')
            )
          )
        );

        var $dl = downloadLink(d).html('<i class="fas fa-download" aria-hidden="true"></i> ')
          .append(document.createTextNode(d.nombre_original || _('Descargar')));

        $w.append(
          FT.detailRow('fa-download', _('Archivo'), $dl),
          FT.detailRow('fa-align-left', _('Descripción'), document.createTextNode(d.descripcion || '—')),
          FT.detailRow('fa-weight-hanging', _('Tamaño'), document.createTextNode(fmtSize(d.tamano))),
          FT.detailRow('fa-calendar-plus', _('Subido'), document.createTextNode(d.alta ? u.fmtDateTime(d.alta) : '—')),
          FT.detailRow('fa-user', _('Subido por'), document.createTextNode(d.subido_por_nombre || '—')),
          FT.detailRow('fa-users', _('Descargas de colaboradores'), document.createTextNode(String(d.descargas || 0)))
        );

        if (CFG.canManage) {
          var $send = $('<a class="tp-link">')
            .attr('href', CFG.newsletterUrl + '?doc=' + d.id)
            .text(_('Enviar a suscriptores') + ' →');
          $w.append(
            FT.detailRow('fa-paper-plane', _('Envíos a suscriptores'), document.createTextNode(String(d.n_envios || 0))),
            FT.detailRow('fa-download', _('Descargas de suscriptores'), document.createTextNode(String(d.n_descargas_envios || 0))),
            FT.detailRow('fa-envelope-open-text', _('Newsletter'), $send)
          );
        }
        return $w;
      }
    },

    exportColumns: [
      { header: _('ID'),         width:  8, value: function (r) { return r.id; } },
      { header: _('Título'),     width: 36, value: function (r) { return r.titulo; } },
      { header: _('Categoría'),  width: 14, value: function (r) { return r.categoria_label; } },
      { header: _('Archivo'),    width: 36, value: function (r) { return r.nombre_original; } },
      { header: _('Tamaño'),     width: 12, value: function (r) { return fmtSize(r.tamano); } },
      { header: _('Subido'),     width: 20, type: 'date', value: function (r) { return u.parseDate(r.alta); } },
      { header: _('Descargas'),  width: 12, value: function (r) { return (r.descargas || 0) + (r.n_descargas_envios || 0); } },
      { header: _('Enviado a'),  width: 12, value: function (r) { return r.n_envios || 0; } }
    ]
  });
})(window, jQuery);
