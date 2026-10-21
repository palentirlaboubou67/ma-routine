@echo off
rem Lance "Ma routine" dans le navigateur.
rem Garder toujours le meme port : les donnees sont liees a cette adresse.
cd /d "%~dp0"
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://localhost:5317/'"
echo Ma routine tourne sur http://localhost:5317/
echo Laisse cette fenetre ouverte pendant l'utilisation (ou installe l'app depuis le navigateur).
python -m http.server 5317 --bind 127.0.0.1
if errorlevel 1 (
  echo.
  echo Impossible de demarrer le serveur. Verifie que Python est installe,
  echo ou que l'application n'est pas deja ouverte dans une autre fenetre.
  pause
)
