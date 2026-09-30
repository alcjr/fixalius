from django.conf.urls.i18n import i18n_patterns
from django.urls import include, path

from . import views

urlpatterns = [
    path("i18n/", include("django.conf.urls.i18n")),
]

urlpatterns += i18n_patterns(
    path("", views.index, name="index"),
    path("privacidad/", views.privacy, name="privacy"),
    path("aviso-legal/", views.legal, name="legal"),
    path("i18n/", include("django.conf.urls.i18n")),
    prefix_default_language=False,
)