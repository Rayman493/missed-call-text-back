-- Harden relationship integrity for V1 launch
-- Align payment_requests.requested_by nullability with its ON DELETE SET NULL foreign key action.
ALTER TABLE payment_requests
ALTER COLUMN requested_by DROP NOT NULL;
