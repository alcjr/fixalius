from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView

from core import views as core_views


urlpatterns = [
    # Landing pública
    path('', TemplateView.as_view(template_name='core/index.html'), name='home'),

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

    # Legal
    path('legal/',      TemplateView.as_view(template_name='core/legal.html'),   name='legal'),
    path('privacidad/', TemplateView.as_view(template_name='core/privacy.html'), name='privacy'),
]