$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"C:\AI Project\KXSL-CRM\scripts\backup.ps1`" -Reason scheduled"
$trigger = New-ScheduledTaskTrigger -Daily -At 2:15am
Register-ScheduledTask -TaskName "KXSL CRM Daily Backup" -Action $action -Trigger $trigger -Description "Create a daily SQLite backup for KXSL CRM"
