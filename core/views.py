from django.conf import settings
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