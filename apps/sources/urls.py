from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views
from .api import ClientViewSet, SectorViewSet, SuccessCaseViewSet
from .api_documents import DocumentViewSet
from .api_newsletters import NewsletterSendView
from .api_subscribers import SubscriberViewSet


app_name = "sources"

router = DefaultRouter()
router.register("cases",       SuccessCaseViewSet, basename="successcase")
router.register("clients",     ClientViewSet,      basename="client")
router.register("sectors",     SectorViewSet,      basename="sector")
router.register("subscribers", SubscriberViewSet,  basename="subscriber")
router.register("documents",   DocumentViewSet,    basename="document")

urlpatterns = [
    path("",              views.dashboard,    name="dashboard"),
    path("aplicaciones/", views.applications, name="applications"),
    path("clientes/",     views.clients,      name="clients"),
    path("subscribers/",  views.subscribers,  name="subscribers"),
    path("documentos/",   views.documents,    name="documents"),
    path("news/",         views.newsletters,  name="newsletters"),

    # Envío de documentos a suscriptores (APIView, no ViewSet): sources:newsletter-send
    path("api/v1/newsletters/send/", NewsletterSendView.as_view(), name="newsletter-send"),

    path("api/v1/", include(router.urls)),
]
