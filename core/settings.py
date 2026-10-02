from pathlib import Path

from django.utils.translation import gettext_lazy as _
from decouple import config as decouple_config

BASE_DIR = Path(__file__).resolve().parent.parent
MEDIA_URL  = "/media/"
MEDIA_ROOT = BASE_DIR / "media"




# === SEGURIDAD (en producción, todas desde .env) ===
SECRET_KEY = decouple_config(
    'SECRET_KEY',
    default='django-insecure-1!4jt_d4d*+d!0$-o#lnesupgbugn&bo8kid6layt%^_%3b7rw',
)
DEBUG = decouple_config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = decouple_config(
    'ALLOWED_HOSTS', default='127.0.0.1,localhost', cast=lambda v: [h.strip() for h in v.split(',')]
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

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
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

# === AUTENTICACIÓN ===
AUTHENTICATION_BACKENDS = [
    'apps.authentication.backends.EmailOrUsernameBackend',
]

LOGIN_URL = '/accounts/login/'
LOGIN_REDIRECT_URL = '/menu/'          # ← antes /dashboard/
LOGOUT_REDIRECT_URL = '/'              # ← antes /accounts/login/


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
# Login con nombre de usuario O correo electrónico
AUTHENTICATION_BACKENDS = [
    'apps.authentication.backends.EmailOrUsernameBackend',
]

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

# === ESTÁTICOS ===
STATIC_URL = 'static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# === EMAIL ===
# En desarrollo, los correos se imprimen en la consola.
# En producción, configurar SMTP real.
EMAIL_BACKEND = decouple_config(
    'EMAIL_BACKEND',
    default='django.core.mail.backends.console.EmailBackend',
)
DEFAULT_FROM_EMAIL = decouple_config('DEFAULT_FROM_EMAIL', default='no-reply@fixalius.com')
SERVER_EMAIL = DEFAULT_FROM_EMAIL
