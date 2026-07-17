@echo off
setlocal
title Actualizar Atlas America 3D en GitHub Pages
echo ============================================================
echo   Actualizando el sitio publicado (banderas reales + mejoras)
echo ============================================================
echo.

set "SRC=%~dp0Atlas-America-3D-ACTUALIZADO.html"
set "REPO=%USERPROFILE%\Downloads\atlas-deploy"

if not exist "%SRC%" ( echo ERROR: no se encontro "%SRC%" & pause & exit /b 1 )
if not exist "%REPO%\.git" (
  echo No existe el repo local en "%REPO%".
  echo Corre primero PUBLICAR-en-github.bat
  pause & exit /b 1
)

cd /d "%REPO%"
copy /y "%SRC%" index.html >nul
git add index.html
git -c user.name="Martin Viretti" -c user.email="martinviretti@users.noreply.github.com" commit -m "Banderas reales (flagcdn) + mejoras"
git push

echo.
echo ============================================================
echo   LISTO. En ~1 minuto se actualiza:
echo     https://martinviretti.github.io/atlas-america-3d/
echo ============================================================
echo.
pause
