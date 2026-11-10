@echo off
cd /d "%~dp0"
echo Criando atalho na inicializacao do Windows...
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\digoo-print-server.lnk'); $s.TargetPath='%~dp0iniciar.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
echo Desativando suspensao do PC na tomada...
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
echo.
echo Pronto. O servidor vai iniciar sozinho quando o Windows ligar.
echo Iniciando agora...
start "" "%~dp0iniciar.bat"
timeout /t 5
