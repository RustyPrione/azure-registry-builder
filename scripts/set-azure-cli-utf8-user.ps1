# Run once in PowerShell (as your user — no admin required) to fix Azure CLI
# UnicodeEncodeError / 'charmap' when streaming `az acr build` logs on Windows.
# Restart terminals and Cursor/VS Code after running.

$names = @(
    @{ Name = "PYTHONUTF8"; Value = "1" },
    @{ Name = "PYTHONIOENCODING"; Value = "utf-8" },
    @{ Name = "AZURE_CORE_NO_COLOR"; Value = "true" },
    @{ Name = "NO_COLOR"; Value = "1" }
)

foreach ($item in $names) {
    [Environment]::SetEnvironmentVariable($item.Name, $item.Value, "User")
    Write-Host "Set User env: $($item.Name)=$($item.Value)"
}

Write-Host ""
Write-Host "Done. Open a NEW terminal (or reboot apps) so Azure CLI picks this up."
Write-Host "Optional: run 'chcp 65001' in cmd for UTF-8 code page in that session."
