import os
import uuid

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.core.validators import RegexValidator
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _


# --- Validadores reutilizables -------------------------------------------------

country_validator = RegexValidator(
    regex=r"^[A-Z]{2}$",
    message=_(
        "Introduce un código ISO 3166-1 alpha-2 en mayúsculas (p. ej. ES, US)."
    ),
)


# --- Mixins --------------------------------------------------------------------

class TimeStampedModel(models.Model):
    """Modelo abstracto con marcas de alta y actualización.

    Se usa `default=timezone.now` en lugar de `auto_now_add`/`auto_now`
    para que las migraciones puedan añadirse a tablas existentes sin
    solicitar un valor por defecto interactivo.
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
        super().save(*args, **kwargs)


# --- Modelos -------------------------------------------------------------------

class Sector(TimeStampedModel):
    """Catálogo de sectores."""

    nombre_sector = models.CharField(
        _("nombre del sector"),
        max_length=100,
        unique=True,
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

    def __str__(self):
        return self.nombre_sector


class Client(TimeStampedModel):
    """Clientes de Fixalius."""

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
        null=True,
    )

    country_client = models.CharField(
        _("país"),
        max_length=2,
        validators=[country_validator],
        help_text=_("Código ISO 3166-1 alpha-2 en mayúsculas (p. ej. ES, US)."),
        db_index=True,
    )

    class Meta:
        db_table = "clients"
        verbose_name = _("cliente")
        verbose_name_plural = _("clientes")
        ordering = ["nombre_client"]

    def __str__(self):
        return self.nombre_client

    def save(self, *args, **kwargs):
        if self.country_client:
            self.country_client = self.country_client.upper()
        if self.email_client:
            self.email_client = self.email_client.lower()
        super().save(*args, **kwargs)


class SuccessCase(TimeStampedModel):
    """Casos de éxito / aplicaciones realizadas por Fixalius."""

    title = models.CharField(
        _("título"),
        max_length=200,
        default="",
        blank=True,
    )

    slug = models.SlugField(
        _("slug"),
        max_length=220,
        unique=True,
        blank=True,
        null=True,   # varios NULL conviven sin romper la unicidad
        default=None,
    )

    descripcion_case = models.TextField(
        _("descripción"),
    )

    image_case = models.ImageField(
        _("imagen / logo"),
        upload_to="cases/images/",
        blank=True,
        null=True,
    )

    date_case = models.DateField(
        _("fecha de la aplicación"),
        db_index=True,
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
            models.Index(fields=["-date_case"]),
        ]

    def __str__(self):
        client = self.client or "—"
        return f"{client} · {self.sector} · {self.date_case:%Y-%m}"

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:200] or "caso"
            slug = base
            i = 1
            qs = SuccessCase.objects.filter(slug=slug).exclude(pk=self.pk)
            while qs.exists():
                i += 1
                slug = f"{base}-{i}"
                qs = SuccessCase.objects.filter(slug=slug).exclude(pk=self.pk)
            self.slug = slug
        super().save(*args, **kwargs)


class Subscriber(models.Model):
    """Suscriptores que desean recibir noticias de Fixalius."""

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
    )

    alta = models.DateTimeField(
        _("alta"),
        default=timezone.now,
        editable=False,
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

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.lower()
        super().save(*args, **kwargs)


# --- Documentos ----------------------------------------------------------------

def get_private_storage():
    """Almacén PRIVADO: fuera de MEDIA_ROOT y sin URL pública.

    Los ficheros solo se sirven a través de vistas que comprueban permisos
    (colaboradores autenticados o suscriptores con enlace personal).
    Callable para que la migración no incruste la ruta del servidor.
    """
    root = getattr(settings, "PRIVATE_MEDIA_ROOT", settings.BASE_DIR / "private_media")
    return FileSystemStorage(location=root)


def document_upload_to(instance, filename):
    # Nombre aleatorio en disco; el nombre original se guarda aparte.
    ext = os.path.splitext(filename)[1].lower()
    return f"documents/{timezone.now():%Y/%m}/{uuid.uuid4().hex}{ext}"


class Document(TimeStampedModel):
    """Documento de Fixalius (plantilla, manual…) descargable por colaboradores
    y, mediante enlace personal, por los suscriptores a quienes se envíe."""

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
        db_index=True,
    )
    archivo = models.FileField(
        _("archivo"),
        upload_to=document_upload_to,
        storage=get_private_storage,
    )
    nombre_original = models.CharField(_("nombre original"), max_length=255, blank=True, editable=False)
    tamano = models.PositiveBigIntegerField(_("tamaño (bytes)"), default=0, editable=False)
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


@receiver(post_delete, sender=Document)
def _borrar_fichero_de_documento(sender, instance, **kwargs):
    if instance.archivo:
        instance.archivo.delete(save=False)


class DocumentShare(models.Model):
    """Envío de un documento a un suscriptor (con su contador de descargas)."""

    documento = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="envios",
        verbose_name=_("documento"),
    )
    suscriptor = models.ForeignKey(
        Subscriber, on_delete=models.CASCADE, related_name="documentos_enviados",
        verbose_name=_("suscriptor"),
    )
    enviado = models.DateTimeField(_("enviado"), default=timezone.now, editable=False)
    enviado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True, editable=False,
        on_delete=models.SET_NULL, related_name="+",
        verbose_name=_("enviado por"),
    )
    descargas = models.PositiveIntegerField(_("descargas"), default=0, editable=False)
    ultima_descarga = models.DateTimeField(_("última descarga"), null=True, blank=True, editable=False)

    class Meta:
        db_table = "document_shares"
        verbose_name = _("envío de documento")
        verbose_name_plural = _("envíos de documentos")
        ordering = ["-enviado"]
        constraints = [
            models.UniqueConstraint(fields=["documento", "suscriptor"], name="uniq_document_subscriber"),
        ]

    def __str__(self):
        return f"{self.documento} → {self.suscriptor}"
