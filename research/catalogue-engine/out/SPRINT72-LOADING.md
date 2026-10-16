# Do not load these payloads separately

`sprint72-fast-batch/` (494 pins) and `oe-pass-2026-10-16/` (730 pins) overlap by 124 pins (union 1,100; none overlap the loaded pilot).
Loading both would create duplicate candidates across runs. After the live-catalogue dedupe (#337), one reconciled payload
(`sprint72-reconciled/`) replaces both, with live duplicates removed or held. Load only that one.
