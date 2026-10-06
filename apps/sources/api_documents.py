"""API de Documentos (intranet).

Ubicación: apps/sources/api_documents.py

Permisos:
  - Lectura y descarga: cualquier usuario autenticado y activo (colaboradores).
  - Alta, edición y borrado: solo administradores (is_staff / superusuario).
"""
import logging
import os

from django.conf import settings
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import Coalesce
from django.http import FileResponse, Http404
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response

from .api import StandardPagination
from .models import Document, DocumentShare

audit = logging.getLogger("fixalius.audit")

# Sin html/svg/js a propósito: no se sirven nunca contenidos activos.
ALLOWED_EXTENSIONS = (
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "odt", "ods", "odp", "txt", "csv", "md", "zip",
    "png", "jpg", "jpeg",
)
MAX_MB = int(getattr(settings, "DOCUMENT_MAX_MB", 25))


def is_admin(user):
    return bool(user and user.is_authenticated and user.is_active and (user.is_staff or user.is_superuser))


class DocumentPermission(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated and u.is_active):
            return False
        if request.method in SAFE_METHODS:
            return True
        return is_admin(u)


def file_response(document):
    """FileResponse de descarga (adjunto) o Http404 si falta el fichero."""
    try:
        fh = document.archivo.open("rb")
    except (FileNotFoundError, ValueError):
        raise Http404("Fichero no disponible")
    name = document.nombre_original or os.path.basename(document.archivo.name)
    resp = FileResponse(fh, as_attachment=True, filename=name)
    resp["X-Content-Type-Options"] = "nosniff"
    resp["Cache-Control"] = "private, no-store"
    return resp


class DocumentSerializer(serializers.ModelSerializer):
    archivo = serializers.FileField(write_only=True, required=False, allow_empty_file=False)
    categoria_label = serializers.CharField(source="get_categoria_display", read_only=True)
    extension = serializers.CharField(read_only=True)
    download_url = serializers.SerializerMethodField()
    subido_por_nombre = serializers.SerializerMethodField()
    n_envios = serializers.SerializerMethodField()
    n_descargas_envios = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id", "titulo", "descripcion", "categoria", "categoria_label", "archivo",
            "nombre_original", "extension", "tamano", "descargas",
            "n_envios", "n_descargas_envios",
            "alta", "update", "subido_por_nombre", "download_url",
        ]
        read_only_fields = [
            "id", "nombre_original", "tamano", "descargas", "alta", "update",
        ]

    def get_download_url(self, obj):
        return reverse("sources:document-download", args=[obj.pk])

    def get_subido_por_nombre(self, obj):
        u = obj.subido_por
        return (u.get_full_name() or u.get_username()) if u else ""

    def get_n_envios(self, obj):
        return getattr(obj, "n_envios", 0)

    def get_n_descargas_envios(self, obj):
        return getattr(obj, "n_descargas_envios", 0)

    def validate_titulo(self, value):
        value = " ".join((value or "").split())
        if not value:
            raise serializers.ValidationError(_("Este campo es obligatorio."))
        return value

    def validate_archivo(self, f):
        ext = os.path.splitext(f.name)[1].lower().lstrip(".")
        if ext not in ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                _("Formato no admitido. Permitidos: %(exts)s.") % {"exts": ", ".join(ALLOWED_EXTENSIONS)}
            )
        if f.size > MAX_MB * 1024 * 1024:
            raise serializers.ValidationError(_("El archivo supera %(mb)s MB.") % {"mb": MAX_MB})
        return f

    def validate(self, attrs):
        if self.instance is None and not attrs.get("archivo"):
            raise serializers.ValidationError({"archivo": _("Selecciona un archivo.")})
        return attrs

    @staticmethod
    def _file_meta(f):
        return {"nombre_original": os.path.basename(f.name)[:255], "tamano": f.size}

    def create(self, validated):
        validated.update(self._file_meta(validated["archivo"]))
        validated["subido_por"] = self.context["request"].user
        return super().create(validated)

    def update(self, instance, validated):
        f = validated.get("archivo")
        old_name = instance.archivo.name if f else None
        if f:
            validated.update(self._file_meta(f))
        instance = super().update(instance, validated)
        if old_name and old_name != instance.archivo.name:
            instance.archivo.storage.delete(old_name)   # no dejar huérfano el fichero anterior
        return instance


class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    permission_classes = [DocumentPermission]
    pagination_class = StandardPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["titulo", "descripcion", "nombre_original"]
    ordering_fields = ["id", "titulo", "categoria", "alta", "tamano", "descargas", "n_envios"]
    ordering = ["-alta", "-id"]

    def get_queryset(self):
        qs = (
            Document.objects.select_related("subido_por")
            .annotate(
                n_envios=Count("envios", distinct=True),
                n_descargas_envios=Coalesce(Sum("envios__descargas"), 0),
            )
        )
        chip = self.request.query_params.get("chip")
        if chip in dict(Document.Categoria.choices):
            qs = qs.filter(categoria=chip)
        return qs

    def perform_create(self, serializer):
        doc = serializer.save()
        audit.info("document.create id=%s by_user=%s", doc.pk, self.request.user.pk)

    def perform_update(self, serializer):
        doc = serializer.save()
        audit.info("document.update id=%s by_user=%s", doc.pk, self.request.user.pk)

    def perform_destroy(self, instance):
        audit.info("document.delete id=%s by_user=%s", instance.pk, self.request.user.pk)
        instance.delete()   # el fichero se borra por señal post_delete

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        doc = self.get_object()
        resp = file_response(doc)
        Document.objects.filter(pk=doc.pk).update(descargas=F("descargas") + 1)
        audit.info("document.download id=%s by_user=%s", doc.pk, request.user.pk)
        return resp

    @action(detail=False, methods=["get"])
    def kpis(self, request):
        qs = self.filter_queryset(self.get_queryset()).order_by()
        base = Document.objects.filter(pk__in=qs.values("pk"))
        shares = DocumentShare.objects.filter(documento__in=base)
        return Response({
            "total": base.count(),
            "plantillas": base.filter(categoria=Document.Categoria.PLANTILLA).count(),
            "enviados": shares.count(),
            "descargas": (base.aggregate(n=Coalesce(Sum("descargas"), 0))["n"]
                          + shares.aggregate(n=Coalesce(Sum("descargas"), 0))["n"]),
        })
