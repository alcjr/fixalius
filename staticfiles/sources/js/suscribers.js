/* suscribers.js — tabla «Suscriptores» (Subscriber) */
(function (global, $) {
  'use strict';

  var FT = global.FixaliusTable;
  var P  = global.FIXALIUS_PAGE;
  var U  = P.urls;
  var _  = FT._;
  var u  = FT.util;

  var missing = Object.keys(P.expected || {}).filter(function (k) { return !U[k]; });
  if (missing.length) {
    $('#gridContainer').empty().append(
      $('<div class="tp-apierror" role="alert">').append(
        $('<strong>').text(_('Faltan rutas de la API para esta tabla')),
        $('<p>').text(_('Registra estos nombres de URL o ajústalos en suscribers.html:')),
        $('<ul>').append(missing.map(function (k) {
          return $('<li>').append($('<code>').text(P.expected[k]));
        }))
      )
    );
    $('#pager-info').text('—');
    return;
  }

  function unsubscribeUrl(id) { return U.list + id + '/unsubscribe/'; }
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || ''); }

  function csrfToken() {
    if (FT.util && typeof FT.util.csrf === 'function') return FT.util.csrf();
    var m = document.querySelector('meta[name="csrf-token"]');
    if (m && m.getAttribute('content')) return m.getAttribute('content');
    var c = document.cookie.split(';').map(function (x) { return x.trim(); })
      .filter(function (x) { return x.indexOf('fg_csrftoken=') === 0; })[0];
    return c ? decodeURIComponent(c.substring('fg_csrftoken='.length)) : '';
  }

  var ESTADO_LABEL = {
    active:       _('Activo'),
    pending:      _('Pendiente'),
    unsubscribed: _('Baja')
  };
  function estadoLabel(d) { return ESTADO_LABEL[d.estado] || '—'; }

  FT.create({
    key: 'id',
    urls: { list: U.list, kpis: U.kpis },
    chipParam: 'chip',
    printTitle: _('Suscriptores'),
    exportName: 'Suscriptores',
    exportSheet: _('Suscriptores'),
    rowTitle: function (d) { return u.trunc(d.email || ('#' + d.id), 80); },
    deleteWarning: _('Se eliminará el registro y el token. Queda constancia en el log de auditoría.'),

    filters: [],

    kpis: [
      { id: 'total',        field: 'total' },
      { id: 'active',       field: 'activos' },
      { id: 'pending',      field: 'pendientes' },
      { id: 'unsubscribed', field: 'bajas' }
    ],

    columns: [
      {
        dataField: 'email', caption: _('Correo electrónico'), minWidth: 340,
        sortOrder: 'asc', sortIndex: 0,
        cellTemplate: function (cont, o) {
          var d = o.data, email = d.email || ('#' + d.id);
          $('<div class="tp-cell tp-media">').append(
            $('<div class="tp-thumb">').css('background', u.avatarColor(email)).text(u.initials(email)),
            $('<div style="min-width:0">').append(
              $('<div class="tp-primary">').text(email).attr('title', email),
              $('<div class="tp-secondary">').text('#' + d.id)
            )
          ).appendTo(cont);
        }
      },
      {
        dataField: 'estado', caption: _('Estado'), width: 150, alignment: 'center',
        cellTemplate: function (cont, o) {
          $('<div class="tp-cell tp-cell--center">').append(
            $('<span class="tp-badge">').text(estadoLabel(o.data))
          ).appendTo(cont);
        }
      },
      {
        dataField: 'alta', caption: _('Alta'), dataType: 'datetime', width: 180,
        cellTemplate: function (cont, o) {
          $('<div class="tp-cell">').text(o.value ? u.fmtDateTime(o.value) : '—').appendTo(cont);
        }
      },
      {
        dataField: 'baja', caption: _('Baja'), dataType: 'datetime', width: 180,
        cellTemplate: function (cont, o) {
          var $w = $('<div class="tp-cell">').appendTo(cont);
          if (o.value) $w.text(u.fmtDateTime(o.value));
          else $w.append($('<span class="tp-muted">').text('—'));
        }
      }
    ],

    detail: {
      icon: 'fa-envelope-open-text',
      width: 640,
      title: function (d) { return u.trunc(d.email || ('#' + d.id), 70); },
      render: function (d) {
        var email = d.email || ('#' + d.id);
        var $w = $('<div>');

        $w.append(
          $('<div class="tp-detail-hero">').append(
            $('<div class="tp-detail-img">').css('background', u.avatarColor(email)).text(u.initials(email)),
            $('<div>').append(
              $('<h3>').text(u.trunc(email, 120)),
              $('<span class="tp-badge">').text(estadoLabel(d))
            )
          )
        );

        var $mail = isEmail(email)
          ? $('<a class="tp-link">').attr('href', 'mailto:' + email).text(email)
          : document.createTextNode(email);

        $w.append(
          FT.detailRow('fa-envelope',       _('Correo electrónico'), $mail),
          FT.detailRow('fa-toggle-on',      _('Estado'),             document.createTextNode(estadoLabel(d))),
          FT.detailRow('fa-calendar-plus',  _('Alta'),               document.createTextNode(d.alta ? u.fmtDateTime(d.alta) : '—')),
          FT.detailRow('fa-calendar-xmark', _('Baja'),               document.createTextNode(d.baja ? u.fmtDateTime(d.baja) : '—'))
        );
        return $w;
      }
    },

    detailActions: [
      {
        text: _('Dar de baja'),
        icon: 'user-slash',
        danger: true,
        visible: function (row) { return !row.baja; },
        handler: function (row, helpers) {
          DevExpress.ui.dialog.confirm(
            _('Se marcará al suscriptor como baja y se anulará su token. ¿Continuar?'),
            _('Dar de baja')
          ).then(function (ok) {
            if (!ok) return;
            $.ajax({
              url: unsubscribeUrl(row.id),
              method: 'POST',
              headers: { 'X-CSRFToken': csrfToken() },
              dataType: 'json'
            })
              .done(function () {
                DevExpress.ui.notify({ message: _('Suscriptor dado de baja'), type: 'success', displayTime: 2000 });
                helpers.popup.hide();
                helpers.reload();
              })
              .fail(function (xhr) {
                DevExpress.ui.notify({
                  message: (xhr && xhr.responseJSON && xhr.responseJSON.detail) || _('No se pudo dar de baja'),
                  type: 'error', displayTime: 5000
                });
              });
          });
        }
      }
    ],

    exportColumns: [
      { header: _('ID'),     width:  8, value: function (r) { return r.id; } },
      { header: _('Correo'), width: 42, value: function (r) { return r.email; } },
      { header: _('Estado'), width: 14, value: function (r) { return estadoLabel(r); } },
      { header: _('Alta'),   width: 20, type: 'date', value: function (r) { return u.parseDate(r.alta); } },
      { header: _('Baja'),   width: 20, type: 'date', value: function (r) { return u.parseDate(r.baja); } }
    ]
  });
})(window, jQuery);