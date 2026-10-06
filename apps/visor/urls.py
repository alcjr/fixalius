"""URLs de la aplicación visor (visor de trazas).

Inclúyelas en core/urls.py:
    path("visor/", include("apps.visor.urls")),
"""
from django.urls import path

from . import views

app_name = "visor"

urlpatterns = [
    path("", views.visor, name="index"),
    path("api/read/", views.log_read, name="visor_read"),
    path("api/clear/", views.log_clear, name="visor_clear"),
]
