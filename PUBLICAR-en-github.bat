@echo off
setlocal
title Publicar Atlas America 3D en GitHub Pages
echo ============================================================
echo   Publicando Atlas America 3D en GitHub Pages
echo   (usa tu gh ya autenticado como martinviretti)
echo ============================================================
echo.

set "SRC=%~dp0Atlas-America-3D-ACTUALIZADO.html"
if not exist "%SRC%" (
  echo ERROR: no se encontro "%SRC%"
  pause & exit /b 1
)

cd /d "%USERPROFILE%\Downloads"
if exist atlas-deploy rmdir /s /q atlas-deploy
mkdir atlas-deploy
cd atlas-deploy
copy /y "%SRC%" index.html >nul

git init -b main
git add index.html
git -c user.name="Martin Viretti" -c user.email="martinviretti@users.noreply.github.com" commit -m "Atlas America 3D - globo satelital educativo"

echo.
echo --- Creando repo publico y subiendo ---
gh repo create atlas-america-3d --public --source=. --push
if errorlevel 1 (
  echo.
  echo Si dice que el repo ya existe, borralo en github.com o cambia el nombre en este .bat
  pause & exit /b 1
)

echo.
echo --- Activando GitHub Pages ---
gh api -X POST repos/martinviretti/atlas-america-3d/pages -f "source[branch]=main" -f "source[path]=/" 2>nul

echo.
echo ============================================================
echo   LISTO. En 1-2 minutos estara disponible en:
echo.
echo     https://martinviretti.github.io/atlas-america-3d/
echo.
echo   (Compartis ESE link. Necesita internet para el satelite.)
echo ============================================================
echo.
pause
