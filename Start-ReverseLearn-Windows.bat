@echo off
title ReverseLearn - keep this window open while you use the app
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo  Node.js is not installed yet - it is the free engine ReverseLearn runs on.
  echo  I will open the download page. Install the LTS version with the
  echo  normal installer ^(just keep clicking Next^), then double-click this file again.
  echo.
  start https://nodejs.org/en/download
  pause
  exit /b
)
if not exist node_modules (
  echo First run only: installing ReverseLearn - this can take a few minutes...
  call npm install
)
if not exist .next\BUILD_ID (
  echo First run only: preparing the app...
  call npm run build
)
echo.
echo  Starting ReverseLearn at http://localhost:3000
echo  Keep this window open. To stop the app, close this window.
echo.
start "" /min cmd /c "timeout /t 5 >nul & start http://localhost:3000"
call npm run start -- -p 3000
pause
