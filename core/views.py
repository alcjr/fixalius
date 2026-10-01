from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.urls import translate_url
from django.utils.translation import gettext_lazy as _

# Lista a nivel de módulo: debe ser lazy para traducirse en cada petición
SECTORS = [
    _("Salud"),
    _("Educación"),
    _("Finanzas"),
    _("Industria"),
    _("Sector público"),
    _("Retail"),
]


def index(request):
    alternates = [
        {"code": code, "url": translate_url(request.path, code)}
        for code, _name in settings.LANGUAGES
    ]

    return render(request, "core/index.html", {
        "sectors": SECTORS,
        "alternates": alternates,
    })


def privacy(request):
    return render(request, "core/privacy.html")


def legal(request):
    return render(request, "core/legal.html")

@login_required
def menu(request):
    """Página de aterrizaje de la intranet tras el login."""
    return render(request, 'core/menu.html')