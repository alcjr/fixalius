from pathlib import Path

from django.utils.translation import gettext_lazy as _
from decouple import config as decouple_config

BASE_DIR = Path(__file__).resolve().parent.parent
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"


def _csv(value):
    return [h.strip() for h in value.split(',') if h.strip()]


# === SEGURIDAD (en producción, todas desde variables de entorno) ===
# DEBUG es False por defecto: si falta la variable en producción, la app NO
# arranca en modo debug. En local, define DEBUG=True en tu .env.
DEBUG = decouple_config('DEBUG', default=False, cast=bool)

# SECRET_KEY sin valor por defecto en producción: si falta, falla al arrancar.
# En desarrollo (DEBUG=True) se admite una clave de usar y tirar.
if DEBUG:
    SECRET_KEY = decouple_config('SECRET_KEY', default='dev-only-insecure-key-change-me')
else:
    SECRET_KEY = decouple_config('SECRET_KEY')  # sin default -> UndefinedValueError

ALLOWED_HOSTS = decouple_config(
    'ALLOWED_HOSTS', default='127.0.0.1,localhost', cast=_csv
)

# Ruta del admin configurable (la leen core/urls.py y core/views.py)
ADMIN_URL = decouple_config('ADMIN_URL', default='admin/')

# Render define RENDER_EXTERNAL_HOSTNAME automáticamente (p. ej. mi-app.onrender.com)
RENDER_EXTERNAL_HOSTNAME = decouple_config('RENDER_EXTERNAL_HOSTNAME', default='')
if RENDER_EXTERNAL_HOSTNAME and RENDER_EXTERNAL_HOSTNAME not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

# ¿Estamos detrás de un proxy que termina TLS? (Render lo es.)
BEHIND_PROXY = decouple_config(
    'BEHIND_PROXY', default=bool(RENDER_EXTERNAL_HOSTNAME), cast=bool
)

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'apps.authentication',
    'apps.config',
    'apps.visor',
    'apps.dashboard',
    'apps.sources',
]

# --- CSRF / COOKIES ----------------------------------------------------
# Seguras automáticamente cuando DEBUG=False (producción sobre HTTPS)
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_HTTPONLY = False           # True rompe document.cookie en JS
CSRF_COOKIE_SAMESITE = "Lax"           # "Strict" puede romper logout cross-tab

CSRF_TRUSTED_ORIGINS = decouple_config(
    'CSRF_TRUSTED_ORIGINS',
    default='http://localhost:8000,http://127.0.0.1:8000',
    cast=_csv,
)
if RENDER_EXTERNAL_HOSTNAME:
    _render_origin = f"https://{RENDER_EXTERNAL_HOSTNAME}"
    if _render_origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_render_origin)

# Solo nos fiamos de X-Forwarded-Proto si de verdad hay un proxy delante
# (si no, un cliente podría falsificar la cabecera).
if BEHIND_PROXY:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# --- Endurecimiento HTTPS (solo en producción) --------------------------
if not DEBUG:
    SECURE_SSL_REDIRECT = decouple_config('SECURE_SSL_REDIRECT', default=True, cast=bool)
    SECURE_HSTS_SECONDS = decouple_config('SECURE_HSTS_SECONDS', default=3600, cast=int)
    # Sube SECURE_HSTS_SECONDS a 31536000 (1 año) cuando confirmes que todo
    # funciona bajo HTTPS; después valora INCLUDE_SUBDOMAINS y PRELOAD.
    SECURE_HSTS_INCLUDE_SUBDOMAINS = decouple_config(
        'SECURE_HSTS_INCLUDE_SUBDOMAINS', default=False, cast=bool
    )
    SECURE_HSTS_PRELOAD = False
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = 'same-origin'
    X_FRAME_OPTIONS = 'DENY'

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',   # estáticos en producción
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'django.template.context_processors.i18n',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

# === BASE DE DATOS ===
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': decouple_config('DB_NAME', default='fixalius_db'),
        'USER': decouple_config('DB_USER', default='fixalius_db'),
        'PASSWORD': decouple_config('DB_PASSWORD', default=''),
        'HOST': decouple_config('DB_HOST', default='localhost'),
        'PORT': decouple_config('DB_PORT', default='5432'),
        'CONN_MAX_AGE': 60,
        'ATOMIC_REQUESTS': True,
    }
}

# === AUTENTICACIÓN ===
# Login con nombre de usuario O correo electrónico.
# IMPORTANTE: EmailOrUsernameBackend debe heredar de ModelBackend (o implementar
# has_perm / has_module_perms / get_user) para que admin y permisos funcionen.
AUTHENTICATION_BACKENDS = [
    'apps.authentication.backends.EmailOrUsernameBackend',
]

LOGIN_URL = '/accounts/login/'
LOGIN_REDIRECT_URL = '/menu/'
LOGOUT_REDIRECT_URL = '/'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# === INTERNACIONALIZACIÓN ===
LANGUAGE_CODE = 'es'
LANGUAGES = [
    ('es', _('Español')),
    ('en', _('English')),
]
USE_I18N = True
LOCALE_PATHS = [BASE_DIR / 'locale']
TIME_ZONE = 'UTC'
USE_TZ = True

# === ESTÁTICOS Y FICHEROS ===
STATIC_URL = 'static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATIC_ROOT = BASE_DIR / 'staticfiles'

STORAGES = {
    # Media: en Render el disco es efímero. Para producción real, sustituye
    # este backend por S3/R2 (django-storages) o monta un disco persistente
    # en MEDIA_ROOT.
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # Estáticos con compresión y nombres con hash (caché agresiva).
    "staticfiles": {
        "BACKEND": (
            "django.contrib.staticfiles.storage.StaticFilesStorage"
            if DEBUG
            else "whitenoise.storage.CompressedManifestStaticFilesStorage"
        )
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# === EMAIL ===
# En desarrollo (sin EMAIL_BACKEND en .env) los correos se imprimen en la consola.
EMAIL_BACKEND = decouple_config('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = decouple_config('EMAIL_HOST', default='localhost')
EMAIL_PORT = decouple_config('EMAIL_PORT', default=465, cast=int)
EMAIL_HOST_USER = decouple_config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = decouple_config('EMAIL_HOST_PASSWORD', default='')
EMAIL_USE_SSL = decouple_config('EMAIL_USE_SSL', default=True, cast=bool)   # puerto 465
EMAIL_USE_TLS = False                                                       # solo para 587
EMAIL_TIMEOUT = 15
DEFAULT_FROM_EMAIL = decouple_config('DEFAULT_FROM_EMAIL', default='no-reply@fixalius.com')
SERVER_EMAIL = decouple_config('SERVER_EMAIL', default=DEFAULT_FROM_EMAIL)

# === LOGS ===
# Un único archivo (logs/app.log). Las líneas de auditoría se identifican
# por el nombre del logger: "fixalius.audit".
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "std": {"format": "{asctime} {levelname} {name} {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "std"},
        "app_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": LOG_DIR / "app.log",
            "maxBytes": 10 * 1024 * 1024, "backupCount": 10,
            "encoding": "utf-8", "formatter": "std",
        },
    },
    "loggers": {
        "apps": {"handlers": ["console", "app_file"], "level": "INFO"},
        "fixalius.audit": {"handlers": ["console", "app_file"], "level": "INFO", "propagate": False},
        "django.request": {"handlers": ["console", "app_file"], "level": "ERROR", "propagate": True},
    },
}
