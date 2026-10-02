from django.urls import path
from . import views

app_name = "config"

urlpatterns = [
    # Pasarela (panel de control con acceso a Admin / Visor / Config)
    path("", views.panel_view, name="panel"),

    # Editor de config.ini
    path("parametros/", views.config_view, name="home"),

    # API del editor
    path("api/config/",         views.config_api_get,    name="api-get"),
    path("api/config/save/",    views.config_api_save,   name="api-save"),
    path("api/config/reload/",  views.config_api_reload, name="api-reload"),
]