# Historical catalogue backfill ledger (2015–2026)

_Maintained by the hourly research routine (scheduled task "PinHunt historical backfill"). Rules: `research/catalogue-engine/BACKFILL-RULES.md`. Workbook: `PinHunt_catalogue_2015_2026.xlsx` (regenerated each round)._

## Active round
Round 1, started 2026-10-16 11:30 UTC: B001–B006 (2019)

## Totals (after the last round)
Reconciled baseline, 16 Oct 2026, before any backfill round was processed. Live data comes from the committed fingerprint baseline (`BASELINE.md`).

- **Live public pins with a 2015–2026 release year: 1,798.** All live rows: 15,978, made up of:
  - 2,978 public: 1,798 from 2015–2026, 1,146 before 2015, 34 with no year;
  - 11,721 archived synthetic seed rows;
  - 1,097 archived legacy imports;
  - 182 archived trusted-test pins.
- **Research pin records: 2,113.** Set records are not counted.
  - Genuinely new 2015–2026: **1,894**, of which 678 are corroborated by 2+ independent publishers.
  - Held: 207 (archived-record matches, conflicts, cross-set duplicates, same pin under two resorts).
  - No usable source: 9. Already live: 0. Outside 2015–2026: 3.
- **Total unique individual pins identified 2015–2026: 3,692** (1,798 + 1,894).
  - Excludes set records, missing set slots, held records and duplicates.
  - Residual risk: about 10 near-identical rows inside the live catalogue itself, and research pins whose duplicate isn't detectable from names alone.

## Work cells (taken top-down; up to 6 per round)
| Cell | Year | Line | Scope | Status | Packet | Pins | Notes |
|---|---|---|---|---|---|---|---|
| B001 | 2019 | wdw-oe | WDW open edition (incl. standalone) | in progress | 201_b001_wdw_oe_2019.json | | |
| B002 | 2019 | wdw-le | WDW LE/LR | in progress | 202_b002_wdw_le_2019.json | | |
| B003 | 2019 | dlr-oe | Disneyland California OE | in progress | 203_b003_dlr_oe_2019.json | | |
| B004 | 2019 | dlr-le | Disneyland California LE/LR | in progress | 204_b004_dlr_le_2019.json | | |
| B005 | 2019 | dlp | Disneyland Paris (OE+LE) | in progress | 205_b005_dlp_2019.json | | |
| B006 | 2019 | ds | Disney Store UK/EU + US | in progress | 206_b006_ds_2019.json | | |
| B007 | 2019 | asia | Shanghai, Hong Kong, Tokyo | todo | | | |
| B008 | 2019 | lic | Licensed: Loungefly, BoxLunch, Hot Topic, Pink a la Mode, Artland | todo | | | |
| B009 | 2018 | wdw-oe | WDW open edition (incl. standalone) | todo | | | |
| B010 | 2018 | wdw-le | WDW LE/LR | todo | | | |
| B011 | 2018 | dlr-oe | Disneyland California OE | todo | | | |
| B012 | 2018 | dlr-le | Disneyland California LE/LR | todo | | | |
| B013 | 2018 | dlp | Disneyland Paris (OE+LE) | todo | | | |
| B014 | 2018 | ds | Disney Store UK/EU + US | todo | | | |
| B015 | 2018 | asia | Shanghai, Hong Kong, Tokyo | todo | | | |
| B016 | 2018 | lic | Licensed: Loungefly, BoxLunch, Hot Topic, Pink a la Mode, Artland | todo | | | |
| B017 | 2017 | wdw-oe | WDW open edition (incl. standalone) | todo | | | |
| B018 | 2017 | wdw-le | WDW LE/LR | todo | | | |
| B019 | 2017 | dlr-oe | Disneyland California OE | todo | | | |
| B020 | 2017 | dlr-le | Disneyland California LE/LR | todo | | | |
| B021 | 2017 | dlp | Disneyland Paris (OE+LE) | todo | | | |
| B022 | 2017 | ds | Disney Store UK/EU + US | todo | | | |
| B023 | 2017 | asia | Shanghai, Hong Kong, Tokyo | todo | | | |
| B024 | 2017 | lic | Licensed: Loungefly, BoxLunch, Hot Topic, Pink a la Mode, Artland | todo | | | |
| B025 | 2016 | wdw-oe | WDW open edition (incl. standalone) | todo | | | |
| B026 | 2016 | wdw-le | WDW LE/LR | todo | | | |
| B027 | 2016 | dlr-oe | Disneyland California OE | todo | | | |
| B028 | 2016 | dlr-le | Disneyland California LE/LR | todo | | | |
| B029 | 2016 | dlp | Disneyland Paris (OE+LE) | todo | | | |
| B030 | 2016 | ds | Disney Store UK/EU + US | todo | | | |
| B031 | 2016 | asia | Shanghai, Hong Kong, Tokyo | todo | | | |
| B032 | 2016 | lic | Licensed: Loungefly, BoxLunch, Hot Topic, Pink a la Mode, Artland | todo | | | |
| B033 | 2015 | wdw-oe | WDW open edition (incl. standalone) | todo | | | |
| B034 | 2015 | wdw-le | WDW LE/LR | todo | | | |
| B035 | 2015 | dlr-oe | Disneyland California OE | todo | | | |
| B036 | 2015 | dlr-le | Disneyland California LE/LR | todo | | | |
| B037 | 2015 | dlp | Disneyland Paris (OE+LE) | todo | | | |
| B038 | 2015 | ds | Disney Store UK/EU + US | todo | | | |
| B039 | 2015 | asia | Shanghai, Hong Kong, Tokyo | todo | | | |
| B040 | 2015 | lic | Licensed: Loungefly, BoxLunch, Hot Topic, Pink a la Mode, Artland | todo | | | |
| B041 | 2020-2026 | asia | Shanghai, Hong Kong, Tokyo | todo | | | |
| B042 | 2020-2026 | lic | Licensed retailers | todo | | | |
| B043 | 2021-2022 | ds | Disney Store UK 2021-2022 top-up | todo | | | |
| B044 | 2020-2021 | dlp | Disneyland Paris 2020-2021 top-up | todo | | | |

Status: todo → in progress → done / partial (budget ran out; a follow-up cell is appended) / blocked (source restriction or validation failure, flagged to the maintainer).

## Round log
| Round | Started (UTC) | Cells | New pins | Notes |
|---|---|---|---|---|
| 1 | 2026-10-16 11:30 | B001–B006 | | |
