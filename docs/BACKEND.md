# الخادم وقاعدة البيانات (Supabase)

التطبيق يشتغل بوضعين:

| الوضع | متى | البيانات |
|---|---|---|
| **تجريبي** | ما في ملف `.env` | بيانات تجريبية محفوظة على الجهاز (هذا اللي في رابط المعاينة) |
| **حقيقي** | `EXPO_PUBLIC_SUPABASE_URL` و `EXPO_PUBLIC_SUPABASE_KEY` موجودين | كل شي من قاعدة البيانات، وكل عملية تمر على الخادم |

## 1. المشروع وقاعدة البيانات

1. أنشئ مشروع في Supabase (المنطقة الأقرب للكويت: `ap-south-1` مومباي).
2. طبّق ملفات `supabase/migrations` بالترتيب:
   - `…_init.sql`: الجداول والصلاحيات (RLS). القاعدة نفسها ترفض حجزين متداخلين على نفس الملعب.
   - `…_functions.sql`: كل العمليات (حجز، إلغاء، مباريات، بطولات، لوحة صاحب الملعب). الأسعار والقواعد تنحسب على الخادم.
   - `…_seed.sql`: الملاعب والبطولات المبدئية بالكويت.
3. انسخ `.env.example` إلى `.env` وحط رابط المشروع والمفتاح (Project Settings → API → Publishable key).

## 2. تسجيل الدخول

من **Authentication → Sign In / Providers**:

- **رقم التلفون (SMS):** فعّل Phone واختار مزوّد رسائل (Twilio أو Vonage أو MessageBird) وحط بياناته. للتجربة بدون رسائل: أضف أرقام تجريبية مع كود ثابت في نفس الصفحة.
- **Google:**
  1. في Google Cloud Console أنشئ OAuth Client من نوع *Web application*.
  2. في *Authorized redirect URIs* حط: `https://<project-ref>.supabase.co/auth/v1/callback`
  3. انسخ Client ID و Client Secret إلى مزوّد Google في Supabase.
  4. في **Authentication → URL Configuration → Redirect URLs** أضف: `aldawri://auth/callback` (للجوال) ورابط موقع الويب إن وجد.
- **جرّب بدون رقم:** فعّل *Allow anonymous sign-ins* (اختياري، للتجربة فقط).

> ملاحظة لمتجر Apple: إذا التطبيق فيه دخول بـ Google، Apple يطلب يكون فيه **Sign in with Apple** بعد. نضيفه قبل النشر.

## 3. أصحاب الملاعب

صاحب الملعب يسجّل دخول عادي من التطبيق، بعدين من **SQL Editor**:

```sql
-- 1) خلّه صاحب ملعب
update public.profiles set role = 'owner'
where id = (select id from auth.users where phone = '96512345678');

-- 2) اربط ملعبه بحسابه
update public.pitches set owner_id = (select id from auth.users where phone = '96512345678')
where name_en = 'Elite Arena';
```

بعدها تطلع له "لوحة صاحب الملعب" في صفحة حسابي: حجوزات كل يوم بأسماء اللاعبين، الدخل، نسبة الإشغال، قفل وفتح الساعات، وتعديل السعر.

## 4. الأمان باختصار

- رقم التلفون ما يطلع لأي لاعب ثاني (محفوظ في `auth.users` بس).
- اللاعب يشوف حجوزاته بس، وصاحب الملعب يشوف حجوزات ملاعبه بس.
- اللاعب ما يقدر يغيّر دوره (`role`)، وصاحب الملعب يقدر يغيّر السعر والمواعيد بس.
- كل الكتابة تمر على دوال الخادم اللي تتأكد من: مواعيد الفتح، عدم التداخل، العدد الأقصى للاعبين، والإلغاء قبل 6 ساعات.

## 5. التشغيل

```bash
npm install
cp .env.example .env    # وعبّي القيم
npx expo start           # وامسح الـ QR بـ Expo Go
```
