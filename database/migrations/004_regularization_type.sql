-- Add regularization_type column
ALTER TABLE regularization
  ADD COLUMN IF NOT EXISTS regularization_type VARCHAR(30) DEFAULT 'miss_punch'
  CHECK (regularization_type IN ('miss_punch', 'client_visit', 'work_from_home'));
