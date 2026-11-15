-- ============================================================
-- Optional seed for migration 081 (#613): the events built into the app
-- (artifacts/pinhunt/mock-data/events.ts as of this PR), so Home doesn't
-- lose its curated events when the app switches to the events table.
--
-- Run once, by hand, in the SQL editor after 081 (staging first). Only
-- events that haven't ended are added, published. Safe to run twice: an
-- event with the same title and start date is skipped.
-- Undo: delete from public.events where created_by is null;
--       (seeded rows are the only ones without an author; events added in
--       the app always have one). Or delete them in the app: Admin → Events.
-- ============================================================

insert into public.events
  (title, description, event_date, end_date, time_text, location, country,
   event_type, badge_label, source_name, source_url, featured, rumour, when_text, published)
select v.*, true
from (values
  ('Disney Pin Trading Day', 'A pin trading day at Get Ready Comics: 1-for-1 swaps, official pins only.', date '2026-10-18', null::date, null, 'Rochester', 'UK', 'Community Trading Event', 'UK TRADING', 'Get Ready Comics', 'https://getreadycomics.com/pin-trading-days-are-back-at-get-ready-comics/', false, false, null),
  ('Disney Store Pin Trading Event', 'A ticketed pin trading morning at the Disney Store in Selfridges, Trafford Centre. Tickets £25, released 21 October via Disney Store.', date '2026-11-13', null::date, '7am–9:45am', 'Trafford Centre, Manchester', 'UK', 'Store Pin Trading Event', 'UK EVENT', 'Riding the Magic', 'https://ridingthemagic.uk/news/disney-store-pin-events-trafford-centre-london-stores-november-2026', false, false, null),
  ('StewPins Pin Trading Weekend', 'A two-day pin trading weekend in Milton Keynes, run by StewPins.', date '2026-11-14', date '2026-11-15', null, 'Milton Keynes', 'UK', 'Pin Trading Weekend', 'UK EVENT', 'StewPins', null, false, false, null),
  ('Disney Pin Buy & Trade Extravaganza', 'An afternoon of buying, selling and trading Disney pins with Titan Pops, at the Stockroom, Merseyway.', date '2026-11-15', null::date, '1pm–4pm', 'Stockport', 'UK', 'Community Trading Event', 'UK TRADING', 'Titan Pops / Eventbrite', 'https://www.eventbrite.co.uk/e/titan-pops-disney-pin-buy-trade-extravaganza-tickets-1991917571076', false, false, null),
  ('Disney Store Pin Trading Event', 'A ticketed evening of pin trading at the Oxford Street Disney Store. Tickets £25, released 21 October via Disney Store.', date '2026-11-25', null::date, '3pm–10pm', 'Oxford Street, London', 'UK', 'Store Pin Trading Event', 'UK EVENT', 'Riding the Magic', 'https://ridingthemagic.uk/news/disney-store-pin-events-trafford-centre-london-stores-november-2026', false, false, null),
  ('Disney Pin Trading Day', 'A pin trading day at Get Ready Comics: 1-for-1 swaps, official pins only.', date '2026-11-29', null::date, null, 'Rochester', 'UK', 'Community Trading Event', 'UK TRADING', 'Get Ready Comics', 'https://getreadycomics.com/pin-trading-days-are-back-at-get-ready-comics/', false, false, null),
  ('Pingle Bell Ball', 'Pinsane''s Christmas pin trading weekend with dinner and dance. Expected in December; date and venue not announced yet.', date '2026-12-01', date '2026-12-31', null, 'London', 'UK', 'Pin Trading Weekend', 'TBA', 'Disney and Days Out', 'https://disneyanddaysout.co.uk/uk-pin-trading-events-2026', false, true, 'December · date TBC'),
  ('Disneyland Paris Pin Trading Night', 'Disneyland Paris holds pin trading events through the year. The next date has not been announced yet.', date '2026-10-17', date '2027-03-31', null, 'Disneyland Paris', 'France', 'Official Pin Trading Event', 'TBA', 'Disneyland Paris', 'https://www.disneylandparis.com/en-gb/events/disneyland-paris-pin-trading', false, true, 'Next date TBC'),
  ('Disney Pin Trading Day', 'Get Ready Comics expects its pin trading days to resume at the end of January 2027.', date '2027-01-25', date '2027-02-28', null, 'Rochester', 'UK', 'Community Trading Event', 'TBA', 'Get Ready Comics', 'https://getreadycomics.com/pin-trading/', false, true, 'Late January · TBC')
) as v(title, description, event_date, end_date, time_text, location, country,
       event_type, badge_label, source_name, source_url, featured, rumour, when_text)
where coalesce(v.end_date, v.event_date) >= current_date
  and not exists (
    select 1 from public.events e where e.title = v.title and e.event_date = v.event_date
  );

select count(*) as published_events from public.events where published;
