@echo off
title NGROK
cd /d %~dp0

ngrok http 3001

pause