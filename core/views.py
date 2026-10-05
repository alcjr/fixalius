from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.urls import translate_url
from django.utils.translation import gettext_lazy as _

from apps.sources.models import Sector

# Sectores por defecto, usados mientras no haya ninguno activo en la tabla `sectors`.
# Lista a nivel de módulo: debe ser lazy para traducirse en cada petición.
SECTORS = [
    _("Salud"),
    _("Educación"),
    _("Finanzas"),
    _("Industria"),
    _("Sector público"),
    _("Retail"),
]


def home(request):
    """Portada pública: única vista de la landing (name='home').

    - Sectores: los activos de la BD; si no hay ninguno, la lista SECTORS de arriba.
      (Para depender solo de la BD, quita el `or SECTORS`.)
    - Casos de éxito: los aporta el template tag {% get_success_cases %} de index.html,
      por eso no se pasan aquí.
    - Idiomas alternativos: se usan para og:locale:alternate y knowsLanguage. Los
      <link rel="alternate" hreflang> solo se emiten si cada idioma tiene una URL
      distinta (con un cambio de idioma por sesión/cookie, como ahora, no la tiene).
    """
    alternates = [
        {"code": code, "url": translate_url(request.path, code)}
        for code, _name in settings.LANGUAGES
    ]

    return render(request, "core/index.html", {
        "sectors": list(Sector.objects.filter(activo=True)) or SECTORS,
        "alternates": alternates,
        "alternates_distinct": len({a["url"] for a in alternates}) == len(alternates),
    })


def privacy(request):
    return render(request, "core/privacy.html")


def legal(request):
    return render(request, "core/legal.html")


@login_required
def menu(request):
    """Página de aterrizaje de la intranet tras el login."""
    return render(request, 'core/menu.html')
