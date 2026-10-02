from django.db import models
from django.utils.translation import gettext_lazy as _


class Client(models.Model):
    """Clientes de Fixalius."""

    id_client = models.AutoField(primary_key=True)

    descripcion_client = models.TextField(_("descripción"), blank=True)
    www_client         = models.URLField(_("sitio web"), max_length=255, blank=True)
    email_client       = models.EmailField(_("correo electrónico"), blank=True)
    sector_client      = models.CharField(_("sector"), max_length=100, db_index=True)
    logo_client        = models.ImageField(
        _("logo"),
        upload_to="clients/logos/",
        blank=True,
        null=True,
    )
    country_client = models.CharField(
        _("país"),
        max_length=2,
        help_text=_("Código ISO 3166-1 alpha-2 (p. ej. ES, US)."),
        db_index=True,
    )

    class Meta:
        db_table = "clients"
        verbose_name = _("cliente")
        verbose_name_plural = _("clientes")
        ordering = ["descripcion_client"]

    def __str__(self):
        return self.descripcion_client or f"Cliente {self.pk}"


class SuccessCase(models.Model):
    """Casos de éxito / aplicaciones realizadas por Fixalius."""

    id_case = models.AutoField(primary_key=True)

    descripcion_case = models.TextField(_("descripción"))
    image_case = models.ImageField(
        _("imagen / logo"),
        upload_to="cases/images/",
        blank=True,
        null=True,
    )
    date_case   = models.DateField(_("fecha de la aplicación"), db_index=True)
    sector_case = models.CharField(_("sector"), max_length=100, db_index=True)

    id_client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        db_column="id_client",
        related_name="success_cases",
        verbose_name=_("cliente"),
    )

    www_case = models.URLField(_("sitio web"), max_length=255, blank=True)

    alta   = models.DateTimeField(_("alta"), auto_now_add=True)
    update = models.DateTimeField(_("actualización"), auto_now=True)

    class Meta:
        db_table = "success_cases"
        verbose_name = _("caso de éxito")
        verbose_name_plural = _("casos de éxito")
        ordering = ["-date_case", "-id_case"]
        indexes = [
            models.Index(fields=["sector_case", "date_case"]),
        ]

    def __str__(self):
        return f"{self.sector_case} · {self.date_case:%Y-%m}"