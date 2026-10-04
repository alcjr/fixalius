from django import template

from ..models import SuccessCase

register = template.Library()


@register.simple_tag
def get_success_cases(limit=12):
    """Casos de éxito para la landing; evita depender del contexto de la vista."""
    return list(
        SuccessCase.objects
        .select_related("sector", "client")
        .order_by("-date_case", "-id")[:limit]
    )
