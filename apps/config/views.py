# -*- coding: utf-8 -*-
"""
apps/config/views.py
------------------------------------------------------------------
Editor de config.ini de Fixalius (solo superusuarios: el archivo contiene
credenciales de correo).

    GET  /config/                    -> panel pasarela (personal)
    GET  /config/parametros/         -> editor de config.ini
    GET  /config/api/config/         -> JSON con secciones/claves/valores
    POST /config/api/config/save/    -> guarda cambios
    POST /config/api/config/reload/  -> recarga el archivo desde disco

Notas de diseño
- Las claves "secretas" (password, token…) se envían enmascaradas. Si al guardar
  llega la máscara sin tocar, se conserva el valor que hay en disco.
- Al guardar solo se reescriben las líneas cuyo valor cambió: se conservan
  comentarios, orden, mayúsculas y saltos de línea. Si no se puede localizar una
  línea, se reescribe con configparser (se pierden los comentarios) y se avisa.
- Sin interpolación: un "%" en un valor no rompe nada.
"""
import codecs
import configparser
import io
import json
import logging
import math
import os
import re
import shutil
from datetime import datetime
from functools import wraps

from django.conf import settings
from django.contrib.auth.views import redirect_to_login
from django.core.exceptions import PermissionDenied
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

logger = logging.getLogger(__name__)
audit = logging.getLogger("fixalius.audit")

SECRET_MASK = "********"
SECRET_HINTS = ("password", "passwd", "pwd", "secret", "token", "api_key", "apikey")
BOOLEAN_TRUE = {"true", "yes", "on", "si", "sí"}
BOOLEAN_FALSE = {"false", "no", "off"}
FIELD_TYPES = {"boolean", "integer", "float", "string"}
KEY_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,64}$")
SECTION_RE = re.compile(r"^\[(?P<name>[^\]]+)\]")
KV_RE = re.compile(r"^(?P<key>[^=:\s][^=:]*?)(?P<sep>\s*[=:]\s*)(?P<val>.*?)(?P<eol>\r?\n?)$")


def get_config_ini_path():
    return os.path.join(str(settings.BASE_DIR), "config.ini")


# ------------------------------------------------------------------
# Permisos
# ------------------------------------------------------------------
def _page_guard(check):
    def decorator(view):
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return redirect_to_login(request.get_full_path())
            if not check(request.user):
                raise PermissionDenied
            return view(request, *args, **kwargs)
        return wrapper
    return decorator


def _json_guard(check):
    """Como _page_guard, pero responde JSON 401/403 (el JS espera JSON)."""
    def decorator(view):
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return JsonResponse({"detail": "No autenticado."}, status=401)
            if not check(request.user):
                return JsonResponse({"detail": "Permiso denegado."}, status=403)
            return view(request, *args, **kwargs)
        return wrapper
    return decorator


_is_staff = lambda u: u.is_active and u.is_staff
_is_superuser = lambda u: u.is_active and u.is_superuser
staff_page, superuser_page = _page_guard(_is_staff), _page_guard(_is_superuser)
superuser_json = _json_guard(_is_superuser)


# ------------------------------------------------------------------
# Lectura / tipos
# ------------------------------------------------------------------
def _is_secret(key):
    k = key.lower()
    return any(h in k for h in SECRET_HINTS)


def _infer_type(raw_value):
    """Solo infiere un tipo si guardar el valor devuelve exactamente el original."""
    s = (raw_value or "").strip()
    low = s.lower()
    if low in BOOLEAN_TRUE or low in BOOLEAN_FALSE:
        return "boolean"
    try:
        if str(int(s)) == s:
            return "integer"
    except ValueError:
        pass
    try:
        f = float(s)
        if math.isfinite(f) and str(f) == s:
            return "float"
    except ValueError:
        pass
    return "string"


def _coerce_for_display(raw_value, field_type):
    if field_type == "boolean":
        return (raw_value or "").strip().lower() in BOOLEAN_TRUE
    if field_type == "integer":
        return int(raw_value)
    if field_type == "float":
        return float(raw_value)
    return raw_value


