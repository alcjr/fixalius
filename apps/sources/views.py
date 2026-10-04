from django.contrib.auth.decorators import login_required
from django.db.models import Count
from django.shortcuts import render
from django.utils import timezone

from .models import Client, SuccessCase

MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
          "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


@login_required
def dashboard(request):
    year_param = request.GET.get("year")
    sector_param = request.GET.get("sector") or None
    current_year = timezone.now().year
    selected_year = int(year_param) if (year_param or "").isdigit() else current_year

    cases_qs   = SuccessCase.objects.select_related("client", "sector")
    clients_qs = Client.objects.select_related("sector")

    if sector_param:
        cases_qs   = cases_qs.filter(sector__nombre_sector=sector_param)
        clients_qs = clients_qs.filter(sector__nombre_sector=sector_param)

    total_cases     = cases_qs.count()
    cases_this_year = cases_qs.filter(date_case__year=selected_year).count()
    sectors_cases   = cases_qs.values("sector_id").distinct().count()
    total_clients   = clients_qs.count()
    avg_per_client  = round(total_cases / total_clients, 1) if total_clients else 0

    countries_count = clients_qs.values("country_client").distinct().count()
    sectors_clients = clients_qs.values("sector_id").distinct().count()
    active_clients  = clients_qs.filter(success_cases__isnull=False).distinct().count()

    cases_by_sector = [
        {"name": r["sector__nombre_sector"] or "—", "y": r["count"]}
        for r in cases_qs.values("sector__nombre_sector")
                         .annotate(count=Count("id"))
                         .order_by("-count")
    ]
    cases_by_year = [
        {"year": r["date_case__year"], "count": r["count"]}
        for r in cases_qs.values("date_case__year")
                         .annotate(count=Count("id"))
                         .order_by("date_case__year")
    ]
    monthly = [0] * 12
    for d in cases_qs.filter(date_case__year=selected_year).values_list("date_case", flat=True):
        if d:
            monthly[d.month - 1] += 1

    top_clients = [
        {"name": r["client__nombre_client"] or "—", "y": r["count"]}
        for r in cases_qs.values("client__nombre_client")
                         .annotate(count=Count("id"))
                         .order_by("-count")[:10]
    ]
    clients_by_country = [
        {"name": r["country_client"] or "—", "y": r["count"]}
        for r in clients_qs.values("country_client")
                          .annotate(count=Count("id"))
                          .order_by("-count")
    ]
    clients_by_sector = [
        {"name": r["sector__nombre_sector"] or "—", "y": r["count"]}
        for r in clients_qs.values("sector__nombre_sector")
                          .annotate(count=Count("id"))
                          .order_by("-count")
    ]

    years_available = sorted(
        {d.year for d in SuccessCase.objects.values_list("date_case", flat=True) if d},
        reverse=True,
    )
    if current_year not in years_available:
        years_available.insert(0, current_year)

    sectors_available = sorted(
        set(SuccessCase.objects.values_list("sector__nombre_sector", flat=True).distinct())
        | set(Client.objects.values_list("sector__nombre_sector", flat=True).distinct())
    )

    return render(request, "sources/dashboard.html", {
        "selected_year": selected_year,
        "selected_sector": sector_param,
        "years": years_available,
        "sectors": sectors_available,
        "months": MONTHS,
        "kpis_cases": {
            "total": total_cases, "this_year": cases_this_year,
            "sectors": sectors_cases, "avg_per_client": avg_per_client,
        },
        "kpis_clients": {
            "total": total_clients, "countries": countries_count,
            "sectors": sectors_clients, "active": active_clients,
        },
        "chart_cases_by_sector":    cases_by_sector,
        "chart_cases_by_year":      cases_by_year,
        "chart_cases_by_month":     monthly,
        "chart_top_clients":        top_clients,
        "chart_clients_by_country": clients_by_country,
        "chart_clients_by_sector":  clients_by_sector,
    })


@login_required
def applications(request):
    return render(request, "sources/applications.html")


@login_required
def clients(request):
    return render(request, "sources/clients.html")

@login_required
def subscribers(request):
    return render(request, "sources/suscribers.html")


@login_required
def documents(request):
    """Página de gestión de documentos."""
    return render(request, "sources/docs.html")

def newsletters(request):
    """Página de gestión de newsletters."""
    return render(request, "sources/newsletters.html")