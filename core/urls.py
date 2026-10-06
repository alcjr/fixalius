from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView

from apps.sources import document_views, newsletter_views
from core import views as core_views


urlpatterns = [
    # Landing pública
    path('', core_views.home, name='home'),

    # Intranet (tras login)
    path('menu/', core_views.menu, name='menu'),

    # Administración Django
    path('admin/', admin.site.urls),

    # Autenticación (login, logout, password reset)
    path('accounts/', include('apps.authentication.urls', namespace='authentication')),

    # i18n (set_language)
    path('i18n/', include('django.conf.urls.i18n')),

    # ===== Apps de la intranet =====
    path('sources/',   include('apps.sources.urls',   namespace='sources')),
    path('dashboard/', include('apps.dashboard.urls', namespace='dashboard')),
    path('config/',    include('apps.config.urls',    namespace='config')),
    path('visor/',     include('apps.visor.urls',     namespace='visor')),

    # Newsletter (doble opt-in)
    path('newsletter/subscribe/',                newsletter_views.subscribe,   name='newsletter_subscribe'),
    path('newsletter/confirm/<uuid:token>/',     newsletter_views.confirm,     name='newsletter_confirm'),
    path('newsletter/unsubscribe/<str:token>/',  newsletter_views.unsubscribe, name='newsletter_unsubscribe'),

    # Descarga de documentos con enlace personal (suscriptores)
    path('documentos/descarga/<str:token>/', document_views.public_download, name='document_public_download'),

    # Legal
    path('legal/',      TemplateView.as_view(template_name='core/legal.html'),   name='legal'),
    path('privacidad/', TemplateView.as_view(template_name='core/privacy.html'), name='privacy'),
]

# Ficheros subidos (imágenes de casos de éxito, logos de clientes...).
# Solo en desarrollo: en producción /media/ debe servirlo el servidor web.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