def _new_parser():
    parser = configparser.ConfigParser(interpolation=None)
    parser.optionxform = str          # conserva mayúsculas/minúsculas de las claves
    return parser


def _read_text(path):
    """Devuelve (texto, codificación). Respeta BOM y cae a cp1252/latin-1."""
    with open(path, "rb") as fh:
        raw = fh.read()
    if raw.startswith(codecs.BOM_UTF8):
        return raw[len(codecs.BOM_UTF8):].decode("utf-8"), "utf-8-sig"
    try:
        return raw.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        try:
            return raw.decode("cp1252"), "cp1252"
        except UnicodeDecodeError:
            return raw.decode("latin-1"), "latin-1"


def _read_config_structured():
    ruta = get_config_ini_path()
    exists = os.path.isfile(ruta)
    sections = []
    if exists:
        text, _enc = _read_text(ruta)
        parser = _new_parser()
        parser.read_string(text)
        for name in parser.sections():
            keys = []
            for key, raw in parser.items(name):
                secret = _is_secret(key)
                ftype = "string" if secret else _infer_type(raw)
                shown = SECRET_MASK if (secret and raw) else raw
                keys.append({
                    "key": key,
                    "raw": shown,
                    "value": shown if secret else _coerce_for_display(raw, ftype),
                    "type": ftype,
                    "secret": secret,
                })
            sections.append({"name": name, "keys": keys})
    return {
        "path": ruta,
        "exists": exists,
        "last_modified": datetime.fromtimestamp(os.path.getmtime(ruta)).isoformat() if exists else None,
        "sections": sections,
    }


# ------------------------------------------------------------------
# Escritura
# ------------------------------------------------------------------
def _coerce_for_storage(value, field_type):
    """Devuelve el texto a guardar o lanza ValueError con un mensaje legible."""
    if field_type == "boolean":
        return "true" if value in (True, "true", "True", "1", 1) else "false"
    if field_type == "integer":
        return str(int(str(value).strip()))
    if field_type == "float":
        f = float(str(value).strip())
        if not math.isfinite(f):
            raise ValueError("número no finito")
        return str(f)
    text = "" if value is None else str(value)
    if "\r" in text or "\n" in text:
        raise ValueError("no se admiten saltos de línea")
    return text.strip()


def _unchanged(old, new, field_type):
    if field_type == "boolean" and _infer_type(old) == "boolean":
        return (old.strip().lower() in BOOLEAN_TRUE) == (new == "true")
    return old == new


def _apply_updates(text, updates):
    """Sustituye solo las líneas modificadas. Lanza LookupError si no puede."""
    pending = {(s, k): v for s, k, v in updates}
    lines = text.splitlines(keepends=True)
    section = None
    for i, line in enumerate(lines):
        m = SECTION_RE.match(line)
        if m:
            section = m.group("name")
            continue
        if not line.strip() or line[:1].isspace() or line.lstrip().startswith((";", "#")):
            continue
        m = KV_RE.match(line)
        if not m or (section, m.group("key").strip()) not in pending:
            continue
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        if nxt[:1].isspace() and nxt.strip() and not nxt.lstrip().startswith((";", "#")):
            raise LookupError("valor multilínea")
        new = pending.pop((section, m.group("key").strip()))
        lines[i] = "%s%s%s%s" % (m.group("key"), m.group("sep"), new, m.group("eol"))
    if pending:
        raise LookupError("línea no encontrada")
    return "".join(lines)


def _rewrite_with_parser(parser, updates):
    for s, k, v in updates:
        parser.set(s, k, v)
    buf = io.StringIO()
    parser.write(buf)
    return buf.getvalue()


# ------------------------------------------------------------------
# Vistas de página
# ------------------------------------------------------------------
@staff_page
def panel_view(request):
    """Pasarela (ya no se enlaza desde el sidebar)."""
    return render(request, "config/panel.html")


@superuser_page
@ensure_csrf_cookie
def config_view(request):
    """Editor. Los datos se cargan por AJAX; ensure_csrf_cookie asegura el token."""
    return render(request, "config/config.html", {"nav_active": "config"})


