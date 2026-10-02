from datetime import date

from django.db.models import Count
from django.shortcuts import render
from django.utils import timezone
from django.http import JsonResponse, HttpResponseNotAllowed
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_http_methods

from .models import Client, SuccessCase

MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
          "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def dashboard(request):
    """Cuadro de mando de Fixalius: casos de éxito + clientes."""

    year_param   = request.GET.get("year")
    sector_param = request.GET.get("sector") or None
    current_year = timezone.now().year
    selected_year = int(year_param) if (year_param or "").isdigit() else current_year

    cases_qs   = SuccessCase.objects.select_related("id_client")
    clients_qs = Client.objects.all()

    if sector_param:
        cases_qs   = cases_qs.filter(sector_case=sector_param)
        clients_qs = clients_qs.filter(sector_client=sector_param)

    # ---------- KPIs Casos ----------
    total_cases      = cases_qs.count()
    cases_this_year  = cases_qs.filter(date_case__year=selected_year).count()
    sectors_cases    = cases_qs.values("sector_case").distinct().count()
    total_clients    = clients_qs.count()
    avg_per_client   = round(total_cases / total_clients, 1) if total_clients else 0

    # ---------- KPIs Clientes ----------
    countries_count  = clients_qs.values("country_client").distinct().count()
    sectors_clients  = clients_qs.values("sector_client").distinct().count()
    active_clients   = clients_qs.filter(success_cases__isnull=False).distinct().count()

    # ---------- Charts: Casos ----------
    cases_by_sector = [
        {"name": row["sector_case"], "y": row["count"]}
        for row in cases_qs.values("sector_case")
                         .annotate(count=Count("id_case"))
                         .order_by("-count")
    ]

    cases_by_year = [
        {"year": row["date_case__year"], "count": row["count"]}
        for row in cases_qs.values("date_case__year")
                         .annotate(count=Count("id_case"))
                         .order_by("date_case__year")
    ]

    monthly = [0] * 12
    for d in cases_qs.filter(date_case__year=selected_year).values_list("date_case", flat=True):
        if d:
            monthly[d.month - 1] += 1

    top_clients = [
        {"name": row["id_client__descripcion_client"] or "—", "y": row["count"]}
        for row in cases_qs.values("id_client__descripcion_client")
                         .annotate(count=Count("id_case"))
                         .order_by("-count")[:10]
    ]

    # ---------- Charts: Clientes ----------
    clients_by_country = [
        {"name": row["country_client"] or "—", "y": row["count"]}
        for row in clients_qs.values("country_client")
                          .annotate(count=Count("id_client"))
                          .order_by("-count")
    ]

    clients_by_sector = [
        {"name": row["sector_client"] or "—", "y": row["count"]}
        for row in clients_qs.values("sector_client")
                          .annotate(count=Count("id_client"))
                          .order_by("-count")
    ]

    # ---------- Filtros ----------
    years_available = sorted(
        {d.year for d in SuccessCase.objects.values_list("date_case", flat=True) if d},
        reverse=True,
    )
    if current_year not in years_available:
        years_available.insert(0, current_year)

    sectors_available = sorted(
        set(SuccessCase.objects.values_list("sector_case", flat=True).distinct())
        | set(Client.objects.values_list("sector_client", flat=True).distinct())
    )

    context = {
        "selected_year":   selected_year,
        "selected_sector": sector_param,
        "years":           years_available,
        "sectors":         sectors_available,
        "months":          MONTHS,
        "kpis_cases": {
            "total":          total_cases,
            "this_year":      cases_this_year,
            "sectors":        sectors_cases,
            "avg_per_client": avg_per_client,
        },
        "kpis_clients": {
            "total":     total_clients,
            "countries": countries_count,
            "sectors":   sectors_clients,
            "active":    active_clients,
        },
        "chart_cases_by_sector":    cases_by_sector,
        "chart_cases_by_year":      cases_by_year,
        "chart_cases_by_month":     monthly,
        "chart_top_clients":        top_clients,
        "chart_clients_by_country": clients_by_country,
        "chart_clients_by_sector":  clients_by_sector,
    }
    return render(request, "sources/dashboard.html", context)


import json

