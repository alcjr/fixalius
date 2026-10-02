from django.contrib import admin
from .models import Client, SuccessCase


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display   = ("descripcion_client", "sector_client", "country_client", "email_client")
    list_filter    = ("sector_client", "country_client")
    search_fields  = ("descripcion_client", "email_client", "www_client")


@admin.register(SuccessCase)
class SuccessCaseAdmin(admin.ModelAdmin):
    list_display        = ("__str__", "sector_case", "id_client", "date_case")
    list_filter         = ("sector_case", "date_case")
    search_fields       = ("descripcion_case", "id_client__descripcion_client")
    date_hierarchy      = "date_case"
    autocomplete_fields = ("id_client",)