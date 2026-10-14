# Routine: catalogue-research (PROPOSED — not created, not scheduled)

**Activation (maintainer only):**
1. Approve the role in `docs/agents/proposed/catalogue-researcher.md`.
2. Allow the research hosts in the cloud environment's network settings.
3. Create the routine **paused**.
4. Run it on demand for the pilot.
5. Only then add a schedule. Suggested: weekly, Tuesday 18:00 UK, after US Pin Tuesday news.

**Environment:**
- The agents' cloud environment (`PINHUNT_AGENT=1`). The guard hook stays on.
- **No Supabase or API secrets.** The agent never needs them.
- **Network allowlist:**
  - disneystore.com, disneystore.co.uk, disneystore.eu, disneystore.asia, disneystore.com.au
  - disneyparks.disney.go.com, disneyworld.disney.go.com, disneyland.disney.go.com, disneylandparis.com
  - wdwnt.com, laughingplace.com, dlpreport.com, ed92.org, wdwinfo.com, allears.net, disneypinsblog.com

**Prompt:**

```
You are Basil (Catalogue Research). Read docs/agents/proposed/catalogue-researcher.md
(or .claude/agents/catalogue-researcher.md once activated), CLAUDE.md and
docs/agents/OPERATING-MODEL.md. Stop without changes if .agents/PAUSE exists on main or
an open draft PR already exists on a claude/catalogue-research-* branch.

Brief: research Disney pin releases first sold between {{from_date}} and {{to_date}}
(Disney Parks US, Disney Store US/UK/EU, Disneyland Paris). Prioritise closed sets
(mystery checklists, monthly LE series). Search budget: 60 searches, 30 page reads.

Follow the Run section of your role file exactly. Output: one draft PR with packets,
engine outputs and the run report. Never import, never contact Supabase, never cite
Pin & Pop / PinPics / PinTradingDB, never invent pins or values.
```
