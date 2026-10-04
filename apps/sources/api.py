# apps/sources/api.py
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticatedOrReadOnly   # o el que uses
from rest_framework.response import Response

from .models import Client, Sector, SuccessCase


# ============================================================ SERIALIZERS ====

class SectorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sector
        fields = ["id", "nombre_sector", "activo"]


class ClientSerializer(serializers.ModelSerializer):
    sector_name = serializers.CharField(source="sector.nombre_sector", read_only=True)
    cases_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Client
        fields = [
            "id", "nombre_client", "descripcion_client",
            "sector", "sector_name",
            "country_client", "email_client", "www_client",
            "logo_client", "cases_count",
        ]
        read_only_fields = ["id", "cases_count"]

    def validate_country_client(self, value):
        if not value:
            return value
        value = value.strip().upper()
        if len(value) != 2:
            raise serializers.ValidationError(
                "Debe ser un código ISO 3166-1 alpha-2 (2 letras)."
            )
        return value

    def validate_email_client(self, value):
        return (value or "").strip().lower()


class SuccessCaseSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.nombre_client", read_only=True)
    sector_name = serializers.CharField(source="sector.nombre_sector", read_only=True)

    class Meta:
        model = SuccessCase
        fields = [
            "id", "title", "slug", "descripcion_case",
            "sector", "sector_name",
            "client", "client_name",
            "date_case", "www_case", "image_case",
            "alta", "update",
        ]
        read_only_fields = ["id", "slug", "alta", "update"]


# ============================================================ PAGINACIÓN ====

class StandardPagination(LimitOffsetPagination):
    default_limit = 25
    max_limit = 500


# ============================================================== VIEWSETS ====

class SectorViewSet(mixins.ListModelMixin,
                    mixins.RetrieveModelMixin,
                    mixins.CreateModelMixin,
                    viewsets.GenericViewSet):
    """Lee el catálogo y permite crear sectores sobre la marcha desde la intranet."""

    serializer_class = SectorSerializer
    pagination_class = StandardPagination
    filter_backends  = [SearchFilter, OrderingFilter]
    search_fields    = ["nombre_sector"]
    ordering_fields  = ["nombre_sector", "id"]
    ordering         = ["nombre_sector"]
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        # Por defecto se devuelven TODOS los sectores (activos e inactivos) para
        # que el alta pueda reactivar uno existente. Los filtros que solo quieren
        # activos pueden pedir ?only_active=1.
        qs = Sector.objects.order_by("nombre_sector")
        if self.request.query_params.get("only_active") == "1":
            qs = qs.filter(activo=True)
        return qs

    def paginate_queryset(self, queryset):
        # El combo del popup pide ?all=1 y recibe un array plano.
        if self.request.query_params.get("all") in ("1", "true", "yes"):
            return None
        return super().paginate_queryset(queryset)

    def create(self, request, *args, **kwargs):
        # Alta idempotente: si ya existe (case-insensitive), devuelve el existente
        # con 200 y lo reactiva si estaba inactivo.
        nombre = (request.data.get("nombre_sector") or "").strip()
        if nombre:
            existing = Sector.objects.filter(nombre_sector__iexact=nombre).first()
            if existing:
                if not existing.activo:
                    existing.activo = True
                    existing.save(update_fields=["activo"])
                return Response(self.get_serializer(existing).data, status=200)
        return super().create(request, *args, **kwargs)


