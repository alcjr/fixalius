/* newsletters.js — envío de documentos a suscriptores */
(function (global, $) {
  'use strict';

  var P = global.FIXALIUS_PAGE, U = P.urls;
  function _(s) { return typeof global.gettext === 'function' ? global.gettext(s) : s; }
  function fmt(s) { var a = Array.prototype.slice.call(arguments, 1), i = 0; return String(s).replace(/%s/g, function () { return a[i++]; }); }
  function notify(m, t, ms) { DevExpress.ui.notify({ message: m, type: t || 'info', displayTime: ms || 3000 }); }

  if (DevExpress.localization && DevExpress.localization.locale) DevExpress.localization.locale(P.lang || 'es');

  var activeCount = null;

  function remoteSource(listUrl, extra) {
    return {
      paginate: true,
      pageSize: 20,
      store: new DevExpress.data.CustomStore({
        key: 'id',
        load: function (o) {
          var p = $.extend({ limit: o.take || 20, offset: o.skip || 0 }, extra || {});
          if (o.searchValue) p.search = o.searchValue;
          return $.getJSON(listUrl, p).then(function (r) {
            var rows = Array.isArray(r) ? r : (r.results || []);
            return { data: rows, totalCount: r.count != null ? r.count : rows.length };
          });
        },
        byKey: function (k) { return $.getJSON(listUrl + k + '/'); }
      })
    };
  }

  function errorText(xhr) {
    var j = xhr && (xhr.responseJSON || null);
    if (!j) return _('No se pudo completar el envío');
    if (typeof j === 'string') return j;
    if (j.detail) return j.detail;
    var parts = [];
    $.each(j, function (k, v) { parts.push(Array.isArray(v) ? v.join(' ') : v); });
    return parts.join(' · ') || _('No se pudo completar el envío');
  }

  var asunto = $('#nl-asunto').dxTextBox({ maxLength: 200, placeholder: _('Asunto del correo') }).dxTextBox('instance');
  var mensaje = $('#nl-mensaje').dxTextArea({
    height: '100%', maxLength: 5000,
    placeholder: _('Texto que acompañará a los enlaces de descarga (opcional)')
  }).dxTextArea('instance');

  var docs = $('#nl-docs').dxTagBox({
    dataSource: remoteSource(U.docs),
    valueExpr: 'id', displayExpr: 'titulo',
    searchEnabled: true, searchExpr: ['titulo'], searchTimeout: 300,
    showSelectionControls: true, applyValueMode: 'instantly', maxDisplayedTags: 2, showMultiTagOnly: false,
    placeholder: _('Selecciona uno o varios documentos'),
    noDataText: _('Sin documentos. Súbelos primero en «Documentos».')
  }).dxTagBox('instance');

  var modo = $('#nl-modo').dxRadioGroup({
    items: [
      { id: 'todos', text: _('Todos los suscriptores activos') },
      { id: 'seleccion', text: _('Seleccionar suscriptores') }
    ],
    valueExpr: 'id', displayExpr: 'text', value: 'todos', layout: 'horizontal',
    onValueChanged: function (e) { $('#nl-subs').prop('hidden', e.value !== 'seleccion'); updateCount(); }
  }).dxRadioGroup('instance');

  var subs = $('#nl-subs').dxTagBox({
    dataSource: remoteSource(U.subs, { chip: 'active' }),
    valueExpr: 'id', displayExpr: 'email',
    searchEnabled: true, searchExpr: ['email'], searchTimeout: 300,
    showSelectionControls: true, applyValueMode: 'instantly', maxDisplayedTags: 2, showMultiTagOnly: false,
    placeholder: _('Busca y selecciona suscriptores activos'),
    onValueChanged: function () { updateCount(); }
  }).dxTagBox('instance');

  function updateCount() {
    var n = modo.option('value') === 'todos' ? activeCount : (subs.option('value') || []).length;
    $('#nl-count').text(n == null ? '' : fmt(_('Se enviará a %s suscriptor(es).'), n));
  }

  $.getJSON(U.subsKpis).done(function (r) { activeCount = r.activos; updateCount(); });

  // Preselección desde Documentos: ?doc=<id>
  var pre = parseInt(new URLSearchParams(global.location.search).get('doc'), 10);
  if (pre > 0) docs.option('value', [pre]);

  var sendBtn = $('#nl-send').dxButton({
    text: _('Enviar'), icon: 'message', type: 'default', stylingMode: 'contained',
    onClick: function () { send(); }
  }).dxButton('instance');

  function showResult(ok, html) {
    $('#nl-result').removeClass('is-ok is-error').addClass(ok ? 'is-ok' : 'is-error').prop('hidden', false).empty().append(html);
  }

  function send() {
    var subject = $.trim(asunto.option('value') || '');
    var docIds = docs.option('value') || [];
    var all = modo.option('value') === 'todos';
    var subIds = subs.option('value') || [];

    if (!subject) { notify(_('Escribe el asunto'), 'warning'); return; }
    if (!docIds.length) { notify(_('Selecciona al menos un documento'), 'warning'); return; }
    if (!all && !subIds.length) { notify(_('Selecciona al menos un suscriptor'), 'warning'); return; }

    var n = all ? activeCount : subIds.length;
    DevExpress.ui.dialog.confirm(
      fmt(_('Se enviará el correo con %s documento(s) a %s suscriptor(es). ¿Continuar?'), docIds.length, n == null ? '?' : n),
      _('Confirmar envío')
    ).then(function (ok) {
      if (!ok) return;
      sendBtn.option('disabled', true);
      $('#nl-result').prop('hidden', true);
      $.ajax({
        url: U.send, method: 'POST', dataType: 'json', contentType: 'application/json',
        headers: { 'X-CSRFToken': global.FIXALIUS_CSRF || '' },
        data: JSON.stringify({
          asunto: subject, mensaje: mensaje.option('value') || '', documentos: docIds,
          destinatarios: all ? 'todos' : 'seleccion', suscriptores: all ? [] : subIds
        })
      }).done(function (r) {
        var $m = $('<div>').append($('<strong>').text(fmt(_('Enviado a %s de %s suscriptores.'), r.enviados, r.total)));
        if (r.fallidos && r.fallidos.length) {
          $m.append($('<p>').text(_('No se pudo enviar a:')),
            $('<ul>').append(r.fallidos.map(function (e) { return $('<li>').text(e); })));
        }
        showResult(!(r.fallidos && r.fallidos.length), $m);
        notify(_('Envío completado'), 'success', 2500);
        asunto.reset(); mensaje.reset(); docs.reset(); subs.reset();
      }).fail(function (xhr) {
        showResult(false, $('<strong>').text(errorText(xhr)));
        notify(errorText(xhr), 'error', 6000);
      }).always(function () { sendBtn.option('disabled', false); });
    });
  }
})(window, jQuery);
