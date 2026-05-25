# Critical Path Keywords

Default keyword list used by the skill to auto-detect critical paths. Findings inside files/directories matching these keywords have their severity boosted by one level.

## Default keywords

### English (case-insensitive)

**Money / payment**
- `payment`, `billing`, `charge`, `invoice`, `subscription`, `refund`, `payout`

**Auth / identity**
- `auth`, `login`, `signup`, `signin`, `oauth`, `sso`, `session`, `token`, `password`, `reset`, `verify`, `otp`, `2fa`, `mfa`

**Commerce**
- `checkout`, `order`, `cart`, `purchase`, `transaction`

**Financial**
- `transfer`, `wallet`, `withdraw`, `deposit`, `balance`

### Vietnamese (case-insensitive, snake_case + kebab-case)

- `thanh_toan`, `thanh-toan` (payment)
- `dang_nhap`, `dang-nhap` (login)
- `dat_hang`, `dat-hang` (order)
- `mat_khau`, `mat-khau` (password)
- `xac_thuc`, `xac-thuc` (verify / authenticate)
- `kich_hoat`, `kich-hoat` (activate)
- `giao_dich`, `giao-dich` (transaction)
- `vi_dien_tu`, `vi-dien-tu` (wallet)

## Matching rule

Skill matches against directory + file path components (not contents). Examples:

- `src/payment/charge.ts` → MATCH (`payment` in path)
- `src/api/users/payment-history.ts` → MATCH (`payment` in filename)
- `src/utils/format-currency.ts` → NO MATCH
- `src/components/PaymentForm.tsx` → MATCH (`Payment` case-insensitive)

## User override

Users can add or remove keywords in `error-audit.config.yaml`:

```yaml
critical_path_keywords:
  add:
    - vault
    - secret
  remove:
    - subscription  # we audit subscription separately
```

Or replace the whole list with explicit paths:

```yaml
critical_paths:
  - src/payment/**
  - src/auth/**
  - src/admin/**
critical_path_keywords:
  replace: true  # ignore defaults, use only paths above
```
