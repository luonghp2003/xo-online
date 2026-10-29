@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Hay cai Node.js 18 tro len truoc.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Dang cai thu vien...
  call npm install
  if errorlevel 1 exit /b 1
)
echo Mo game tai http://localhost:3000
call npm start