def applications(request):
    """Página principal de gestión de aplicaciones (SuccessCase)."""
    urls = {
        "list":    "/sources/api/cases/",
        "detail":  "/sources/api/cases/__ID__/",
        "clients": "/sources/api/clients/",
    }
    i18n_strings = {
        "newApp":        "Nueva aplicación",
        "editApp":       "Editar aplicación",
        "detail":        "Detalle",
        "view":          "Ver detalle",
        "edit":          "Editar",
        "delete":        "Eliminar",
        "refresh":       "Actualizar",
        "exportExcel":   "Exportar a Excel",
        "print":         "Imprimir",
        "sector":        "Sector",
        "client":        "Cliente",
        "date":          "Fecha",
        "description":   "Descripción",
        "website":       "Sitio web",
        "created":       "Creado",
        "updated":       "Actualizado",
        "noClient":      "(sin cliente)",
        "noData":        "Sin datos",
        "noResults":     "Sin resultados",
        "of":            "de",
        "allSectors":    "Todos los sectores",
        "selectClient":  "Selecciona un cliente…",
        "requiredFields":"Rellena todos los campos obligatorios.",
        "saveError":     "No se pudo guardar.",
        "loadError":     "No se pudieron cargar los datos.",
        "deleteError":   "No se pudo eliminar.",
        "created_msg":   "Aplicación creada.",
        "updated":       "Aplicación actualizada.",
        "deleted":       "Aplicación eliminada.",
        "deleting":      "Eliminando…",
        "confirmDelete": "¿Eliminar la aplicación de \"{0}\"?",
        "appsTitle":     "Fixalius · Aplicaciones",
        "appsSheet":     "Aplicaciones",
        "appsCount":     "aplicaciones",
        "loading":       "Cargando…",
        "missingLibs":   "Faltan librerías para exportar.",
        "popupBlocked":  "Activa las ventanas emergentes para imprimir.",
        # Ajustes que sobrescriben claves repetidas o traducen texto exacto
        "created":       "Aplicación creada.",
    }
    return render(request, "sources/applications.html", {
        "urls": urls,
        "i18n_strings": i18n_strings,
    })


# ---------- API ----------

def _serialize_case(c):
    return {
        "id_case":          c.id_case,
        "descripcion_case": c.descripcion_case,
        "sector_case":      c.sector_case,
        "date_case":        c.date_case.isoformat() if c.date_case else None,
        "www_case":         c.www_case,
        "id_client":        c.id_client_id,
        "client_name":      c.id_client.descripcion_client if c.id_client else "",
        "image_url":        c.image_case.url if c.image_case else None,
        "alta":             c.alta.isoformat() if c.alta else None,
        "update":           c.update.isoformat() if c.update else None,
    }


@require_http_methods(["GET", "POST"])
def case_api(request):
    if request.method == "GET":
        qs = SuccessCase.objects.select_related("id_client").order_by("-date_case", "-id_case")
        return JsonResponse({"results": [_serialize_case(c) for c in qs]})

    # POST → crear
    try:
        client = Client.objects.get(pk=request.POST.get("id_client"))
    except (Client.DoesNotExist, TypeError, ValueError):
        return JsonResponse({"error": "Cliente no válido."}, status=400)

    try:
        case = SuccessCase.objects.create(
            descripcion_case=request.POST.get("descripcion_case", "").strip(),
            sector_case=request.POST.get("sector_case", "").strip(),
            date_case=request.POST.get("date_case") or None,
            www_case=request.POST.get("www_case", "").strip(),
            image_case=request.FILES.get("image_case"),
            id_client=client,
        )
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)

    return JsonResponse(_serialize_case(case), status=201)


@require_http_methods(["GET", "POST", "PATCH", "DELETE"])
def case_detail_api(request, pk):
    case = get_object_or_404(SuccessCase, pk=pk)

    if request.method == "GET":
        return JsonResponse(_serialize_case(case))

    if request.method == "DELETE":
        case.delete()
        return JsonResponse({"ok": True})

    # PATCH: aceptamos POST con _method=PATCH desde el front
    is_patch = request.method == "PATCH" or request.POST.get("_method", "").upper() == "PATCH"
    if not is_patch:
        return HttpResponseNotAllowed(["GET", "POST", "PATCH", "DELETE"])

    data = request.POST if request.method == "POST" else None
    if data is None:
        data = request.POST

    if "id_client" in data and data["id_client"]:
        try:
            case.id_client = Client.objects.get(pk=data["id_client"])
        except Client.DoesNotExist:
            return JsonResponse({"error": "Cliente no válido."}, status=400)

    for field in ("descripcion_case", "sector_case", "www_case"):
        if field in data:
            setattr(case, field, data.get(field, "").strip())

    if "date_case" in data and data["date_case"]:
        case.date_case = data["date_case"]

    if "image_case" in request.FILES:
        case.image_case = request.FILES["image_case"]

    case.save()
    return JsonResponse(_serialize_case(case))


@require_http_methods(["GET"])
def client_api(request):
    qs = Client.objects.order_by("descripcion_client")
    return JsonResponse({"results": [
        {"id_client": c.id_client, "descripcion_client": c.descripcion_client or f"#{c.id_client}"}
        for c in qs
    ]})
    
