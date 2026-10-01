from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path
from django.views.generic import TemplateView


urlpatterns = [
    # Landing pública
    path('', TemplateView.as_view(template_name='core/index.html'), name='home'),

    # Intranet (post-login)
    path('menu/', TemplateView.as_view(template_name='core/menu.html'), name='menu'),

    path('admin/', admin.site.urls),
    path('accounts/', include('apps.authentication.urls', namespace='authentication')),

    path(
        'accounts/login/',
        auth_views.LoginView.as_view(
            template_name='authentication/login.html',
            redirect_authenticated_user=True,
        ),
        name='login',
    ),

    path('i18n/', include('django.conf.urls.i18n')),
]