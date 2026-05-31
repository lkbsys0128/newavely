-- Remove internal CSV import marker notes from attendance records.
-- Real operator-entered notes and excuse periods are preserved.

update attendance_records
set note = null
where note = 'Imported from 2026 annual attendance CSV';

