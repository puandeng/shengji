@echo off
:: ─────────────────────────────────────────────────────────────
:: 200 Card Game — startup script (Windows)
:: Double-click this file or run it from Command Prompt
:: ─────────────────────────────────────────────────────────────

title 200 Card Game

echo.
echo   ^<^<  200 Card Game  ^>^>
echo ────────────────────────────────────────
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found.
    echo         Download it from https://nodejs.org ^(v18+^)
    pause
    exit /b 1
)

echo [OK] Node.js found

:: Install server deps if needed
if not exist "server\node_modules" (
    echo [INFO] Installing server dependencies...
    cd server
    call npm install
    cd ..
)

:: Install client deps if needed
if not exist "client\node_modules" (
    echo [INFO] Installing client dependencies...
    cd client
    call npm install
    cd ..
)

echo.
echo [START] Launching server on http://localhost:3001
echo [START] Launching client on http://localhost:5173
echo.
echo  Open your browser at: http://localhost:5173
echo  Close this window to stop both servers.
echo ────────────────────────────────────────
echo.

:: Start server in a new window
start "200 Game - Server" cmd /k "cd server && npm run dev"

:: Start client in a new window
start "200 Game - Client" cmd /k "cd client && npm run dev"

:: Open browser after a short delay
timeout /t 4 /nobreak >nul
start http://localhost:5173

echo Both servers are running in separate windows.
pause
