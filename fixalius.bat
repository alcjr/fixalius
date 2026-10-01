@echo off
chcp 65001 >nul
title FIXALIUS - Servidor Local Django (puerto 8000)

echo ===============================================
echo    Iniciando FIXALIUS - Servidor Local Django
echo ===============================================
echo.

:: Ir a la carpeta donde esta ESTE .bat (debe ser la raiz del proyecto,
:: la que contiene manage.py y la carpeta core).
cd /d "%~dp0"
if errorlevel 1 (
    echo ERROR: no se puede acceder a la carpeta del script.
    pause
    exit /b 1
)

if not exist "manage.py" (
    echo ERROR: no hay manage.py en %CD%
    echo        Coloca este .bat en la raiz del proyecto FIXALIUS.
    pause
    exit /b 1
)

:: Comprobar que es el proyecto FIXALIUS (settings en core\settings.py).
if not exist "core\settings.py" (
    echo ERROR: en %CD% no existe core\settings.py
    echo        Esta carpeta no parece ser el proyecto FIXALIUS.
    pause
    exit /b 1
)

echo [1/3] Proyecto: %CD%

echo [2/3] Activando entorno virtual...
if not exist ".venv\Scripts\activate.bat" (
    echo ERROR: no se encuentra el entorno virtual en:
    echo        %CD%\.venv
    pause
    exit /b 1
)
call .venv\Scripts\activate.bat

echo [3/3] Iniciando servidor Django...
echo.
echo Servidor disponible en: http://127.0.0.1:8000
echo Presiona Ctrl + C (o Ctrl + Break) para detener.
echo.

python manage.py runserver 127.0.0.1:8000

echo.
echo El servidor se ha detenido.
pause