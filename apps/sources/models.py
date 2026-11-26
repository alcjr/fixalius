import os
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.core.validators import FileExtensionValidator, RegexValidator
from django.db import models, transaction
from django.db.models import F
from django.db.models.functions import Lower
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _


# --- Validadores reutilizables -------------------------------------------------

# Acepta minúsculas: la normalización a mayúsculas se hace en clean()/save().
country_validator = RegexValidator(
    regex=r"^[A-Za-z]{2}$",
    message=_("Introduce un código ISO 3166-1 alpha-2 (p. ej. ES, US)."),
)

DOCUMENT_ALLOWED_EXTENSIONS = [
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "odt", "ods", "odp", "txt", "csv", "zip",
]


def validate_document_size(file):
    """Límite de tamaño configurable con DOCUMENT_MAX_UPLOAD_BYTES (20 MB por defecto)."""
    limit = getattr(settings, "DOCUMENT_MAX_UPLOAD_BYTES", 20 * 1024 * 1024)
    if file.size > limit:
        raise ValidationError(
            _("El archivo supera el tamaño máximo permitido (%(mb)s MB)."),
            code="file_too_large",
            params={"mb": limit // (1024 * 1024)},
        )


# --- Utilidades de ficheros ----------------------------------------------------

def _delete_stored_file(storage, name):
    """Borra un fichero SOLO si la transacción actual se confirma."""
    if name:
        transaction.on_commit(lambda: storage.delete(name))


# --- Mixins --------------------------------------------------------------------

class TimeStampedModel(models.Model):
    """Modelo abstracto con marcas de alta y actualización.

    Se usa `default=timezone.now` en lugar de `auto_now_add`/`auto_now`
    para que las migraciones puedan añadirse a tablas existentes sin
    solicitar un valor por defecto interactivo.

    Nota: `QuerySet.update()` y `bulk_update()` no pasan por `save()`,
    por lo que no actualizan `update`.
    """

    alta = models.DateTimeField(
        _("alta"),
        default=timezone.now,
        editable=False,
    )

    update = models.DateTimeField(
        _("actualización"),
        default=timezone.now,
        editable=False,
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        self.update = timezone.now()
        # Con save(update_fields=[...]) el campo solo se escribe si está en la lista.
        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            kwargs["update_fields"] = {*update_fields, "update"}
        super().save(*args, **kwargs)


class FileCleanupMixin(models.Model):
    """Elimina del almacenamiento los ficheros que dejan de estar referenciados.

    - Al sustituir o vaciar un campo de fichero, borra el anterior.
    - Al eliminar la instancia, borra sus ficheros.
    En ambos casos el borrado ocurre tras confirmar la transacción (on_commit).

    Declara en el modelo: `file_fields = ("campo1", "campo2")`.
    """

    file_fields = ()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        old = {}
        if self.pk and self.file_fields:
            old = (
                type(self)._default_manager
                .filter(pk=self.pk)
                .values(*self.file_fields)
                .first()
            ) or {}
        super().save(*args, **kwargs)
        for name in self.file_fields:
            old_name = old.get(name)
            if old_name and old_name != getattr(self, name).name:
                _delete_stored_file(self._meta.get_field(name).storage, old_name)


@receiver(post_delete)
def _borrar_ficheros_al_eliminar(sender, instance, **kwargs):
    if not isinstance(instance, FileCleanupMixin):
        return
    for name in instance.file_fields:
        f = getattr(instance, name)
        if f and f.name:
            _delete_stored_file(f.storage, f.name)


# --- Modelos -------------------------------------------------------------------

class Sector(TimeStampedModel):
    """Catálogo de sectores."""

    nombre_sector = models.CharField(
        _("nombre del sector"),
        max_length=100,
    )

    activo = models.BooleanField(
        _("activo"),
        default=True,
    )

    class Meta:
        db_table = "sectors"
        verbose_name = _("sector")
        verbose_name_plural = _("sectores")
        ordering = ["nombre_sector"]
        constraints = [
            # Único sin distinguir mayúsculas ("Salud" == "salud").
            # Requiere Django >= 4.1 para validarse también en full_clean().
            models.UniqueConstraint(
                Lower("nombre_sector"),
                name="uniq_sector_nombre_ci",
                violation_error_message=_("Ya existe un sector con ese nombre."),
            ),
        ]

    def __str__(self):
        return self.nombre_sector


class Client(FileCleanupMixin, TimeStampedModel):
    """Clientes de Fixalius."""

    file_fields = ("logo_client",)

    nombre_client = models.CharField(
        _("nombre"),
        max_length=200,
    )

    descripcion_client = models.TextField(
        _("descripción"),
        blank=True,
    )

    www_client = models.URLField(
        _("sitio web"),
        max_length=255,
        blank=True,
    )

    email_client = models.EmailField(
        _("correo electrónico"),
        blank=True,
    )

    sector = models.ForeignKey(
        Sector,
        on_delete=models.PROTECT,
        related_name="clients",
        verbose_name=_("sector"),
    )

    logo_client = models.ImageField(
        _("logo"),
        upload_to="clients/logos/",
        blank=True,
        default="",  # las filas con NULL existentes pasan a "" al migrar
    )

    country_client = models.CharField(
        _("país"),
        max_length=2,
        validators=[country_validator],
        help_text=_("Código ISO 3166-1 alpha-2 (p. ej. ES, US)."),
        db_index=True,
    )

    class Meta:
        db_table = "clients"
        verbose_name = _("cliente")
        verbose_name_plural = _("clientes")
        ordering = ["nombre_client"]

    def __str__(self):
        return self.nombre_client

    def _normalizar(self):
        if self.country_client:
            self.country_client = self.country_client.strip().upper()
        if self.email_client:
            self.email_client = self.email_client.strip().lower()

    def clean(self):
        super().clean()
        self._normalizar()

    def save(self, *args, **kwargs):
        self._normalizar()
        super().save(*args, **kwargs)


class SuccessCase(FileCleanupMixin, TimeStampedModel):
    """Casos de éxito / aplicaciones realizadas por Fixalius.

    `sector` del caso puede diferir del sector habitual del cliente
    (p. ej. una aplicación en otro ámbito), por eso se guarda por separado.
    """

    file_fields = ("image_case",)

    title = models.CharField(
        _("título"),
        max_length=200,
    )

    slug = models.SlugField(
        _("slug"),
        max_length=220,
        unique=True,
        blank=True,
        null=True,   # se mantiene nullable: evita migración con datos; varios NULL no rompen la unicidad
        default=None,
    )  # se genera automáticamente en save()

    descripcion_case = models.TextField(
        _("descripción"),
    )

    image_case = models.ImageField(
        _("imagen / logo"),
        upload_to="cases/images/",
        blank=True,
        default="",  # las filas con NULL existentes pasan a "" al migrar
    )

    date_case = models.DateField(
        _("fecha de la aplicación"),
    )

    sector = models.ForeignKey(
        Sector,
        on_delete=models.PROTECT,
        related_name="success_cases",
        verbose_name=_("sector"),
    )

    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name="success_cases",
        verbose_name=_("cliente"),
    )

    www_case = models.URLField(
        _("sitio web"),
        max_length=255,
        blank=True,
    )

    class Meta:
        db_table = "success_cases"
        verbose_name = _("caso de éxito")
        verbose_name_plural = _("casos de éxito")
        ordering = ["-date_case", "-id"]

        indexes = [
            models.Index(fields=["sector", "date_case"]),
            # Cubre el ordering por defecto (y los filtros por fecha).
            models.Index(fields=["-date_case", "-id"]),
        ]

    def __str__(self):
        # Sin accesos a FKs: no genera consultas adicionales en listados.
        return self.title or f"Caso #{self.pk}"

    def _generar_slug(self):
        base = slugify(self.title)[:200] or "caso"
        slug = base
        i = 1
        qs = SuccessCase.objects.exclude(pk=self.pk)
        while qs.filter(slug=slug).exists():
            i += 1
            slug = f"{base}-{i}"
        return slug

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self._generar_slug()
            # Si se guarda con update_fields, asegura que el slug se persista.
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = {*update_fields, "slug"}
        super().save(*args, **kwargs)


class Subscriber(models.Model):
    """Suscriptores que desean recibir noticias de Fixalius.

    Estados:
      - pendiente: activo=False, confirmado=None, baja=None
      - activo:    activo=True,  confirmado=<fecha>
      - baja:      activo=False, baja=<fecha>
    """

    email = models.EmailField(
        _("correo electrónico"),
        unique=True,
    )

    activo = models.BooleanField(
        _("activo"),
        default=False,
        help_text=_("Se activa tras confirmar la suscripción (doble opt-in)."),
    )

    token_confirmacion = models.UUIDField(
        _("token de confirmación"),
        null=True,
        blank=True,
        unique=True,
        editable=False,
    )

    token_confirmacion_creado = models.DateTimeField(
        _("token de confirmación creado"),
        null=True,
        blank=True,
        editable=False,
    )

    # Sin default callable (daría el mismo UUID a las filas existentes).
    # Se genera en save(); las filas antiguas se rellenan con una migración de datos.
    token_baja = models.UUIDField(
        _("token de baja"),
        null=True,
        blank=True,
        unique=True,
        editable=False,
    )

    alta = models.DateTimeField(
        _("alta"),
        default=timezone.now,
        editable=False,
    )

    confirmado = models.DateTimeField(
        _("confirmado"),
        null=True,
        blank=True,
        editable=False,
        help_text=_("Fecha en que el suscriptor confirmó (prueba del doble opt-in)."),
    )

    baja = models.DateTimeField(
        _("baja"),
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "subscribers"
        verbose_name = _("suscriptor")
        verbose_name_plural = _("suscriptores")
        ordering = ["-alta"]

    def __str__(self):
        return self.email

    def clean(self):
        super().clean()
        # clean() se ejecuta antes de validate_unique(): evita IntegrityError
        # por diferencias de mayúsculas.
        if self.email:
            self.email = self.email.strip().lower()

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        if self.token_baja is None:
            self.token_baja = uuid.uuid4()
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = {*update_fields, "token_baja"}
        super().save(*args, **kwargs)

    # -- Ciclo de vida --------------------------------------------------------

    def generar_token_confirmacion(self):
        self.token_confirmacion = uuid.uuid4()
        self.token_confirmacion_creado = timezone.now()
        self.save(update_fields=["token_confirmacion", "token_confirmacion_creado"])
        return self.token_confirmacion

    def confirmar(self):
        self.activo = True
        self.confirmado = timezone.now()
        self.baja = None
        self.token_confirmacion = None
        self.token_confirmacion_creado = None
        self.save(update_fields=[
            "activo", "confirmado", "baja",
            "token_confirmacion", "token_confirmacion_creado",
        ])

    def dar_de_baja(self):
        self.activo = False
        self.baja = timezone.now()
        self.save(update_fields=["activo", "baja"])


# --- Documentos ----------------------------------------------------------------

def get_private_storage():
    """Almacén PRIVADO: fuera de MEDIA_ROOT y sin URL pública.

    Los ficheros solo se sirven a través de vistas que comprueban permisos
    (colaboradores autenticados o suscriptores con enlace personal).
    Callable para que la migración no incruste la ruta del servidor.

    Si en producción se usa almacenamiento de objetos (S3/R2…), devuelve aquí
    el storage privado correspondiente y sirve los ficheros con URLs firmadas.
    """
    root = getattr(settings, "PRIVATE_MEDIA_ROOT", settings.BASE_DIR / "private_media")
    return FileSystemStorage(location=root)


def document_upload_to(instance, filename):
    # Nombre aleatorio en disco; el nombre original se guarda aparte.
    ext = os.path.splitext(filename)[1].lower()[:10]
    return f"documents/{timezone.now():%Y/%m}/{uuid.uuid4().hex}{ext}"


class Document(FileCleanupMixin, TimeStampedModel):
    """Documento de Fixalius (plantilla, manual…) descargable por colaboradores
    y, mediante enlace personal, por los suscriptores a quienes se envíe."""

    file_fields = ("archivo",)

    class Categoria(models.TextChoices):
        PLANTILLA = "plantilla", _("Plantilla")
        MANUAL = "manual", _("Manual")
        GUIA = "guia", _("Guía")
        OTRO = "otro", _("Otro")

    titulo = models.CharField(_("título"), max_length=200)
    descripcion = models.TextField(_("descripción"), blank=True)
    categoria = models.CharField(
        _("categoría"),
        max_length=20,
        choices=Categoria.choices,
        default=Categoria.OTRO,
    )
    archivo = models.FileField(
        _("archivo"),
        upload_to=document_upload_to,
        storage=get_private_storage,
        validators=[
            FileExtensionValidator(allowed_extensions=DOCUMENT_ALLOWED_EXTENSIONS),
            validate_document_size,
        ],
    )
    nombre_original = models.CharField(
        _("nombre original"), max_length=255, blank=True, editable=False,
    )
    tamano = models.PositiveBigIntegerField(
        _("tamaño (bytes)"), default=0, editable=False,
    )
    descargas = models.PositiveIntegerField(
        _("descargas de colaboradores"), default=0, editable=False,
    )
    subido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True, editable=False,
        on_delete=models.SET_NULL,
        related_name="+",
        verbose_name=_("subido por"),
    )

    class Meta:
        db_table = "documents"
        verbose_name = _("documento")
        verbose_name_plural = _("documentos")
        ordering = ["-alta", "-id"]

    def __str__(self):
        return self.titulo

    @property
    def extension(self):
        name = self.nombre_original or self.archivo.name or ""
        return os.path.splitext(name)[1].lower().lstrip(".")

    def save(self, *args, **kwargs):
        f = self.archivo
        # Fichero nuevo pendiente de subir (aún no confirmado en el storage).
        if f and not getattr(f, "_committed", True):
            self.nombre_original = os.path.basename(f.name)[:255]
            self.tamano = f.size
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = {*update_fields, "nombre_original", "tamano"}
        super().save(*args, **kwargs)

    def registrar_descarga(self):
        """Incremento atómico (seguro ante descargas simultáneas)."""
        type(self).objects.filter(pk=self.pk).update(descargas=F("descargas") + 1)


class DocumentShare(models.Model):
    """Envío de un documento a un suscriptor (con su contador de descargas).

    El `token` es el enlace personal: identifica este envío concreto, de modo
    que se puede revocar (borrando el envío) o caducar sin afectar al resto.
    """

    documento = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="envios",
        verbose_name=_("documento"),
    )
    suscriptor = models.ForeignKey(
        Subscriber, on_delete=models.CASCADE, related_name="documentos_enviados",
        verbose_name=_("suscriptor"),
    )
    # Sin default callable (daría el mismo UUID a las filas existentes).
    # Se genera en save(); las filas antiguas se rellenan con una migración de datos.
    token = models.UUIDField(
        _("token de descarga"), null=True, blank=True, unique=True, editable=False,
    )
    enviado = models.DateTimeField(_("enviado"), default=timezone.now, editable=False)
    caduca = models.DateTimeField(
        _("caduca"), null=True, blank=True,
        help_text=_("Vacío = el enlace no caduca."),
    )
    enviado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True, editable=False,
        on_delete=models.SET_NULL, related_name="+",
        verbose_name=_("enviado por"),
    )
    descargas = models.PositiveIntegerField(_("descargas"), default=0, editable=False)
    ultima_descarga = models.DateTimeField(
        _("última descarga"), null=True, blank=True, editable=False,
    )

    class Meta:
        db_table = "document_shares"
        verbose_name = _("envío de documento")
        verbose_name_plural = _("envíos de documentos")
        ordering = ["-enviado"]
        constraints = [
            models.UniqueConstraint(
                fields=["documento", "suscriptor"], name="uniq_document_subscriber",
            ),
        ]

    def __str__(self):
        return f"{self.documento} → {self.suscriptor}"

    def save(self, *args, **kwargs):
        if self.token is None:
            self.token = uuid.uuid4()
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = {*update_fields, "token"}
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.suscriptor_id and not self.suscriptor.activo:
            raise ValidationError(
                {"suscriptor": _("El suscriptor no ha confirmado su suscripción.")}
            )

    @property
    def esta_vigente(self):
        return (
            self.caduca is None or self.caduca > timezone.now()
        ) and self.suscriptor.activo

    def registrar_descarga(self):
        """Incremento atómico (seguro ante descargas simultáneas)."""
        type(self).objects.filter(pk=self.pk).update(
            descargas=F("descargas") + 1,
            ultima_descarga=timezone.now(),
        )
