# Tap to Pay Crash Capture Script
# Run this before reproducing the crash

Write-Host "Clearing logcat..."
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" logcat -c

Write-Host "Logcat cleared. Now reproduce the crash."
Write-Host ""
Write-Host "After the crash, run:"
Write-Host "& `"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`" logcat -d | Select-String `"FATAL EXCEPTION|AndroidRuntime|ReplyflowStripeTerminal|StripeTerminal|Capacitor|com.replyflow`""
Write-Host ""
Write-Host "Or for live monitoring:"
Write-Host "& `"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`" logcat | Select-String `"FATAL EXCEPTION|AndroidRuntime|ReplyflowStripeTerminal|StripeTerminal|TTP Hook|Capacitor/Console`""