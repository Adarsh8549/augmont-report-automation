@echo off
title Augmont Report Server  (keep this window open)
cd /d "D:\Download\augmont-claude-code\webapp"
echo ============================================================
echo   AUGMONT REPORT SERVER
echo   Keep this window OPEN. The app runs at http://localhost:3000
echo   Close this window to stop the server.
echo ============================================================
echo.
"C:\Program Files\nodejs\node.exe" server.js
echo.
echo Server stopped. Press any key to close.
pause >nul
