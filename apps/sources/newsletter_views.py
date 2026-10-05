"""Alta, confirmación (doble opt-in) y baja de la newsletter de Fixalius.

Ubicación: apps/sources/newsletter_views.py

Flujo:
  1. subscribe  (POST)  -> crea/actualiza el Subscriber (activo=False), genera un
                           UUID en token_confirmacion y envía el correo de confirmación.
  2. confirm    (GET)   -> el enlace del correo activa la suscripción (activo=True).
  3. unsubscribe (GET/POST) -> baja con token firmado (no requiere migración);
                           GET muestra una página con botón, POST ejecuta la baja.

Para futuros envíos, usa `unsubscribe_url(subscriber, request)` y ponlo en el pie
del correo (y en la cabecera List-Unsubscribe).
"""
import logging
import uuid
from datetime import timedelta

from django.core import signing
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils import timezone
from django.utils.translation import gettext as _
from django.views.decorators.http import require_http_methods, require_POST

from .models import Subscriber

logger = logging.getLogger(__name__)

CONFIRM_TTL = timedelta(days=7)          # validez del enlace de confirmación
RESEND_COOLDOWN = timedelta(minutes=2)   # mínimo entre dos correos al mismo email
RATE_LIMIT = 5                           # altas por IP y ventana
RATE_WINDOW = 60 * 60                    # segundos
UNSUB_SALT = "fixalius.newsletter.unsubscribe"


# --- Utilidades ----------------------------------------------------------------

def _rate_limited(request):
    """Limita las altas por IP. Tras un proxy inverso, REMOTE_ADDR será la IP del
    proxy: configura el servidor para pasar la IP real (o ajusta esta función)."""
    key = f"newsletter:subscribe:{request.META.get('REMOTE_ADDR', 'unknown')}"
    if cache.add(key, 1, RATE_WINDOW):
        return False
    try:
        return cache.incr(key) > RATE_LIMIT
    except ValueError:  # la clave caducó entre add() e incr()
        cache.set(key, 1, RATE_WINDOW)
        return False


def _wants_json(request):
    return "application/json" in request.headers.get("Accept", "")


def _respond(request, *, ok, message, status, flag):
    """JSON para el fetch del frontend; redirección con flag si no hay JS."""
    if _wants_json(request):
        return JsonResponse({"ok": ok, "message": message}, status=status)
    return redirect(f"{reverse('home')}?newsletter={flag}#contact")


def _result(request, state, status=200):
    return render(request, "sources/newsletter_result.html", {"state": state}, status=status)


def _send_confirmation(request, subscriber):
    confirm_url = request.build_absolute_uri(
        reverse("newsletter_confirm", args=[subscriber.token_confirmacion])
    )
    body = render_to_string(
        "core/email/newsletter_confirm.txt",
        {"confirm_url": confirm_url, "ttl_days": CONFIRM_TTL.days},
    )
    send_mail(
        subject=_("Confirma tu suscripción a Fixalius"),
        message=body,
        from_email=None,  # usa DEFAULT_FROM_EMAIL
        recipient_list=[subscriber.email],
        fail_silently=False,
    )


def unsubscribe_url(subscriber, request=None):
    """Enlace de baja firmado para incluir en cualquier envío a este suscriptor."""
    token = signing.dumps(subscriber.pk, salt=UNSUB_SALT)
    path = reverse("newsletter_unsubscribe", args=[token])
    return request.build_absolute_uri(path) if request else path


# --- Vistas --------------------------------------------------------------------

@require_POST
def subscribe(request):
    sent_message = _("Revisa tu correo para confirmar la suscripción.")

    # Honeypot: los bots rellenan el campo oculto. Se responde "éxito" sin hacer nada.
    if request.POST.get("website"):
        return _respond(request, ok=True, message=sent_message, status=200, flag="sent")

    if _rate_limited(request):
        return _respond(
            request, ok=False, status=429, flag="error",
            message=_("Demasiados intentos. Inténtalo de nuevo más tarde."),
        )

    email = (request.POST.get("email") or "").strip().lower()
    try:
        validate_email(email)
    except ValidationError:
        return _respond(
            request, ok=False, status=400, flag="invalid",
            message=_("Introduce un correo electrónico válido."),
        )

    subscriber, created = Subscriber.objects.get_or_create(email=email)

    # Respuesta idéntica si ya está activo o si se pidió hace nada: no revela si
    # una dirección está registrada ni permite usar el formulario para enviar spam.
    now = timezone.now()
    if subscriber.activo:
        return _respond(request, ok=True, message=sent_message, status=200, flag="sent")
    if (
        not created
        and subscriber.token_confirmacion
        and now - subscriber.alta < RESEND_COOLDOWN
    ):
        return _respond(request, ok=True, message=sent_message, status=200, flag="sent")

    subscriber.token_confirmacion = uuid.uuid4()
    subscriber.alta = now   # reinicia la caducidad del enlace
    subscriber.baja = None  # un alta nueva anula una baja anterior (previa confirmación)
    subscriber.save(update_fields=["token_confirmacion", "alta", "baja"])

    try:
        _send_confirmation(request, subscriber)
    except Exception:
        logger.exception("No se pudo enviar la confirmación al suscriptor %s", subscriber.pk)
        # Si el envío falla, se invalida el token: así la espera mínima entre correos
        # no bloquea el siguiente intento y nadie queda con un enlace que no recibió.
        subscriber.token_confirmacion = None
        subscriber.save(update_fields=["token_confirmacion"])
        return _respond(
            request, ok=False, status=500, flag="error",
            message=_("No hemos podido enviar el correo de confirmación. Inténtalo de nuevo en unos minutos."),
        )

    return _respond(request, ok=True, message=sent_message, status=200, flag="sent")


@require_http_methods(["GET"])
def confirm(request, token):
    try:
        subscriber = Subscriber.objects.get(token_confirmacion=token)
    except Subscriber.DoesNotExist:
        return _result(request, "invalid", status=404)

    # Idempotente: reabrir el enlace (o un escáner de correo que lo precargue)
    # no produce errores una vez confirmado.
    if subscriber.activo:
        return _result(request, "confirmed")

    if timezone.now() - subscriber.alta > CONFIRM_TTL:
        return _result(request, "expired", status=410)

    subscriber.activo = True
    subscriber.baja = None
    subscriber.save(update_fields=["activo", "baja"])
    return _result(request, "confirmed")


@require_http_methods(["GET", "POST"])
def unsubscribe(request, token):
    try:
        pk = signing.loads(token, salt=UNSUB_SALT)
        subscriber = Subscriber.objects.get(pk=pk)
    except (signing.BadSignature, Subscriber.DoesNotExist):
        return _result(request, "invalid", status=404)

    if request.method == "POST":
        if subscriber.activo:
            subscriber.activo = False
            subscriber.baja = timezone.now()
            subscriber.save(update_fields=["activo", "baja"])
        return _result(request, "unsubscribed")

    # GET: pide confirmación con un botón (evita bajas por precarga del enlace)
    return _result(request, "unsubscribe_confirm")
