/* clients.js — tabla «Clientes» (Client) */
(function (global, $) {
  'use strict';

  var FT = global.FixaliusTable;
  var P = global.FIXALIUS_PAGE;
  var U = P.urls;
  var _ = FT._;
  var u = FT.util;
  var LANG = (document.documentElement.getAttribute('lang') || 'es').slice(0, 2);

  var missing = Object.keys(P.expected || {}).filter(function (k) { return !U[k]; });
  if (missing.length) {
    $('#gridContainer').empty().append(
      $('<div class="tp-apierror" role="alert">').append(
        $('<strong>').text(_('Faltan rutas de la API para esta tabla')),
        $('<p>').text(_('Registra estos nombres de URL o ajústalos en clients.html:')),
        $('<ul>').append(missing.map(function (k) { return $('<li>').append($('<code>').text(P.expected[k])); }))
      )
    );
    $('#pager-info').text('—');
    return;
  }

  var ISO = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
    'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
    'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
    'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
    'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ');

  var regionNames = null;
  try { regionNames = new Intl.DisplayNames([LANG], { type: 'region' }); } catch (e) { /* sin soporte */ }
  function countryName(code) {
    if (!code) return '';
    try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; }
  }
  function countryLabel(code) { return code ? countryName(code) + ' (' + code + ')' : '—'; }
  var COUNTRIES = ISO.map(function (c) { return { code: c, name: countryName(c) }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name, LANG); });

  function isLocalImg(src) { return !!src && /^(https?:\/\/|\/(?!\/))/i.test(src); }
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || ''); }
  function host(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } }
  function nameOf(d) { return d.nombre_client || ('#' + d.id); }

  function logo(d, cls) {
    var $t = $('<div class="' + cls + '">');
    if (isLocalImg(d.logo_client)) $('<img>').attr({ src: d.logo_client, alt: '', loading: 'lazy' }).appendTo($t);
    else $t.css('background', u.avatarColor(d.sector_name || d.nombre_client)).text(u.initials(d.nombre_client || d.sector_name));
    return $t;
  }
  function links(d) {
    var $w = $('<div class="tp-ellipsis">');
    var url = u.safeUrl(d.www_client);
    if (isEmail(d.email_client)) $('<a class="tp-link">').attr({ href: 'mailto:' + d.email_client, title: d.email_client }).text(d.email_client).on('click', function (e) { e.stopPropagation(); }).appendTo($w);
    else if (d.email_client) $('<span>').text(d.email_client).appendTo($w);
    if (url) {
      var $a = $('<a class="tp-link" target="_blank" rel="noopener noreferrer">').attr({ href: url, title: url }).text(host(url)).on('click', function (e) { e.stopPropagation(); });
      $('<div class="tp-secondary">').append($a).appendTo($w);
    }
    if (!d.email_client && !url) $w.append($('<span class="tp-muted">').text('—'));
    return $w;
  }

  FT.create({
    key: 'id',
    urls: { list: U.list, kpis: U.kpis },
    chipParam: 'chip',
    printTitle: _('Clientes'),
    exportName: 'Clientes',
    exportSheet: _('Clientes'),
    rowTitle: function (d) { return u.trunc(nameOf(d), 80); },
    deleteWarning: _('Solo se puede eliminar un cliente que no tenga aplicaciones asociadas.'),

    filters: [
      { id: 'sector',  param: 'sector',  url: U.sectors,   query: {},
        valueKey: 'id', textKey: 'name' },
      { id: 'country', param: 'country', url: U.countries, query: {},
        valueKey: 'code', textKey: 'code', textFn: countryLabel }
    ],

    kpis: [
      { id: 'total',     field: 'total' },
      { id: 'active',    field: 'with_cases' },
      { id: 'sectors',   field: 'sectors' },
      { id: 'countries', field: 'countries' }
    ],

    columns: [
      {
        dataField: 'nombre_client', caption: _('Cliente'), minWidth: 320,
        sortOrder: 'asc', sortIndex: 0,
        cellTemplate: function (cont, o) {
          var d = o.data;
          var $text = $('<div style="min-width:0">').append(
            $('<div class="tp-primary">').text(nameOf(d)).attr('title', d.nombre_client || ''),
            $('<div class="tp-secondary">').text('#' + d.id)
          );
          $('<div class="tp-cell tp-media">').append(logo(d, 'tp-thumb'), $text).appendTo(cont);
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
        dataField: 'country_client', caption: _('País'), width: 180,
        cellTemplate: function (cont, o) {
          var $c = $('<div class="tp-cell tp-ellipsis">').appendTo(cont);
          if (!o.value) { $c.append($('<span class="tp-muted">').text('—')); return; }
          $('<span>').text(countryName(o.value)).appendTo($c);
          $('<span class="tp-tag">').text(o.value).appendTo($c);
        }
      },
      {
        caption: _('Contacto'), width: 230, allowSorting: false,
        calculateCellValue: function (d) { return (d.email_client || '') + ' ' + (d.www_client || ''); },
        cellTemplate: function (cont, o) { $('<div class="tp-cell">').append(links(o.data)).appendTo(cont); }
      },
      {
        dataField: 'cases_count', caption: _('Aplicaciones'), dataType: 'number', width: 130, alignment: 'center',
        cellTemplate: function (cont, o) {
          var n = Number(o.value) || 0;
          $('<div class="tp-cell tp-cell--center">').append(
            $('<span class="tp-count">').toggleClass('is-zero', n === 0).text(n)
          ).appendTo(cont);
        }
      }
    ],

    detail: {
      icon: 'fa-building',
      width: 760,
      title: function (d) { return u.trunc(nameOf(d), 70); },
      render: function (d) {
        var $w = $('<div>');
        $w.append($('<div class="tp-detail-hero">').append(logo(d, 'tp-detail-img'), $('<div>').append(
          $('<h3>').text(u.trunc(nameOf(d), 120)),
          $('<span class="tp-badge">').text(d.sector_name || '—'),
          d.country_client ? $('<span class="tp-tag">').text(d.country_client) : null
        )));

        var url = u.safeUrl(d.www_client);
        var $web = url ? $('<a class="tp-link" target="_blank" rel="noopener noreferrer">').attr('href', url).text(url) : $('<span class="tp-muted">').text('—');
        var $mail = isEmail(d.email_client) ? $('<a class="tp-link">').attr('href', 'mailto:' + d.email_client).text(d.email_client) : $('<span class="tp-muted">').text(d.email_client || '—');

        var $cases = $('<div>');
        var n = Number(d.cases_count) || 0;
        if (!n) {
          $cases.append($('<span class="tp-muted">').text(_('Este cliente aún no tiene aplicaciones registradas.')));
        } else if (U.cases) {
          $cases.append($('<span class="tp-muted">').text(_('Cargando…')));
          $.getJSON(U.cases, { client: d.id, limit: 5, ordering: '-date_case' }).done(function (r) {
            var rows = r.results || [];
            var $ul = $('<ul class="tp-mini-list">');
            rows.forEach(function (c) {
              $('<li>').append(
                $('<span class="tp-mini-date">').text(u.fmtDate(c.date_case)),
                $('<span>').text(u.trunc(c.title || c.descripcion_case, 140))
              ).appendTo($ul);
            });
            $cases.empty().append($ul);
            if (r.count > rows.length) $cases.append($('<div class="tp-mini-more">').text(u.fmt(_('y %s más'), r.count - rows.length)));
          }).fail(function () { $cases.empty().append($('<span class="tp-muted">').text(_('No se pudieron cargar las aplicaciones.'))); });
        } else {
          $cases.append(document.createTextNode(String(n)));
        }

        $w.append(
          FT.detailRow('fa-align-left', _('Descripción'), document.createTextNode(d.descripcion_client || '—')),
          FT.detailRow('fa-globe', _('País'), document.createTextNode(d.country_client ? countryLabel(d.country_client) : '—')),
          FT.detailRow('fa-link', _('Sitio web'), $web),
          FT.detailRow('fa-envelope', _('Correo electrónico'), $mail),
          FT.detailRow('fa-trophy', _('Aplicaciones') + ' (' + n + ')', $cases)
        );
        return $w;
      }
    },

    form: {
      icon: 'fa-building',
      titleNew: _('Nuevo cliente'),
      titleEdit: _('Editar cliente'),
      width: 760,
      colCount: 1,
      fields: ['nombre_client', 'descripcion_client', 'sector', 'country_client', 'www_client', 'email_client'],
      defaults: function () { return {}; },
      items: function (ctx) {
        return [
          {
            itemType: 'group', caption: _('Datos del cliente'), colCount: 2, items: [
              {
                dataField: 'nombre_client', colSpan: 2, label: { text: _('Nombre') },
                editorOptions: { maxLength: 200, placeholder: _('Nombre del cliente') },
                validationRules: [{ type: 'required', message: _('El nombre es obligatorio') }]
              },
              {
                dataField: 'descripcion_client', colSpan: 2, label: { text: _('Descripción') }, editorType: 'dxTextArea',
                editorOptions: { height: 90, maxLength: 1000, autoResizeEnabled: false, placeholder: _('Descripción ampliada del cliente (opcional)') },
                validationRules: []
              },
              {
                dataField: 'sector', label: { text: _('Sector') }, editorType: 'dxSelectBox',
                editorOptions: {
                  dataSource: FT.lookupSource(U.sectors_all, 'id', { ordering: 'nombre_sector', all: true }),
                  valueExpr: 'id', displayExpr: 'nombre_sector',
                  searchEnabled: true, searchTimeout: 300, minSearchLength: 0,
                  placeholder: _('Elige un sector…'), noDataText: _('Sin resultados')
                },
                validationRules: [{ type: 'required', message: _('El sector es obligatorio') }]
              },
              {
                dataField: 'country_client', label: { text: _('País') }, editorType: 'dxSelectBox',
                editorOptions: {
                  dataSource: COUNTRIES, valueExpr: 'code',
                  displayExpr: function (i) { return i ? i.name + ' (' + i.code + ')' : ''; },
                  searchEnabled: true, searchExpr: ['name', 'code'], searchTimeout: 150,
                  placeholder: _('Busca un país…'), noDataText: _('Sin resultados')
                },
                validationRules: [{ type: 'required', message: _('El país es obligatorio') }]
              }
            ]
          },
          {
            itemType: 'group', caption: _('Contacto'), colCount: 2, items: [
              {
                dataField: 'email_client', label: { text: _('Correo electrónico') },
                editorOptions: { maxLength: 254, placeholder: 'nombre@empresa.com', mode: 'email' },
                validationRules: [{ type: 'email', message: _('Introduce un correo válido') }]
              },
              {
                dataField: 'www_client', label: { text: _('Sitio web') },
                editorOptions: { maxLength: 255, placeholder: 'https://…' },
                validationRules: [{ type: 'pattern', pattern: /^https?:\/\/\S+$/i, message: _('Introduce una URL que empiece por http:// o https://') }]
              },
              FT.imageField(ctx, { field: 'logo_client', label: _('Logo'), colSpan: 2, maxMB: 5 })
            ]
          }
        ];
      }
    },

    























    exportColumns: [
      { header: _('ID'),                 width: 8,  value: function (r) { return r.id; } },
      { header: _('Nombre'),             width: 36, value: function (r) { return r.nombre_client; } },
      { header: _('Descripción'),        width: 60, value: function (r) { return r.descripcion_client; } },
      { header: _('Sector'),             width: 22, value: function (r) { return r.sector_name; } },
      { header: _('País'),               width: 22, value: function (r) { return countryLabel(r.country_client); } },
      { header: _('Correo electrónico'), width: 30, value: function (r) { return r.email_client; } },
      { header: _('Sitio web'),          width: 32, value: function (r) { return r.www_client; } },
      { header: _('Aplicaciones'),       width: 14, value: function (r) { return r.cases_count; } }
    ]
  });
})(window, jQuery);