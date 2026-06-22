function ConvertTo-BellFieldRedactedText {
  param([AllowNull()][object]$Value)

  if ($null -eq $Value) {
    return $null
  }

  $text = [string]$Value

  # Evidence bundles are shareable, so generic token/password forms are
  # intentionally over-redacted even when a particular occurrence is benign.
  $text = [regex]::Replace(
    $text,
    '(?i)(BellField first-owner setup token:\s*)[A-Za-z0-9_-]+',
    '$1[REDACTED]'
  )
  $text = [regex]::Replace(
    $text,
    '(?i)\b(?:postgresql|postgres)://[^\s''"`]+',
    'postgresql://[REDACTED]'
  )
  $text = [regex]::Replace(
    $text,
    '(?i)\b(DATABASE_URL|BELLFIELD_RELAY_TOKEN|BELLFIELD_MEDIA_TOKEN_SECRET|PGPASSWORD)\b(\s*[:=]\s*)("[^"]*"|''[^'']*''|[^\s''"`;,]+)',
    '$1$2[REDACTED]'
  )
  $text = [regex]::Replace(
    $text,
    '(?i)\b(password\s*=\s*)("[^"]*"|''[^'']*''|[^\s''"`;,]+)',
    '$1[REDACTED]'
  )
  $text = [regex]::Replace(
    $text,
    '(?i)("?(?:setupToken|sessionToken|password|databaseUrl|relayToken|mediaTokenSecret)"?\s*:\s*)("[^"]*"|''[^'']*''|[^\s,}]+)',
    '$1"[REDACTED]"'
  )
  $text = [regex]::Replace(
    $text,
    '(?i)\bbfrt1_[A-Za-z0-9._-]+',
    'bfrt1_[REDACTED]'
  )
  $text = [regex]::Replace(
    $text,
    '(?i)\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}',
    '$1[REDACTED]'
  )
  $text = [regex]::Replace(
    $text,
    '(?is)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----',
    '[REDACTED PRIVATE KEY BLOCK]'
  )
  $text = [regex]::Replace(
    $text,
    '(?i)\b((?:token|relayToken|setupToken|sessionToken|accessToken|refreshToken)\s*[:=]\s*)("[^"]*"|''[^'']*''|[A-Za-z0-9._~+/=-]{16,})',
    '$1[REDACTED]'
  )

  return $text
}
