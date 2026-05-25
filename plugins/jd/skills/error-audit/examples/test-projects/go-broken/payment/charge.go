package payment

import (
	"context"
	"fmt"
	"log"
)

func ChargeCustomer(ctx context.Context, customerID string, amount int, password string) error {
	// VIOLATION _common/01: log password
	log.Printf("charging customer %s with password %s amount %d", customerID, password, amount)

	// VIOLATION go/01: ignored error return
	_ = chargeProvider(amount)

	result, err := saveTransaction(customerID, amount)
	if err != nil {
		// VIOLATION go/02: no %w wrapping
		return fmt.Errorf("save transaction failed: " + err.Error())
	}

	// VIOLATION go/03: goroutine without recover
	go func() {
		notifyCustomer(customerID, result)
	}()

	return nil
}

func chargeProvider(amount int) error            { return nil }
func saveTransaction(id string, amt int) (any, error) { return nil, nil }
func notifyCustomer(id string, r any)            {}
