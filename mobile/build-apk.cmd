@echo off
cd /d "%~dp0"
C:\flutter\bin\flutter.bat build apk --release > build-apk.log 2>&1
