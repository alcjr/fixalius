"""Descarga pública de documentos mediante enlace personal (suscriptores).

Ubicación: apps/sources/document_views.py

El enlace lleva un token firmado con el id del DocumentShare. Solo funciona si:
  - la firma es válida y no ha caducado (DOCUMENT_LINK_MAX_AGE_DAYS, 90 por defecto), y
  - el suscriptor sigue activo (no se ha dado de baja).
Un suscriptor no puede listar documentos: solo descarga los que se le enviaron.
"""
import logging

from django.conf import settings
from django.core import signing
from django.db.models import F
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_GET

from .api_documents import file_response
from .models import DocumentShare

logger = logging.getLogger(__name__)
audit = logging.getLogger("fixalius.audit")

DOC_SALT = "fixalius.documents.share"


def share_url(share, request=None):
    token = signing.dumps(share.pk, salt=DOC_SALT)
    path = reverse("document_public_download", args=[token])
    return request.build_absolute_uri(path) if request else path


def _unavailable(request, state, status):
    return render(request, "sources/newsletter_result.html", {"state": state}, status=status)


@require_GET
def public_download(request, token):
    max_age = int(getattr(settings, "DOCUMENT_LINK_MAX_AGE_DAYS", 90)) * 86400
    try:
        pk = signing.loads(token, salt=DOC_SALT, max_age=max_age)
    except signing.SignatureExpired:
        return _unavailable(request, "doc_expired", 410)
    except signing.BadSignature:
        return _unavailable(request, "doc_invalid", 404)

    share = (
        DocumentShare.objects.select_related("documento", "suscriptor").filter(pk=pk).first()
    )
    if share is None or not share.suscriptor.activo or share.suscriptor.baja:
        return _unavailable(request, "doc_invalid", 404)

    try:
        resp = file_response(share.documento)
    except Exception:
        logger.exception("Fichero no disponible para el envío %s", share.pk)
        return _unavailable(request, "doc_invalid", 404)

    DocumentShare.objects.filter(pk=share.pk).update(
        descargas=F("descargas") + 1, ultima_descarga=timezone.now()
    )
    audit.info("document.public_download share=%s doc=%s sub=%s",
               share.pk, share.documento_id, share.suscriptor_id)
    return resp