# ---------- Clientes ----------
def clients(request):
    """Página principal de gestión de clientes."""
    urls = {
        "list":   "/sources/api/clients/",
        "detail": "/sources/api/clients/__ID__/",
    }
    i18n_strings = {
        "newClient":     "Nuevo cliente",
        "editClient":    "Editar cliente",
        "detail":        "Detalle del cliente",
        "view":          "Ver detalle",
        "edit":          "Editar",
        "delete":        "Eliminar",
        "refresh":       "Actualizar",
        "exportExcel":   "Exportar a Excel",
        "print":         "Imprimir",
        "description":   "Descripción",
        "sector":        "Sector",
        "country":       "País",
        "email":         "Email",
        "website":       "Sitio web",
        "cases":         "Casos",
        "casesList":     "Casos asociados",
        "created":       "Alta",
        "noCases":       "Este cliente aún no tiene casos registrados.",
        "noName":        "(sin descripción)",
        "noData":        "Sin datos",
        "noResults":     "Sin resultados",
        "of":            "de",
        "allSectors":    "Todos los sectores",
        "allCountries":  "Todos los países",
        "requiredFields":"Rellena los campos obligatorios.",
        "invalidCountry":"El país debe ser un código ISO de 2 letras (ES, US…).",
        "saveError":     "No se pudo guardar.",
        "loadError":     "No se pudieron cargar los datos.",
        "deleteError":   "No se pudo eliminar.",
        "msgCreated":    "Cliente creado.",
        "msgUpdated":    "Cliente actualizado.",
        "msgDeleted":    "Cliente eliminado.",
        "deleting":      "Eliminando…",
        "confirmDelete": "¿Eliminar el cliente \"{0}\"? Se perderán los casos asociados si no hay otros clientes.",
        "clientsTitle":  "Fixalius · Clientes",
        "clientsSheet":  "Clientes",
        "clientsCount":  "clientes",
        "loading":       "Cargando…",
        "missingLibs":   "Faltan librerías para exportar.",
        "popupBlocked":  "Activa las ventanas emergentes para imprimir.",
    }
    return render(request, "sources/clients.html", {
        "urls": urls,
        "i18n_strings": i18n_strings,
    })


# ---------- API Clientes ----------

def _serialize_client(c, include_cases=False):
    data = {
        "id_client":          c.id_client,
        "descripcion_client": c.descripcion_client or "",
        "sector_client":      c.sector_client or "",
        "country_client":     c.country_client or "",
        "email_client":       c.email_client or "",
        "www_client":         c.www_client or "",
        "logo_url":           c.logo_client.url if c.logo_client else None,
        "cases_count":        getattr(c, "cases_count", c.success_cases.count()),
    }
    if include_cases:
        data["cases"] = [
            {
                "id_case":          sc.id_case,
                "descripcion_case": sc.descripcion_case,
                "sector_case":      sc.sector_case,
                "date_case":        sc.date_case.isoformat() if sc.date_case else None,
            }
            for sc in c.success_cases.all().order_by("-date_case", "-id_case")
        ]
    return data


@require_http_methods(["GET", "POST"])
def client_api(request):
    if request.method == "GET":
        qs = Client.objects.annotate(cases_count=Count("success_cases")).order_by("descripcion_client")
        return JsonResponse({"results": [_serialize_client(c) for c in qs]})

    # POST → crear
    country = (request.POST.get("country_client") or "").strip().upper()
    if not country or len(country) != 2:
        return JsonResponse({"error": "El país debe ser un código ISO de 2 letras."}, status=400)

    try:
        c = Client.objects.create(
            descripcion_client=(request.POST.get("descripcion_client") or "").strip(),
            sector_client=     (request.POST.get("sector_client") or "").strip(),
            country_client=    country,
            email_client=      (request.POST.get("email_client") or "").strip(),
            www_client=        (request.POST.get("www_client") or "").strip(),
            logo_client=       request.FILES.get("logo_client"),
        )
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)

    return JsonResponse(_serialize_client(c), status=201)


@require_http_methods(["GET", "POST", "PATCH", "DELETE"])
def client_detail_api(request, pk):
    c = get_object_or_404(Client, pk=pk)

    if request.method == "GET":
        return JsonResponse(_serialize_client(c, include_cases=True))

    if request.method == "DELETE":
        try:
            c.delete()
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)
        return JsonResponse({"ok": True})

    is_patch = request.method == "PATCH" or request.POST.get("_method", "").upper() == "PATCH"
    if not is_patch:
        return HttpResponseNotAllowed(["GET", "POST", "PATCH", "DELETE"])

    data = request.POST
    if "descripcion_client" in data:
        c.descripcion_client = data.get("descripcion_client", "").strip()
    if "sector_client" in data:
        c.sector_client = data.get("sector_client", "").strip()
    if "country_client" in data:
        country = (data.get("country_client") or "").strip().upper()
        if len(country) != 2:
            return JsonResponse({"error": "País inválido."}, status=400)
        c.country_client = country
    if "email_client" in data:
        c.email_client = data.get("email_client", "").strip()
    if "www_client" in data:
        c.www_client = data.get("www_client", "").strip()
    if "logo_client" in request.FILES:
        c.logo_client = request.FILES["logo_client"]

    c.save()
    return JsonResponse(_serialize_client(c))
