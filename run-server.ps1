Get-Content .env | Where-Object { $_ -notmatch '^\s*#' -and $_.Trim() -ne '' } | ForEach-Object {
    $line = $_.TrimEnd("`r")
    $idx = $line.IndexOf('=')
    if ($idx -gt 0) {
        $key = $line.Substring(0, $idx)
        $val = $line.Substring($idx + 1)
        [System.Environment]::SetEnvironmentVariable($key, $val, 'Process')
    }
}
go run ./apps/server_core/cmd/server
