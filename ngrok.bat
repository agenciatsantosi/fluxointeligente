@echo off
title NGROK
cd /d %~dp0

ngrok http 5175

pause