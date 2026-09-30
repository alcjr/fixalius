@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================================
:: licencia_gen.bat
:: Ejecuta y valida "python manage.py crear_licencia" de FINGEST.
::
:: Uso (parametros posicionales, todos opcionales):
::   licencia_gen.bat "Titular Nombre" "email@ejemplo.com" admin_username [n_inmuebles] [estado]
::
:: Si se omite un parametro, se pide por consola. Flujo:
::   1) Valida con --dry-run (incluye comprobar que el admin
::      existe y es staff).
::   2) Si la validacion es correcta, pide confirmacion.
::   3) Solo entonces ejecuta la creacion real.
:: ============================================================

set "PROJECT_DIR=C:\00_projects\fingest"
set "VENV_ACTIVATE=%PROJECT_DIR%\venv\Scripts\activate.bat"

:: --- Parametros ---
set "TITULAR_NOMBRE=%~1"
set "TITULAR_EMAIL=%~2"
set "ADMIN_USERNAME=%~3"
set "N_INMUEBLES=%~4"
set "ESTADO=%~5"

if "%TITULAR_NOMBRE%"=="" set /p TITULAR_NOMBRE=Nombre del titular: 
if "%TITULAR_EMAIL%"=="" set /p TITULAR_EMAIL=Email del titular: 
if "%ADMIN_USERNAME%"=="" set /p ADMIN_USERNAME=Username del admin (staff): 
if "%N_INMUEBLES%"=="" set "N_INMUEBLES=0"
if "%ESTADO%"=="" set "ESTADO=demo"

if /i not "%ESTADO%"=="demo" if /i not "%ESTADO%"=="activa" (
    echo [ERROR] --estado debe ser "demo" o "activa" ^(recibido: %ESTADO%^)
    goto :fin_error
)

echo.
echo ================= Resumen =================
echo Titular:    %TITULAR_NOMBRE% ^<%TITULAR_EMAIL%^>
echo Admin:      %ADMIN_USERNAME%
echo Inmuebles:  %N_INMUEBLES%
echo Estado:     %ESTADO%
echo =============================================
echo.

if not exist "%PROJECT_DIR%\manage.py" (
    echo [ERROR] No se encuentra manage.py en %PROJECT_DIR%
    goto :fin_error
)
cd /d "%PROJECT_DIR%"

if not exist "%VENV_ACTIVATE%" (
    echo [ERROR] No se encuentra el entorno virtual en %VENV_ACTIVATE%
    goto :fin_error
)
call "%VENV_ACTIVATE%"
if errorlevel 1 (
    echo [ERROR] No se pudo activar el entorno virtual.
    goto :fin_error
)

echo.
echo --- Paso 1/2: validacion (--dry-run) ---
echo.
python manage.py crear_licencia --dry-run ^
    --titular-nombre "%TITULAR_NOMBRE%" ^
    --titular-email "%TITULAR_EMAIL%" ^
    --admin-username "%ADMIN_USERNAME%" ^
    --n-inmuebles %N_INMUEBLES% ^
    --estado %ESTADO%

if errorlevel 1 (
    echo.
    echo [ERROR] La validacion --dry-run fallo. Revisa el mensaje anterior.
    echo         No se ha creado nada.
    goto :fin_error
)

echo.
set /p CONFIRMAR=Validacion OK. Crear la licencia de verdad? [S/N]: 
if /i not "%CONFIRMAR%"=="S" (
    echo.
    echo Cancelado por el usuario. No se ha creado nada.
    goto :fin_ok
)

echo.
echo --- Paso 2/2: ejecucion real ---
echo.
python manage.py crear_licencia ^
    --titular-nombre "%TITULAR_NOMBRE%" ^
    --titular-email "%TITULAR_EMAIL%" ^
    --admin-username "%ADMIN_USERNAME%" ^
    --n-inmuebles %N_INMUEBLES% ^
    --estado %ESTADO%

if errorlevel 1 (
    echo.
    echo [ERROR] crear_licencia fallo en la ejecucion real. Revisa el mensaje anterior.
    echo         Si fallo al clonar la BBDD, el propio comando ya revierte
    echo         los registros de Licencia/BBDD ^(no deberia quedar nada a medias^).
    goto :fin_error
)

echo.
echo [OK] Licencia creada correctamente.
goto :fin_ok

:fin_error
echo.
echo Proceso finalizado CON ERRORES.
endlocal
exit /b 1

:fin_ok
echo.
echo Proceso finalizado.
endlocal
exit /b 0