class ClientViewSet(viewsets.ModelViewSet):
    serializer_class = ClientSerializer
    pagination_class = StandardPagination
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [OrderingFilter]
    ordering_fields = ["nombre_client", "country_client",
                       "sector__nombre_sector", "cases_count", "id"]
    ordering = ["nombre_client"]

    def get_queryset(self):
        qs = (Client.objects
              .select_related("sector")
              .annotate(cases_count=Count("success_cases", distinct=True)))
        p = self.request.query_params
        sector = p.get("sector")
        country = p.get("country")
        search = p.get("search")
        has_cases = p.get("has_cases")
        no_logo = p.get("no_logo")

        if sector:
            if str(sector).isdigit():
                qs = qs.filter(sector_id=sector)
            else:
                qs = qs.filter(sector__nombre_sector=sector)
        if country:
            qs = qs.filter(country_client=country.upper())
        if search:
            qs = qs.filter(
                Q(nombre_client__icontains=search)
                | Q(descripcion_client__icontains=search)
                | Q(email_client__icontains=search)
                | Q(sector__nombre_sector__icontains=search)
                | Q(country_client__icontains=search)
            )
        if has_cases == "1":
            qs = qs.filter(success_cases__isnull=False).distinct()
        if has_cases == "0":
            qs = qs.filter(success_cases__isnull=True)
        if no_logo == "1":
            qs = qs.filter(Q(logo_client="") | Q(logo_client__isnull=True))
        return qs

    @action(detail=False, methods=["get"])
    def kpis(self, request):
        qs = self.filter_queryset(self.get_queryset()).order_by()
        return Response({
            "total":      qs.count(),
            "with_cases": qs.filter(success_cases__isnull=False).distinct().count(),
            "sectors":    qs.values("sector_id").distinct().count(),
            "countries":  qs.values("country_client").distinct().count(),
        })

    @action(detail=False, methods=["get"])
    def sectors(self, request):
        rows = (Client.objects
                .values("sector_id", "sector__nombre_sector")
                .annotate(count=Count("id"))
                .order_by("sector__nombre_sector"))
        return Response([
            {"id": r["sector_id"],
             "name": r["sector__nombre_sector"] or "—",
             "count": r["count"]}
            for r in rows
        ])

    @action(detail=False, methods=["get"])
    def countries(self, request):
        rows = (Client.objects
                .values("country_client")
                .annotate(count=Count("id"))
                .order_by("-count", "country_client"))
        return Response([
            {"code": r["country_client"],
             "name": r["country_client"],
             "count": r["count"]}
            for r in rows if r["country_client"]
        ])


class SuccessCaseViewSet(viewsets.ModelViewSet):
    serializer_class = SuccessCaseSerializer
    pagination_class = StandardPagination
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [OrderingFilter]
    ordering_fields = ["date_case", "id", "title", "alta", "update",
                       "client__nombre_client", "sector__nombre_sector"]
    ordering = ["-date_case", "-id"]

    def get_queryset(self):
        qs = SuccessCase.objects.select_related("client", "sector")
        p = self.request.query_params

        client = p.get("client") or p.get("id_client")
        sector = p.get("sector")
        year   = p.get("year")
        search = p.get("search")
        chip   = p.get("chip")

        if client:
            qs = qs.filter(client_id=client)
        if sector:
            if str(sector).isdigit():
                qs = qs.filter(sector_id=sector)
            else:
                qs = qs.filter(sector__nombre_sector=sector)
        if year and year.isdigit():
            qs = qs.filter(date_case__year=int(year))
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(descripcion_case__icontains=search)
                | Q(client__nombre_client__icontains=search)
                | Q(sector__nombre_sector__icontains=search)
            )

        today = timezone.localdate()
        if chip == "year":
            qs = qs.filter(date_case__year=today.year)
        elif chip == "last12":
            qs = qs.filter(date_case__gte=today - timedelta(days=365))
        elif chip == "no_image":
            qs = qs.filter(Q(image_case="") | Q(image_case__isnull=True))
        return qs

    @action(detail=False, methods=["get"])
    def kpis(self, request):
        qs = self.filter_queryset(self.get_queryset()).order_by()
        today = timezone.localdate()
        return Response({
            "total":   qs.count(),
            "clients": qs.values("client_id").distinct().count(),
            "sectors": qs.values("sector_id").distinct().count(),
            "year":    qs.filter(date_case__year=today.year).count(),
        })

    @action(detail=False, methods=["get"])
    def sectors(self, request):
        rows = (SuccessCase.objects
                .values("sector_id", "sector__nombre_sector")
                .annotate(count=Count("id"))
                .order_by("sector__nombre_sector"))
        return Response([
            {"id": r["sector_id"],
             "name": r["sector__nombre_sector"] or "—",
             "count": r["count"]}
            for r in rows
        ])
