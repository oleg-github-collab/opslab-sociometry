-- Clear all survey responses but keep user accounts
DELETE FROM responses;

-- Reset sequence if needed
-- ALTER SEQUENCE responses_id_seq RESTART WITH 1;
