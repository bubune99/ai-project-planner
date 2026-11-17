-- A report on a page marks that page's checks out of date the way a ship does (planner card 8142d4c7, part 2):
-- the report is recorded in gate_ships with env 'report', so the page shows as behind until it is rescanned.
-- Rollback: ALTER TABLE gate_ships DROP CONSTRAINT gate_ships_env_check;
--           ALTER TABLE gate_ships ADD CONSTRAINT gate_ships_env_check CHECK (env IN ('production', 'staging'));
ALTER TABLE gate_ships DROP CONSTRAINT IF EXISTS gate_ships_env_check;
ALTER TABLE gate_ships ADD CONSTRAINT gate_ships_env_check CHECK (env IN ('production', 'staging', 'report'));
