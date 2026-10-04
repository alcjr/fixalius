from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views
from .api import ClientViewSet, SectorViewSet, SuccessCaseViewSet
from .api_subscribers import SubscriberViewSet


app_name = "sources"

router = DefaultRouter()
router.register("cases",       SuccessCaseViewSet, basename="successcase")
router.register("clients",     ClientViewSet,      basename="client")
router.register("sectors",     SectorViewSet,      basename="sector")
# Incluye la acción `kpis` -> /api/v1/subscribers/kpis/
router.register("subscribers", SubscriberViewSet,  basename="subscriber")

urlpatterns = [
    path("",              views.dashboard,    name="dashboard"),
    path("aplicaciones/", views.applications, name="applications"),
    path("clientes/",     views.clients,      name="clients"),
    path("subscribers/",  views.subscribers,  name="subscribers"),

    # Vistas antiguas de suscriptores: el listado y los KPIs los sirve ahora la API
    # (SubscriberViewSet). "subscribers/" ya está ocupada arriba por views.subscribers,
    # así que la primera de estas dos nunca se alcanzaba.
    # path("subscribers/",      views.SubscriberListView.as_view(), name="subscriber-list"),
    # path("subscribers/kpis/", views.SubscriberKpisView.as_view(), name="subscriber-kpis"),

    path("documentos/",   views.documents,    name="documents"),
    path("news/",         views.newsletters,  name="newsletters"),
    path("api/v1/", include(router.urls)),
]
