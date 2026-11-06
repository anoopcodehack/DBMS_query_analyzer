@echo off
title Database Query Performance Analyzer
color 0A
cls
echo =========================================================================
echo    DATABASE QUERY PERFORMANCE ANALYZER AND OPTIMIZATION SYSTEM
echo    High-Speed SQL Benchmarking & Execution Plan Analyzer
echo =========================================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking Python installation...
python --version
if errorlevel 1 (
    echo [ERROR] Python is not found in PATH! Please install Python 3.x.
    pause
    exit /b 1
)

echo.
echo [2/3] Checking dependencies...
pip install -r requirements.txt --quiet

echo.
echo [3/3] Starting Database Query Performance Analyzer Web Server...
echo Application will be available at: http://localhost:5000
echo Press Ctrl+C to stop the server.
echo.
python app.py
pause