# ------------------------------------------------------------------
# API
# ------------------------------------------------------------------
@require_GET
@superuser_json
def config_api_get(request):
    try:
        return JsonResponse(_read_config_structured())
    except Exception:
        logger.exception("Error al leer config.ini")
        return JsonResponse({"detail": "Error al leer config.ini (ver trazas)."}, status=500)


@require_POST
@superuser_json
def config_api_reload(request):
    try:
        return JsonResponse(_read_config_structured())
    except Exception:
        logger.exception("Error al recargar config.ini")
        return JsonResponse({"detail": "Error al recargar config.ini (ver trazas)."}, status=500)


@require_POST
@superuser_json
def config_api_save(request):
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"detail": "JSON inválido"}, status=400)
    sections = payload.get("sections") if isinstance(payload, dict) else None
    if not isinstance(sections, list):
        return JsonResponse({"detail": "Formato de payload incorrecto: se esperaba 'sections'"}, status=400)

    ruta = get_config_ini_path()
    if not os.path.isfile(ruta):
        return JsonResponse({"detail": "config.ini no existe en el servidor."}, status=404)

    try:
        text, enc = _read_text(ruta)
        parser = _new_parser()
        parser.read_string(text)
    except Exception:
        logger.exception("config.ini ilegible al guardar")
        return JsonResponse({"detail": "No se pudo leer config.ini (ver trazas)."}, status=500)

    # --- validar y calcular solo los cambios reales ---
    updates = []
    for section in sections:
        sname = section.get("name") if isinstance(section, dict) else None
        if not isinstance(sname, str) or not parser.has_section(sname):
            return JsonResponse({"detail": "Sección desconocida: %s" % sname}, status=400)
        for item in section.get("keys", []):
            key = item.get("key") if isinstance(item, dict) else None
            if not isinstance(key, str) or not KEY_RE.match(key) or not parser.has_option(sname, key):
                return JsonResponse({"detail": "Parámetro desconocido: %s.%s" % (sname, key)}, status=400)
            ftype = item.get("type", "string")
            value = item.get("value")
            if ftype not in FIELD_TYPES:
                return JsonResponse({"detail": "Tipo no válido en %s.%s" % (sname, key)}, status=400)
            if _is_secret(key) and value == SECRET_MASK:
                continue                                  # secreto sin tocar
            try:
                new = _coerce_for_storage(value, ftype)
            except (ValueError, TypeError) as exc:
                return JsonResponse({"detail": "Valor no válido en %s.%s: %s" % (sname, key, exc)}, status=400)
            if not _unchanged(parser.get(sname, key), new, ftype):
                updates.append((sname, key, new))

    if not updates:
        return JsonResponse({"detail": "Sin cambios", **_read_config_structured()})

    # --- construir el nuevo texto ---
    warning = None
    try:
        new_text = _apply_updates(text, updates)
        check = _new_parser()
        check.read_string(new_text)
        if any(check.get(s, k) != v for s, k, v in updates):
            raise LookupError("verificación fallida")
    except (LookupError, configparser.Error):
        new_text = _rewrite_with_parser(parser, updates)
        warning = ("No se pudieron conservar los comentarios de config.ini; "
                   "el original está en config.ini.bak.")

    # --- escribir con copia de seguridad y reemplazo atómico ---
    tmp = ruta + ".tmp"
    try:
        shutil.copy2(ruta, ruta + ".bak")
        with open(tmp, "w", encoding=enc, newline="") as fh:
            fh.write(new_text)
        os.replace(tmp, ruta)
    except OSError:
        logger.exception("No se pudo escribir config.ini")
        if os.path.exists(tmp):
            os.remove(tmp)
        return JsonResponse({"detail": "No se pudo escribir config.ini (ver trazas)."}, status=500)

    audit.info("config.save by_user=%s changed=%s", request.user.pk, ["%s.%s" % (s, k) for s, k, _ in updates])
    data = _read_config_structured()
    resp = {"detail": "Configuración guardada correctamente", **data}
    if warning:
        resp["warning"] = warning
    return JsonResponse(resp)
