"""Envío de documentos a suscriptores (pantalla Newsletters de la intranet).

Ubicación: apps/sources/api_newsletters.py

POST  sources:newsletter-send   (solo administradores)
  {"asunto": "...", "mensaje": "...", "documentos": [1, 2],
   "destinatarios": "todos" | "seleccion", "suscriptores": [3, 4]}

Cada suscriptor ACTIVO recibe un correo con un enlace personal por documento
y el enlace de baja. Se registra el envío (DocumentShare). El envío es
síncrono: para listas grandes conviene moverlo a una cola (Celery/RQ).
"""
import logging

from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy
from rest_framework import serializers
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .document_views import share_url
from .models import Document, DocumentShare, Subscriber
from .newsletter_views import unsubscribe_url

logger = logging.getLogger(__name__)
audit = logging.getLogger("fixalius.audit")

MAX_RECIPIENTS = int(getattr(settings, "NEWSLETTER_MAX_RECIPIENTS", 200))


def _size(n):
    n = float(n or 0)
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024


class NewsletterSendSerializer(serializers.Serializer):
    asunto = serializers.CharField(max_length=200)
    mensaje = serializers.CharField(max_length=5000, required=False, allow_blank=True, default="")
    documentos = serializers.ListField(
        child=serializers.IntegerField(min_value=1), allow_empty=False, max_length=10,
    )
    destinatarios = serializers.ChoiceField(choices=["todos", "seleccion"])
    suscriptores = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, default=list,
    )

    def validate_asunto(self, v):
        v = " ".join(v.split())   # sin saltos de línea (cabecera del correo)
        if not v:
            raise serializers.ValidationError(gettext_lazy("Este campo es obligatorio."))
        return v

    def validate(self, attrs):
        if attrs["destinatarios"] == "seleccion" and not attrs["suscriptores"]:
            raise serializers.ValidationError(
                {"suscriptores": gettext_lazy("Selecciona al menos un suscriptor.")}
            )
        return attrs


class NewsletterSendView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        ser = NewsletterSendSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        ids = set(data["documentos"])
        docs = list(Document.objects.filter(pk__in=ids).order_by("titulo"))
        if len(docs) != len(ids):
            return Response({"detail": _("Alguno de los documentos ya no existe.")}, status=400)

        subs = Subscriber.objects.filter(activo=True, baja__isnull=True)
        if data["destinatarios"] == "seleccion":
            subs = subs.filter(pk__in=data["suscriptores"])
        subs = list(subs.order_by("pk"))

        if not subs:
            return Response({"detail": _("No hay suscriptores activos entre los destinatarios.")}, status=400)
        if len(subs) > MAX_RECIPIENTS:
            return Response({
                "detail": _("Máximo %(n)s destinatarios por envío (hay %(m)s). Envía por lotes.")
                % {"n": MAX_RECIPIENTS, "m": len(subs)}
            }, status=400)

        connection = get_connection()
        try:
            connection.open()
        except Exception:
            logger.exception("No se pudo abrir la conexión de correo")
            return Response({"detail": _("No se pudo conectar con el servidor de correo.")}, status=500)

        sent, failed = 0, []
        try:
            for sub in subs:
                created_shares = []
                try:
                    items = []
                    for d in docs:
                        share, created = DocumentShare.objects.update_or_create(
                            documento=d, suscriptor=sub,
                            defaults={"enviado": timezone.now(), "enviado_por": request.user},
                        )
                        if created:
                            created_shares.append(share.pk)
                        items.append({"titulo": d.titulo, "size": _size(d.tamano),
                                      "url": share_url(share, request)})
                    unsub = unsubscribe_url(sub, request)
                    body = render_to_string("core/email/document_share.txt", {
                        "mensaje": data["mensaje"], "documentos": items, "unsubscribe_url": unsub,
                    })
                    EmailMessage(
                        subject=data["asunto"], body=body, to=[sub.email], connection=connection,
                        headers={"List-Unsubscribe": f"<{unsub}>"},
                    ).send(fail_silently=False)
                    sent += 1
                except Exception:
                    logger.exception("Fallo al enviar documentos al suscriptor %s", sub.pk)
                    DocumentShare.objects.filter(pk__in=created_shares).delete()
                    failed.append(sub.email)
        finally:
            connection.close()

        audit.info("newsletter.send docs=%s sent=%s failed=%s by_user=%s",
                   sorted(ids), sent, len(failed), request.user.pk)

        if sent == 0:
            return Response({"detail": _("No se pudo enviar ningún correo. Revisa la configuración de correo."),
                             "fallidos": failed}, status=500)
        return Response({"enviados": sent, "fallidos": failed, "total": len(subs)})
