from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import render
from django.urls import reverse
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
    response = render(request, 'core/menu.html')
    response['X-Robots-Tag'] = 'noindex, nofollow'   # intranet: fuera de buscadores
    return response


def robots_txt(request):
    """robots.txt: la landing es pública; intranet, admin y cuentas, no."""
    lines = [
        "User-agent: *",
        "Disallow: /menu/",
        "Disallow: /accounts/",
        "Disallow: /sources/",
        "Disallow: /dashboard/",
        "Disallow: /config/",
        "Disallow: /visor/",
        "Disallow: /newsletter/",
        "Disallow: /documentos/",
        "Disallow: /%s" % getattr(settings, 'ADMIN_URL', 'admin/'),
        "Sitemap: %s" % request.build_absolute_uri(reverse('sitemap_xml')),
    ]
    return HttpResponse("\n".join(lines) + "\n", content_type="text/plain; charset=utf-8")


def sitemap_xml(request):
    """sitemap.xml mínimo: solo la portada (el resto es intranet o legal en modales)."""
    loc = request.build_absolute_uri(reverse('home'))
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        '<url><loc>%s</loc></url></urlset>\n' % loc
    )
    return HttpResponse(xml, content_type="application/xml; charset=utf-8")
