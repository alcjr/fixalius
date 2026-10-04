from django.core.validators import RegexValidator
from django.db import models
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