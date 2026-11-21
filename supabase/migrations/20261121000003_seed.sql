-- Al Dawri — starter data (Kuwait). Pitches without an owner until a pitch owner claims them.
insert into public.pitches (name_ar, name_en, area_ar, area_en, address_ar, address_en, governorate, price_per_hour, sizes, surface, indoor, amenities, open_from, open_to, lat, lng, rating, reviews, tint) values
  ('ملعب النخبة', 'Elite Arena', 'السالمية', 'Salmiya', 'شارع البلاجات، قطعة 12', 'Gulf Road, Block 12', 'hawalli', 20, '{5,7}', 'artificial', false, '{parking,showers,lights,cafe,changing,balls}', 14, 24, 29.3339, 48.0761, 4.8, 214, '{#0B2E6F,#1E56B3}'),
  ('ملعب الفريج', 'Freej Pitch', 'حولي', 'Hawalli', 'شارع تونس، قطعة 3', 'Tunis St, Block 3', 'hawalli', 15, '{5}', 'artificial', false, '{lights,changing,balls}', 15, 24, 29.3375, 48.0286, 4.5, 132, '{#0E4D7A,#2A86C4}'),
  ('القبة الخضراء', 'Green Dome', 'مشرف', 'Mishref', 'طريق الملك فهد، بجانب أرض المعارض', 'King Fahad Rd, by the Fairground', 'hawalli', 30, '{5,7}', 'artificial', true, '{parking,showers,lights,cafe,changing,balls,wifi,ac}', 10, 24, 29.2747, 48.0658, 4.9, 341, '{#0F5F5C,#1E9B8F}'),
  ('ملاعب الأبطال', 'Champions Fields', 'الجابرية', 'Jabriya', 'شارع 101، قطعة 11', 'Street 101, Block 11', 'hawalli', 45, '{7,11}', 'natural', false, '{parking,showers,lights,changing}', 8, 23, 29.3172, 48.0306, 4.7, 98, '{#2B3A55,#55698C}'),
  ('كورة سيتي', 'Kora City', 'الجهراء', 'Jahra', 'طريق الجهراء، قطعة 5', 'Jahra Rd, Block 5', 'jahra', 12, '{5}', 'artificial', false, '{lights,cafe}', 16, 24, 29.3375, 47.6581, 4.3, 76, '{#3A2F7A,#6457C2}'),
  ('ملعب الواجهة', 'Waterfront Pitch', 'الشويخ', 'Shuwaikh', 'الشويخ الصناعية، شارع 24', 'Shuwaikh Industrial, Street 24', 'capital', 35, '{5,7}', 'artificial', false, '{parking,lights,changing,cafe}', 12, 24, 29.3436, 47.9389, 4.6, 158, '{#0B4466,#2E7FAE}');

with t as (
  insert into public.tournaments (name_ar, name_en, pitch_id, format, status, starts_on, max_teams, entry_fee, prize, tint)
  values
    ('دوري ليالي الشتاء', 'Winter Nights League', (select id from public.pitches where name_en = 'Elite Arena'), 5, 'live', current_date - 6, 8, 60, 500, '{#0B2E6F,#04132F}'),
    ('كأس المناطق', 'Areas Cup', (select id from public.pitches where name_en = 'Green Dome'), 7, 'open', current_date + 9, 12, 80, 750, '{#1E56B3,#071E4B}'),
    ('بطولة الربيع', 'Spring Classic', (select id from public.pitches where name_en = 'Champions Fields'), 11, 'finished', current_date - 40, 4, 150, 1200, '{#3B4A66,#151E30}')
  returning id, name_en
)
insert into public.tournament_teams (tournament_id, name_ar, name_en, color, played, won, drawn, lost, gf, ga)
select t.id, v.name_ar, v.name_en, v.color, v.played, v.won, v.drawn, v.played - v.won - v.drawn, v.gf, v.ga
from t join (values
  ('Winter Nights League', 'الصقور', 'Falcons', '#0B6E4F', 3, 3, 0, 14, 4),
  ('Winter Nights League', 'النمور', 'Tigers', '#E65100', 3, 2, 0, 10, 6),
  ('Winter Nights League', 'العاصفة', 'Storm', '#1D4E89', 3, 1, 1, 7, 7),
  ('Winter Nights League', 'الفرسان', 'Knights', '#6A1B9A', 3, 1, 1, 6, 8),
  ('Winter Nights League', 'الأسود', 'Lions', '#C2185B', 3, 1, 0, 5, 9),
  ('Winter Nights League', 'البرق', 'Lightning', '#00838F', 3, 0, 0, 3, 11),
  ('Areas Cup', 'شباب السالمية', 'Salmiya Youth', '#1D4E89', 0, 0, 0, 0, 0),
  ('Areas Cup', 'نجوم الجهراء', 'Jahra Stars', '#E65100', 0, 0, 0, 0, 0),
  ('Areas Cup', 'الكتيبة', 'The Squad', '#2E7D32', 0, 0, 0, 0, 0),
  ('Areas Cup', 'عيال الفريج', 'Freej Boys', '#AD1457', 0, 0, 0, 0, 0),
  ('Areas Cup', 'الأحرار', 'Free Kicks', '#283593', 0, 0, 0, 0, 0),
  ('Spring Classic', 'الصاعقة', 'Thunder', '#5D4037', 3, 3, 0, 9, 2),
  ('Spring Classic', 'الحرس', 'Guardians', '#00695C', 3, 1, 1, 5, 5),
  ('Spring Classic', 'الأمواج', 'Waves', '#1565C0', 3, 1, 0, 4, 6),
  ('Spring Classic', 'النسور', 'Eagles', '#BF360C', 3, 0, 1, 2, 7)
) as v(tname, name_ar, name_en, color, played, won, drawn, gf, ga) on v.tname = t.name_en;

insert into public.fixtures (tournament_id, home_id, away_id, starts_at, home_score, away_score)
select tt.tournament_id, h.id, a.id, (current_date + f.day_off)::timestamp at time zone 'Asia/Kuwait' + make_interval(hours => f.hour), f.hs, f.aws
from (values
  ('Falcons', 'Tigers', -3, 21, 3, 1), ('Storm', 'Knights', -3, 22, 2, 2), ('Lions', 'Lightning', -2, 21, 2, 1),
  ('Falcons', 'Storm', 1, 21, null, null), ('Tigers', 'Lions', 1, 22, null, null), ('Knights', 'Lightning', 2, 21, null, null),
  ('Thunder', 'Guardians', -40, 18, 3, 1), ('Waves', 'Eagles', -40, 20, 2, 1), ('Thunder', 'Waves', -33, 19, 4, 0)
) as f(home, away, day_off, hour, hs, aws)
join public.tournament_teams h on h.name_en = f.home
join public.tournament_teams a on a.name_en = f.away and a.tournament_id = h.tournament_id
join public.tournament_teams tt on tt.id = h.id;
