from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .models import Client, Document, DocumentShare, Sector, SuccessCase, Subscriber


@admin.register(Sector)
class SectorAdmin(admin.ModelAdmin):
    list_display = ("nombre_sector", "activo")
    list_filter = ("activo",)
    search_fields = ("nombre_sector",)
    readonly_fields = ("alta", "update")
    list_per_page = 25
    save_on_top = True


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = (
        "nombre_client",
        "sector",
        "country_client",
        "email_client",
    )

    list_filter = (
        "sector",
        "country_client",
    )

    search_fields = (
        "nombre_client",
        "descripcion_client",
        "email_client",
        "www_client",
    )

    autocomplete_fields = ("sector",)
    list_select_related = ("sector",)
    readonly_fields = ("alta", "update")
    list_per_page = 25
    save_on_top = True


@admin.register(SuccessCase)
class SuccessCaseAdmin(admin.ModelAdmin):
    list_display = (
        "titulo",
        "client",
        "sector",
        "date_case",
        "tiene_imagen",
    )
    list_display_links = ("titulo",)

    list_filter = ("sector", "client")

    search_fields = (
        "title",
        "descripcion_case",
        "client__nombre_client",
    )

    date_hierarchy = "date_case"
    autocomplete_fields = ("client", "sector")
    list_select_related = ("sector", "client")
    prepopulated_fields = {"slug": ("title",)}
    readonly_fields = ("alta", "update")
    list_per_page = 25
    save_on_top = True

    @admin.display(description=_("título"), ordering="title")
    def titulo(self, obj):
        # `title` admite blank: sin esto la primera columna saldría vacía
        # y no habría enlace para abrir el caso.
        return obj.title or f"— ({obj.client})"

    @admin.display(description=_("imagen"), boolean=True)
    def tiene_imagen(self, obj):
        # Misma regla que la landing: imagen del caso o, si no hay, logo del cliente.
        return bool(obj.image_case or obj.client.logo_client)


@admin.register(Subscriber)
class SubscriberAdmin(admin.ModelAdmin):
    list_display = ("email", "activo", "alta", "baja")
    list_filter = ("activo", "alta")
    search_fields = ("email",)
    date_hierarchy = "alta"
    # El token lo genera el flujo de doble opt-in; no debe editarse a mano.
    readonly_fields = ("alta", "token_confirmacion")
    list_per_page = 25
    save_on_top = True


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("titulo", "categoria", "nombre_original", "tamano", "descargas", "alta")
    list_filter = ("categoria",)
    search_fields = ("titulo", "descripcion", "nombre_original")
    readonly_fields = ("nombre_original", "tamano", "descargas", "subido_por", "alta", "update")
    list_per_page = 25
    save_on_top = True

    def save_model(self, request, obj, form, change):
        if "archivo" in form.changed_data and obj.archivo:
            obj.nombre_original = obj.archivo.name.rsplit("/", 1)[-1][:255]
            obj.tamano = obj.archivo.size
        if not change:
            obj.subido_por = request.user
        super().save_model(request, obj, form, change)


@admin.register(DocumentShare)
class DocumentShareAdmin(admin.ModelAdmin):
    list_display = ("documento", "suscriptor", "enviado", "descargas", "ultima_descarga")
    list_filter = ("documento",)
    search_fields = ("suscriptor__email", "documento__titulo")
    readonly_fields = ("enviado", "enviado_por", "descargas", "ultima_descarga")
    list_select_related = ("documento", "suscriptor")
    list_per_page = 25
