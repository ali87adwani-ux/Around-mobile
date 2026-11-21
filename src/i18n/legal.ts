/**
 * Privacy policy and terms of use. Shown in the app and on the web at /legal/privacy and /legal/terms
 * (those web links go in App Store Connect). Have a Kuwaiti lawyer review before launch.
 */
import { SUPPORT_WHATSAPP } from '@/config';

export const LEGAL_UPDATED = '2026-11-21';
const wa = `+${SUPPORT_WHATSAPP.slice(0, 3)} ${SUPPORT_WHATSAPP.slice(3)}`;

type Section = { h: string; p: string[] };
type Doc = { title: string; intro: string; sections: Section[] };

export const privacy: Record<'ar' | 'en', Doc> = {
  ar: {
    title: 'سياسة الخصوصية',
    intro: 'تطبيق "الدوري" يحترم خصوصيتك. توضح هذه السياسة البيانات التي نجمعها، ولماذا نجمعها، وكيف نحميها، وما هي حقوقك.',
    sections: [
      {
        h: 'البيانات التي نجمعها',
        p: [
          'بيانات الحساب: الاسم والبريد الإلكتروني اللذان تشاركهما Apple أو Google عند تسجيل الدخول. إذا اخترت "إخفاء بريدي" في Apple نستلم بريداً بديلاً فقط.',
          'بطاقة اللاعب: الاسم الذي تكتبه، مركزك ومستواك، وصورة الحساب إذا أضفتها.',
          'نشاطك في التطبيق: الحجوزات، المباريات التي تنضم لها أو تنظمها، تسجيل الفرق في البطولات، التقييمات، النقاط، وتسجيل الأطفال في الأكاديميات (اسم الطفل وعمره فقط).',
          'الدعم الفني: الرسائل التي ترسلها لفريق الدعم.',
          'أصحاب الملاعب: بيانات الملعب ورقم التواصل الذي يُرسل مع طلب إضافة الملعب، ولا يظهر هذا الرقم للاعبين.',
          'الإشعارات: رمز الإشعارات الخاص بجهازك ولغة التطبيق، لنرسل لك التنبيهات.',
          'لا نجمع موقعك الجغرافي، ولا جهات الاتصال، ولا نستخدم أدوات تتبع إعلانية.',
        ],
      },
      {
        h: 'لماذا نستخدم بياناتك',
        p: [
          'لتشغيل الخدمة: إنشاء الحساب، تأكيد الحجوزات، تنظيم المباريات والبطولات، وإظهار اسمك وصورتك للاعبين الآخرين في المباريات.',
          'لإرسال الإشعارات المتعلقة بحجوزاتك ومبارياتك وردود الدعم.',
          'لحماية التطبيق ومنع إساءة الاستخدام، ولتحسين الخدمة.',
          'لا نبيع بياناتك ولا نشاركها مع معلنين.',
        ],
      },
      {
        h: 'من يرى بياناتك',
        p: [
          'اللاعبون الآخرون: اسمك وصورتك ومركزك وإحصائياتك داخل التطبيق.',
          'صاحب الملعب: اسمك ووقت حجزك في ملعبه فقط.',
          'صاحب الأكاديمية: اسم الطفل وعمره عند التسجيل في برامجه.',
          'مزودو الخدمة: نستضيف البيانات لدى Supabase (خوادم في مومباي، الهند)، ونرسل الإشعارات عبر خدمة Expo، وتسجيل الدخول عبر Apple وGoogle. يلتزم هؤلاء بحماية البيانات ولا يستخدمونها لأغراضهم.',
          'الجهات الرسمية: إذا طلب القانون الكويتي ذلك.',
        ],
      },
      {
        h: 'حماية البيانات والاحتفاظ بها',
        p: [
          'البيانات مشفرة أثناء النقل، والوصول إليها محكوم بصلاحيات صارمة على مستوى قاعدة البيانات.',
          'نحتفظ ببياناتك ما دام حسابك موجوداً. عند حذف الحساب تُحذف بياناتك الشخصية نهائياً، وتبقى سجلات الحجز بدون أي معلومات تدل عليك لأغراض محاسبية لصاحب الملعب.',
        ],
      },
      {
        h: 'حقوقك',
        p: [
          'تعديل بياناتك في أي وقت من صفحة "حسابي".',
          'حذف صورتك أو حسابك بالكامل من "حسابي ← حذف الحساب"، ويتم الحذف فوراً.',
          'إيقاف الإشعارات من إعدادات جهازك.',
          'طلب نسخة من بياناتك أو أي استفسار عبر الدعم الفني.',
        ],
      },
      {
        h: 'الأطفال',
        p: ['التطبيق موجه لمن هم 13 سنة فأكثر. تسجيل الأطفال في الأكاديميات يتم من قبل ولي الأمر من حسابه.'],
      },
      {
        h: 'التواصل',
        p: [`للأسئلة حول الخصوصية: الدعم الفني داخل التطبيق، أو واتساب ${wa}.`, 'قد نحدّث هذه السياسة، وسننبهك داخل التطبيق عند أي تغيير مهم.'],
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    intro: 'Al Dawri respects your privacy. This policy explains what we collect, why, how we protect it, and your rights.',
    sections: [
      {
        h: 'What we collect',
        p: [
          'Account details: the name and email Apple or Google share when you sign in. If you choose "Hide my email" with Apple we only receive a relay address.',
          'Player card: the name you enter, your position and level, and a profile photo if you add one.',
          'Activity: bookings, games you join or organise, tournament registrations, reviews, points, and academy enrolments (child name and age only).',
          'Support: the messages you send to our support team.',
          'Pitch owners: pitch details and the contact number sent with a listing request. That number is never shown to players.',
          'Notifications: your device push token and app language, so we can send you alerts.',
          'We do not collect your location or contacts, and we use no advertising trackers.',
        ],
      },
      {
        h: 'How we use it',
        p: [
          'To run the service: create your account, confirm bookings, organise games and tournaments, and show your name and photo to other players in a game.',
          'To send notifications about your bookings, games and support replies.',
          'To keep the app safe, prevent abuse and improve the service.',
          'We never sell your data or share it with advertisers.',
        ],
      },
      {
        h: 'Who can see it',
        p: [
          'Other players: your name, photo, position and stats inside the app.',
          'Pitch owners: your name and booking time at their pitch only.',
          'Academy owners: the child name and age you enrol in their programs.',
          'Service providers: data is hosted by Supabase (servers in Mumbai, India), push notifications go through Expo, and sign-in through Apple and Google. They protect the data and do not use it for their own purposes.',
          'Authorities, when Kuwaiti law requires it.',
        ],
      },
      {
        h: 'Security and retention',
        p: [
          'Data is encrypted in transit and access is enforced by strict database-level permissions.',
          'We keep your data while your account exists. When you delete your account your personal data is erased permanently; booking records stay without anything that identifies you, for the pitch owner’s accounting.',
        ],
      },
      {
        h: 'Your rights',
        p: [
          'Edit your details at any time from Profile.',
          'Delete your photo, or your whole account from Profile → Delete account. Deletion is immediate.',
          'Turn off notifications in your device settings.',
          'Ask for a copy of your data, or anything else, through support.',
        ],
      },
      { h: 'Children', p: ['The app is meant for people aged 13 and over. Children are enrolled in academies by a parent from the parent’s account.'] },
      {
        h: 'Contact',
        p: [`Privacy questions: in-app support, or WhatsApp ${wa}.`, 'We may update this policy and will let you know in the app about important changes.'],
      },
    ],
  },
};

export const terms: Record<'ar' | 'en', Doc> = {
  ar: {
    title: 'الشروط والأحكام',
    intro: 'باستخدامك تطبيق "الدوري" فإنك توافق على هذه الشروط. إذا لم توافق عليها يرجى عدم استخدام التطبيق.',
    sections: [
      {
        h: 'الخدمة',
        p: ['"الدوري" منصة تربط اللاعبين بالملاعب والأكاديميات في الكويت: حجز الملاعب، تنظيم المباريات، البطولات، والأكاديميات. الملاعب والأكاديميات يديرها أصحابها، والتطبيق وسيط بين الطرفين.'],
      },
      {
        h: 'الحساب',
        p: [
          'يجب أن يكون عمرك 13 سنة أو أكثر، وأن تكون المعلومات التي تقدمها صحيحة.',
          'أنت مسؤول عن كل ما يتم من حسابك. يمكنك حذف حسابك في أي وقت من صفحة "حسابي".',
        ],
      },
      {
        h: 'الحجوزات والإلغاء',
        p: [
          'الحجز مؤكد فور ظهوره في "حجوزاتي". الأسعار المعروضة بالدينار الكويتي، وقد تشمل خصم أوقات الهدوء.',
          'يتم الدفع في الملعب مباشرة لصاحب الملعب، ولا يتم أي دفع أو تحصيل مالي من خلال التطبيق. أي استرجاع للمبالغ يتم بين اللاعب وصاحب الملعب.',
          'الإلغاء مجاني حتى 6 ساعات قبل موعد الحجز. بعد ذلك لا يمكن الإلغاء من التطبيق.',
          'عدم الحضور المتكرر يؤثر على تقييم الالتزام في حسابك، وقد يؤدي لإيقاف الحساب.',
          'يحق لصاحب الملعب أو إدارة التطبيق إلغاء الحجز لظروف قاهرة، وسيصلك إشعار بذلك.',
        ],
      },
      {
        h: 'المباريات والبطولات',
        p: [
          'منظم المباراة مسؤول عن الحجز وعن تحصيل حصة كل لاعب كما هي معروضة في التطبيق.',
          'احترم اللاعبين الآخرين والحكام وقوانين الملعب. يمنع العنف والإساءة والتمييز.',
          'المشاركة في الأنشطة الرياضية على مسؤوليتك الشخصية، والتطبيق غير مسؤول عن الإصابات.',
        ],
      },
      {
        h: 'أصحاب الملاعب والأكاديميات',
        p: [
          'يجب أن تكون مخولاً بإدارة الملعب أو الأكاديمية، وأن تكون البيانات والأسعار وأوقات العمل صحيحة ومحدثة.',
          'تخضع كل الإعلانات لمراجعة الإدارة قبل ظهورها، ويحق للإدارة رفض أو إيقاف أي إعلان.',
          'صاحب الملعب مسؤول عن سلامة المنشأة والالتزام بالحجوزات المؤكدة.',
        ],
      },
      {
        h: 'المحتوى',
        p: ['أنت مسؤول عن الصور والتقييمات والرسائل التي تنشرها. يمنع المحتوى المسيء أو المخالف للقانون أو للآداب العامة، ويحق لنا حذفه وإيقاف الحساب.'],
      },
      {
        h: 'حدود المسؤولية',
        p: ['نبذل جهدنا لتكون الخدمة متاحة ودقيقة، لكنها تقدم "كما هي". لا نتحمل مسؤولية النزاعات بين اللاعبين وأصحاب الملاعب أو الأكاديميات، وسنساعد في حلها قدر الإمكان عبر الدعم الفني.'],
      },
      {
        h: 'القانون',
        p: ['تخضع هذه الشروط لقوانين دولة الكويت، وتختص محاكم الكويت بأي نزاع.', `للتواصل: الدعم الفني داخل التطبيق أو واتساب ${wa}.`],
      },
    ],
  },
  en: {
    title: 'Terms of Use',
    intro: 'By using Al Dawri you agree to these terms. If you do not agree, please do not use the app.',
    sections: [
      {
        h: 'The service',
        p: ['Al Dawri connects players with pitches and academies in Kuwait: pitch booking, pickup games, tournaments and academies. Pitches and academies are run by their owners; the app is the intermediary.'],
      },
      {
        h: 'Your account',
        p: ['You must be 13 or older and give accurate information.', 'You are responsible for activity on your account. You can delete it at any time from Profile.'],
      },
      {
        h: 'Bookings and cancellation',
        p: [
          'A booking is confirmed once it appears in My bookings. Prices are in Kuwaiti dinars and may include an off-peak discount.',
          'You pay at the pitch, directly to the pitch owner; no payment is taken through the app. Any refund is between the player and the pitch owner.',
          'Cancellation is free up to 6 hours before kick-off; after that it cannot be cancelled in the app.',
          'Repeated no-shows lower your reliability score and may lead to suspension.',
          'The pitch owner or Al Dawri may cancel a booking in exceptional circumstances; you will be notified.',
        ],
      },
      {
        h: 'Games and tournaments',
        p: [
          'A game’s organiser is responsible for the booking and for collecting each player’s share as shown in the app.',
          'Respect other players, referees and pitch rules. Violence, abuse and discrimination are not allowed.',
          'You take part in sport at your own risk; Al Dawri is not liable for injuries.',
        ],
      },
      {
        h: 'Pitch and academy owners',
        p: [
          'You must be authorised to manage the pitch or academy, and keep its details, prices and hours accurate.',
          'Every listing is reviewed before it goes live, and we may reject or suspend any listing.',
          'Owners are responsible for the safety of the facility and for honouring confirmed bookings.',
        ],
      },
      { h: 'Content', p: ['You are responsible for photos, reviews and messages you post. Offensive or unlawful content is not allowed and may be removed, with the account suspended.'] },
      {
        h: 'Liability',
        p: ['We work to keep the service available and accurate, but it is provided “as is”. We are not liable for disputes between players and owners, and will help resolve them through support where we can.'],
      },
      { h: 'Governing law', p: ['These terms are governed by the laws of the State of Kuwait, and Kuwaiti courts have jurisdiction.', `Contact: in-app support or WhatsApp ${wa}.`] },
    ],
  },
};
