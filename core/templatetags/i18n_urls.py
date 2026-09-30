from django import template
from django.urls import translate_url as _translate_url

register = template.Library()


@register.simple_tag(takes_context=True)
def translate_url(context, language_code):
    """
    Devuelve la URL actual traducida al idioma indicado.
    Requiere que la request esté en el contexto (RequestContext).
    """
    request = context.get("request")
    if request is None:
        return ""
    return _translate_url(request.path, language_code)