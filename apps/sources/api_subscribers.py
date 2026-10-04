import logging
from datetime import timedelta

from django.db.models import Case, CharField, Count, Q, Value, When
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from .api import StandardPagination
from .models import Subscriber

audit = logging.getLogger("fixalius.audit")

ESTADOS = ("active", "pending", "unsubscribed")

ESTADO = Case(
    When(baja__isnull=False, then=Value("unsubscribed")),
    When(activo=True, then=Value("active")),
    default=Value("pending"),
    output_field=CharField(),
)


class SubscriberSerializer(serializers.ModelSerializer):
    estado = serializers.SerializerMethodField()

    class Meta:
        model = Subscriber
        fields = ["id", "email", "activo", "estado", "alta", "baja"]
        read_only_fields = fields

    def get_estado(self, obj):
        e = getattr(obj, "estado", None)
        if e:
            return e
        return "unsubscribed" if obj.baja else ("active" if obj.activo else "pending")


class SubscriberViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin,
                        viewsets.GenericViewSet):
    serializer_class = SubscriberSerializer
    permission_classes = [IsAdminUser]
    pagination_class = StandardPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["email"]
    ordering_fields = ["id", "email", "alta", "baja", "estado"]
    ordering = ["-alta", "-id"]

    def get_queryset(self):
        qs = Subscriber.objects.annotate(estado=ESTADO)
        p = self.request.query_params

        chip = p.get("chip")
        if chip in ESTADOS:
            qs = qs.filter(estado=chip)

        now = timezone.now()
        period = p.get("alta_period")
        if period in ("7d", "30d", "90d"):
            qs = qs.filter(alta__gte=now - timedelta(days=int(period[:-1])))
        elif period == "year":
            qs = qs.filter(alta__year=timezone.localdate().year)
        return qs

    def perform_destroy(self, instance):
        audit.info("subscriber.delete id=%s by_user=%s", instance.pk, self.request.user.pk)
        instance.delete()

    @action(detail=True, methods=["post"])
    def unsubscribe(self, request, pk=None):
        sub = self.get_object()
        if sub.baja is None:
            sub.activo = False
            sub.baja = timezone.now()
            sub.token_confirmacion = None
            sub.save(update_fields=["activo", "baja", "token_confirmacion"])
            audit.info("subscriber.unsubscribe id=%s by_user=%s", sub.pk, request.user.pk)
        fresh = self.get_queryset().get(pk=sub.pk)
        return Response(self.get_serializer(fresh).data)

    @action(detail=False, methods=["get"])
    def kpis(self, request):
        qs = self.filter_queryset(self.get_queryset()).order_by()
        counts = qs.aggregate(
            total=Count("pk"),
            activos=Count("pk", filter=Q(estado="active")),
            pendientes=Count("pk", filter=Q(estado="pending")),
            bajas=Count("pk", filter=Q(estado="unsubscribed")),
        )

        today = timezone.localdate()
        first = (today.replace(day=1) - timedelta(days=330)).replace(day=1)
        by_month = {
            (r["m"].year, r["m"].month): r["n"]
            for r in qs.filter(alta__date__gte=first)
                       .annotate(m=TruncMonth("alta")).values("m").annotate(n=Count("pk"))
        }
        months, y, m = [], today.year, today.month
        for _ in range(12):
            months.append((y, m))
            m -= 1
            if m == 0:
                y, m = y - 1, 12
        counts["trends"] = {"total": [by_month.get(k, 0) for k in reversed(months)]}
        return Response(counts)