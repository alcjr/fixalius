"""Visor de trazas: muestra y vacía el archivo único de log (logs/app.log).

- Página:   GET  visor:index        (personal)
- Lectura:  GET  visor:visor_read   (personal)   -> {"success": true, "content": "..."}
- Borrado:  POST visor:visor_clear  (superusuario)
"""
import logging
from functools import wraps
from pathlib import Path

from django.conf import settings
from django.contrib.auth.decorators import user_passes_test
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_POST

logger = logging.getLogger(__name__)
audit = logging.getLogger("fixalius.audit")

LOG_FILE = Path(getattr(settings, "LOG_DIR", Path(settings.BASE_DIR) / "logs")) / "app.log"

DEFAULT_LINES = 5000          # coincide con la opción más alta del selector
MAX_LINES = 20000
MAX_BYTES = 8 * 1024 * 1024   # solo se lee el final del archivo, nunca entero


def _json_guard(check, message):
    """Como login_required, pero responde JSON 401/403 en vez de redirigir al login
    (un fetch que sigue la redirección recibiría HTML y fallaría al hacer r.json())."""
    def decorator(view):
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            user = request.user
            if not user.is_authenticated:
                return JsonResponse({"success": False, "error": "No autenticado."}, status=401)
            if not check(user):
                return JsonResponse({"success": False, "error": message}, status=403)
            return view(request, *args, **kwargs)
        return wrapper
    return decorator


staff_json = _json_guard(lambda u: u.is_active and u.is_staff, "Permiso denegado.")
superuser_json = _json_guard(lambda u: u.is_active and u.is_superuser,
                             "Solo un superusuario puede borrar las trazas.")


def _tail(path, max_lines):
    """Últimas `max_lines` líneas de `path`, leyendo como mucho MAX_BYTES del final."""
    size = path.stat().st_size
    with open(path, "rb") as fh:
        truncated = size > MAX_BYTES
        if truncated:
            fh.seek(size - MAX_BYTES)
        raw = fh.read()
    text = raw.decode("utf-8", errors="replace")
    lines = text.splitlines()
    if truncated and lines:
        lines = lines[1:]                      # la primera puede estar cortada
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
        truncated = True
    return lines, size, truncated


@user_passes_test(lambda u: u.is_active and u.is_staff, login_url=settings.LOGIN_URL)
def visor(request):
    return render(request, "visor/visor.html", {"nav_active": "visor"})


@never_cache
@require_GET
@staff_json
def log_read(request):
    try:
        n = int(request.GET.get("lines", DEFAULT_LINES))
    except (TypeError, ValueError):
        n = DEFAULT_LINES
    n = max(1, min(n, MAX_LINES))

    if not LOG_FILE.exists():
        return JsonResponse({"success": True, "content": "", "size": 0, "truncated": False})
    try:
        lines, size, truncated = _tail(LOG_FILE, n)
    except OSError:
        logger.exception("No se pudo leer %s", LOG_FILE)
        return JsonResponse({"success": False, "error": "No se pudo leer el archivo de trazas."}, status=500)

    return JsonResponse({
        "success": True,
        "content": "\n".join(lines),
        "size": size,
        "truncated": truncated,
    })


@require_POST
@superuser_json
def log_clear(request):
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "w", encoding="utf-8"):
            pass                                # trunca el archivo
    except OSError:
        logger.exception("No se pudo vaciar %s", LOG_FILE)
        return JsonResponse({"success": False, "error": "No se pudo vaciar el archivo de trazas."}, status=500)

    # Se registra después de vaciar, para que quede constancia de quién lo hizo.
    audit.info("visor.clear by_user=%s", request.user.pk)
    return JsonResponse({"success": True})
