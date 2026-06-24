@echo off
rem ============================================================
rem  Blotter - one-click launcher (Windows)
rem  Double-click to start the local server and open the app.
rem  Close this window to stop the server.
rem ============================================================
setlocal
cd /d "%~dp0"

if not exist "node_modules" goto :install
goto :checkbuild

:install
echo Installing dependencies - first run only, one time...
call npm install
if errorlevel 1 goto :fail

:checkbuild
if not exist "web\dist\index.html" goto :build
goto :run

:build
echo Building the app - first run only, one time...
call npm run build
if errorlevel 1 goto :fail

:run
echo.
echo   Blotter starting at http://localhost:5173
echo   Close this window to stop the server.
echo.
start "" "http://localhost:5173"
node server\index.js
goto :end

:fail
echo.
echo   Setup failed - see the messages above.
pause
exit /b 1

:end
endlocal
