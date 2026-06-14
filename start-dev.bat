@echo off
cd /d "%~dp0"
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1
