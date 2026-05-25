# Expected Findings - go-broken

## Critical (1)
1. `_common/01-logging-sensitive-data` at `payment/charge.go:11` - `password` in `log.Printf`

## High (3; boosted from Medium because in critical_paths)
2. `go/01-ignored-errors` at `payment/charge.go:14` - `_ = chargeProvider(amount)` (boosted)
3. `go/03-panic-recovery` at `payment/charge.go:24` - goroutine without `defer recover()` (boosted)
4. `go/02-error-wrapping` at `payment/charge.go:20` - `fmt.Errorf` without `%w` (boosted)

## Total
- Critical: 1
- High: 3
- Medium: 0
- Low: 0
