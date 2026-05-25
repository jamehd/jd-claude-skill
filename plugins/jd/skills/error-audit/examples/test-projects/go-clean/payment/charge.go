package payment

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"runtime/debug"
)

var ErrChargeFailed = errors.New("charge failed")

func ChargeCustomer(ctx context.Context, customerID string, amount int) error {
	slog.Info("payment.charge.attempt",
		slog.String("customer_id", customerID),
		slog.Int("amount", amount),
	)

	if err := chargeProvider(amount); err != nil {
		return fmt.Errorf("charge customer %s: %w", customerID, err)
	}

	result, err := saveTransaction(customerID, amount)
	if err != nil {
		return fmt.Errorf("save transaction for %s: %w", customerID, err)
	}

	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("notify.panic",
					slog.Any("recover", r),
					slog.String("stack", string(debug.Stack())),
				)
			}
		}()
		notifyCustomer(customerID, result)
	}()

	return nil
}

func chargeProvider(amount int) error                 { return nil }
func saveTransaction(id string, amt int) (any, error) { return nil, nil }
func notifyCustomer(id string, r any)                 {}
