-- Bãi xe Thành Dương - Supabase Schema
-- Run this in Supabase SQL Editor

-- 1. Customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  plate TEXT NOT NULL,
  vehicle TEXT DEFAULT '',
  spot TEXT DEFAULT '',
  monthly_fee INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  last_payment_date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  method TEXT DEFAULT 'Tiền mặt',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Settings table (single row per user)
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  monthly_rate INTEGER DEFAULT 0,
  total_spots INTEGER DEFAULT 30,
  reminder_days INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Row Level Security
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Customer policies
CREATE POLICY "Users can view own customers"
  ON customers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own customers"
  ON customers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own customers"
  ON customers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own customers"
  ON customers FOR DELETE
  USING (auth.uid() = user_id);

-- Payment policies
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM customers WHERE customers.id = payments.customer_id AND customers.user_id = auth.uid()));

CREATE POLICY "Users can insert payments"
  ON payments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM customers WHERE customers.id = payments.customer_id AND customers.user_id = auth.uid()));

CREATE POLICY "Users can update own payments"
  ON payments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM customers WHERE customers.id = payments.customer_id AND customers.user_id = auth.uid()));

CREATE POLICY "Users can delete own payments"
  ON payments FOR DELETE
  USING (EXISTS (SELECT 1 FROM customers WHERE customers.id = payments.customer_id AND customers.user_id = auth.uid()));

-- Settings policies
CREATE POLICY "Users can view own settings"
  ON settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON settings FOR UPDATE
  USING (auth.uid() = user_id);

-- 5. Indexes
CREATE INDEX idx_customers_user_id ON customers(user_id);
CREATE INDEX idx_customers_plate ON customers(plate);
CREATE INDEX idx_payments_customer_id ON payments(customer_id);

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;

-- Migration: add payment_date and months_covered to payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS months_covered INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
