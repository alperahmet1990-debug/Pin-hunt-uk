---
name: Supabase direct DB access
description: How to connect psql to the PinHunt Supabase DB for applying migrations.
---
Use the session pooler: `postgresql://postgres.<project-ref>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres` with PGPASSWORD=$SUPABASE_DB_PASSWORD. Region is eu-west-1 (NOT eu-west-2, despite the UK app). Direct `db.<ref>.supabase.co` DNS does not resolve from this workspace. If auth fails, the password was likely rotated — re-request SUPABASE_DB_PASSWORD from the user.
All migrations through 012 applied as of 2026-07-25.
