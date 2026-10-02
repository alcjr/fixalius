# -*- coding: utf-8 -*-
"""
apps/config/views.py
------------------------------------------------------------------
Vistas para visualizar y editar el config.ini de Fixalius.

Expone:
    GET  /config/                    -> panel pasarela (Admin/Visor/Config)
    GET  /config/parametros/         -> editor de config.ini
    GET  /config/api/config/         -> JSON con secciones/claves/valores
    POST /config/api/config/save/    -> guarda cambios
    POST /config/api/config/reload/  -> recarga el archivo desde disco
------------------------------------------------------------------
"""

import configparser
import json
import os
import shutil
from datetime import datetime

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_POST


# ------------------------------------------------------------------
# Ruta del config.ini: en Fixalius vive en la raíz del proyecto.
# ------------------------------------------------------------------
def get_config_ini_path():
    return os.path.join(str(settings.BASE_DIR), "config.ini")


BOOLEAN_TRUE  = {"1", "true", "yes", "on", "si", "sí"}
BOOLEAN_FALSE = {"0", "false", "no", "off"}


def _infer_type(raw_value):
    v = (raw_value or "").strip().lower()
    if v in BOOLEAN_TRUE or v in BOOLEAN_FALSE:
        return "boolean"
    try:
        int(raw_value)
        return "integer"
    except (TypeError, ValueError):
        pass
    try:
        float(raw_value)
        return "float"
    except (TypeError, ValueError):
        pass
    return "string"


def _coerce_for_display(raw_value, field_type):
    if field_type == "boolean":
        return (raw_value or "").strip().lower() in BOOLEAN_TRUE
    if field_type == "integer":
        try:
            return int(raw_value)
        except (TypeError, ValueError):
            return raw_value
    if field_type == "float":
        try:
            return float(raw_value)
        except (TypeError, ValueError):
            return raw_value
    return raw_value


def _coerce_for_storage(value, field_type):
    if field_type == "boolean":
        return "true" if value in (True, "true", "True", "1", 1) else "false"
    if field_type in ("integer", "float"):
        return str(value)
    return "" if value is None else str(value)


def _read_config_structured():
    """Lee config.ini y devuelve una estructura serializable a JSON."""
    ruta = get_config_ini_path()
    parser = configparser.ConfigParser()

    exists = os.path.isfile(ruta)
    sections = []

    if exists:
        parser.read(ruta, encoding="utf-8")
        for section_name in parser.sections():
            keys = []
            for key, raw_value in parser.items(section_name):
                field_type = _infer_type(raw_value)
                keys.append({
                    "key": key,
                    "raw": raw_value,
                    "value": _coerce_for_display(raw_value, field_type),
                    "type": field_type,
                })
            sections.append({"name": section_name, "keys": keys})

    last_modified = None
    if exists:
        ts = os.path.getmtime(ruta)
        last_modified = datetime.fromtimestamp(ts).isoformat()

    return {
        "path": ruta,
        "exists": exists,
        "last_modified": last_modified,
        "sections": sections,
    }


# ------------------------------------------------------------------
# VISTA PASARELA
# ------------------------------------------------------------------
@login_required
def panel_view(request):
    """Página pasarela: enlaces a Admin, Visor y Configuración."""
    return render(request, "config/panel.html")


# ------------------------------------------------------------------
# VISTA EDITOR
# ------------------------------------------------------------------
@login_required
def config_view(request):
    """Renderiza la plantilla del editor. Los datos se cargan por AJAX."""
    return render(request, "config/config.html")


# ------------------------------------------------------------------
# API: LEER
# ------------------------------------------------------------------
@login_required
@require_GET
def config_api_get(request):
    try:
        return JsonResponse(_read_config_structured(), status=200)
    except Exception as exc:
        return JsonResponse({"detail": f"Error al leer config.ini: {exc}"}, status=500)


# ------------------------------------------------------------------
# API: GUARDAR
# ------------------------------------------------------------------
@login_required
@require_POST
def config_api_save(request):
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"detail": "JSON inválido"}, status=400)

    sections = payload.get("sections")
    if not isinstance(sections, list):
        return JsonResponse({"detail": "Formato de payload incorrecto: se esperaba 'sections'"}, status=400)

    ruta = get_config_ini_path()

    if os.path.isfile(ruta):
        backup_path = ruta + ".bak"
        try:
            shutil.copy2(ruta, backup_path)
        except OSError as exc:
            return JsonResponse({"detail": f"No se pudo crear backup: {exc}"}, status=500)

    parser = configparser.ConfigParser()

    try:
        for section in sections:
            section_name = section.get("name")
            if not section_name:
                continue
            parser.add_section(section_name)
            for item in section.get("keys", []):
                key = item.get("key")
                if not key:
                    continue
                field_type = item.get("type", "string")
                value = item.get("value")
                parser.set(section_name, key, _coerce_for_storage(value, field_type))

        tmp_path = ruta + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            parser.write(f)
        os.replace(tmp_path, ruta)

    except Exception as exc:
        return JsonResponse({"detail": f"Error al guardar config.ini: {exc}"}, status=500)

    data = _read_config_structured()
    return JsonResponse({"detail": "Configuración guardada correctamente", **data}, status=200)


# ------------------------------------------------------------------
# API: RECARGAR
# ------------------------------------------------------------------
@login_required
@require_POST
def config_api_reload(request):
    try:
        return JsonResponse(_read_config_structured(), status=200)
    except Exception as exc:
        return JsonResponse({"detail": f"Error al recargar config.ini: {exc}"}, status=500)