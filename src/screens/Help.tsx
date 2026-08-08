/**
 * Instructions, at #/help.
 *
 * The content lives here as structured data rather than in the flat i18n
 * dictionary: it is long-form prose in two languages, and threading forty
 * paragraph keys through `t()` would make both files unreadable and make it
 * far too easy for the two languages to drift apart.
 */
import { useI18n } from '../i18n'
import type { Lang } from '../i18n'
import { GirlLogo } from '../components/GirlLogo'

interface Section {
  icon: string
  title: string
  /** Paragraphs, and lists rendered as bullets. */
  body: Array<string | string[]>
}

const CONTENT: Record<Lang, { intro: string; sections: Section[] }> = {
  en: {
    intro:
      'Split a restaurant bill so everyone pays for what they actually had — and so the shares add up to the bill exactly, to the piastre.',
    sections: [
      {
        icon: '⚡',
        title: 'The short version',
        body: [
          [
            '1. **People** — add everyone paying, and how many each is covering.',
            '2. **Bill** — type the receipt in, or photograph it.',
            '3. **Assign** — send a link so people pick their own food, or tap it in yourself.',
            '4. **Summary** — see who owes what, and send it to the group.',
          ],
          'Everything saves on your device as you go. Closing the tab loses nothing.',
        ],
      },
      {
        icon: '👥',
        title: 'People',
        body: [
          'Add everyone who is **paying** — including yourself. This comes first because some options on the Bill tab need to know who is at the table.',
          'A person is a *payer*, not a head. If Caro is covering herself, her partner and a child, that is **one** entry with a party size of **3**.',
          [
            '**⭐ Organizer** — whoever is collecting the money. Any leftover piastre from an uneven split lands on them, so the total always comes out exact.',
            '**🎂 Guest of honour** — a birthday, a leaving do, someone being treated. They pay nothing; whatever they had is spread across everybody else. Their card still lists what they ate, at zero.',
          ],
          'You cannot have two people with the same name — in the shared link, people pick themselves off a list, and two identical names would be a coin flip.',
        ],
      },
      {
        icon: '🧾',
        title: 'Bill',
        body: [
          'Add each line from the receipt. For every item you choose two things:',
          [
            '**Price of one** or **Line total** — receipts print either. If it says *"3 Tea  100.00"*, choose **Line total** and type 100.00. Never divide it yourself; the app handles the fact that 100 does not split evenly into three.',
            '**How it is divided** — *Claimed* (someone picks it), *Everyone* (bread, water, mezze), or *Split between* (two people sharing one pizza — divided equally between just the names you tap).',
          ],
          '**Discount, service, tax and tip** each take either a percentage or a fixed amount. In Egypt, service is usually charged on the food and VAT on food + service — the checkbox under Tax handles that, and it is on by default.',
          'The **tip / delivery** line sits on top of the printed bill, not inside it, so it never interferes with the check below.',
        ],
      },
      {
        icon: '✅',
        title: 'The receipt cross-check',
        body: [
          'Type the total printed on the receipt into *"Total printed on the receipt"*. The app compares it with its own maths and tells you the exact difference if they disagree.',
          'This is the most useful thing in the app. It catches a mistyped price or a line entered twice **before** the money gets divided. When the restaurant has rounded its own service line oddly, the **"Set service to X to match"** button reconciles the two in one tap.',
        ],
      },
      {
        icon: '📷',
        title: 'Scanning a receipt',
        body: [
          'Photograph the bill and the items fill themselves in. Flatten the receipt, fill the frame, and avoid glare.',
          'Nothing goes into your bill unchecked — you get an editable list first, and lines the scanner was unsure of are marked. It also reads the printed total, which arms the cross-check above: if it missed a line, you will be told.',
          'The photo is sent to Google to be read and then discarded. It is not stored anywhere and never enters the shared bill.',
        ],
      },
      {
        icon: '🔗',
        title: 'Assign — two ways',
        body: [
          '**Share a link.** Send it on WhatsApp; everyone opens it, taps their name once, and picks what they had. You watch the responses arrive. Nobody needs an account.',
          '**I’ll assign.** Tap through the items yourself. No internet needed at all — the fallback when the restaurant Wi-Fi is hopeless.',
          'Either way, quantities are capped at what was actually ordered, so the group cannot between them claim four of three steaks.',
          'When everyone has responded, **Lock the bill** on the Summary tab so the numbers stop moving while you collect.',
        ],
      },
      {
        icon: '🧮',
        title: 'Summary',
        body: [
          'Each person gets a card: what they ate, their share of the shared items, their service and tax, and their total.',
          [
            '**Dividing tax & service** — *By what you ate* (default) or *Equally*.',
            '**Rounding each share up** — round everyone to a whole 1, 5 or 10. Every piastre collected goes to the tip line; nobody keeps it.',
            '**Give to…** — anything nobody claimed is split across the group, but you can hand it to one person instead if they simply forgot to tick their dessert.',
          ],
          '**Copy summary** or **Share on WhatsApp** sends the finished breakdown to the group.',
        ],
      },
      {
        icon: '💡',
        title: 'Good to know',
        body: [
          [
            'The shares **always** add up to the bill exactly. Rounding leftovers go to the organizer, never into thin air.',
            'Money is handled in whole piastres throughout, so it cannot drift.',
            'Anyone with a bill’s link can see and edit that bill — there are no passwords. Treat it like the WhatsApp group.',
            'On a phone, **Install app** puts it on your home screen and it opens without the browser bar.',
            'It costs nothing to run, and there is no account to make.',
            '**New bill, same people** clears the receipt but keeps the table — handy for a second venue. **Start a new gathering** wipes everything.',
          ],
        ],
      },
    ],
  },

  ar: {
    intro:
      'قسّم فاتورة المطعم بحيث يدفع كل شخص ثمن ما أكله فعلاً — ومجموع الحصص يساوي الفاتورة تماماً، حتى القرش الواحد.',
    sections: [
      {
        icon: '⚡',
        title: 'باختصار',
        body: [
          [
            '١. **المشاركون** — أضف كل من سيدفع، وعدد الأفراد الذين يدفع عنهم.',
            '٢. **الفاتورة** — أدخل الفاتورة، أو صوّرها.',
            '٣. **التوزيع** — أرسل رابطاً ليختار كل شخص طعامه، أو وزّع أنت بنفسك.',
            '٤. **الملخّص** — من يدفع كم، ثم أرسله للمجموعة.',
          ],
          'كل شيء يُحفظ على جهازك أولاً بأول. إغلاق الصفحة لا يفقدك شيئاً.',
        ],
      },
      {
        icon: '👥',
        title: 'المشاركون',
        body: [
          'أضف كل من **سيدفع** — وأضف نفسك. يأتي هذا أولاً لأن بعض خيارات تبويب الفاتورة تحتاج معرفة من على الطاولة.',
          'المشارك هو **من يدفع**، وليس فرداً واحداً. إذا كانت كارو تدفع عن نفسها وزوجها وطفلها، فهذا **اسم واحد** بعدد أفراد **٣**.',
          [
            '**⭐ المنظّم** — من يجمع الحساب. أي كسور متبقية من التقريب تُحمَّل عليه، فيظل المجموع مضبوطاً تماماً.',
            '**🎂 ضيف الشرف** — عيد ميلاد أو وداع أو شخص مدعو. لا يدفع شيئاً، ويُوزَّع ما أكله على الباقين. ويظل ما أكله ظاهراً في بطاقته بقيمة صفر.',
          ],
          'لا يمكن تكرار الاسم — ففي الرابط المشترك يختار كل شخص اسمه من قائمة، واسمان متطابقان يعنيان الحيرة.',
        ],
      },
      {
        icon: '🧾',
        title: 'الفاتورة',
        body: [
          'أضف كل سطر من الفاتورة. لكل صنف تختار أمرين:',
          [
            '**سعر الواحد** أو **إجمالي السطر** — الفواتير تطبع أحدهما. إذا كُتب *«٣ شاي ١٠٠٫٠٠»* فاختر **إجمالي السطر** واكتب ١٠٠٫٠٠. لا تقسّم بنفسك؛ التطبيق يتولّى أن ١٠٠ لا تنقسم على ٣ بالتساوي.',
            '**كيف يُقسَّم** — *يختاره أحد*، أو *الجميع* (العيش والمياه والمقبلات)، أو *مقسوم بين* (شخصان يتقاسمان بيتزا — يُقسَّم بالتساوي بين من تختارهم فقط).',
          ],
          '**الخصم والخدمة والضريبة والبقشيش** يقبل كل منها نسبة مئوية أو مبلغاً ثابتاً. في مصر تُحسب الخدمة على الطعام ثم الضريبة على الطعام + الخدمة — وهذا ما يفعله المربّع أسفل الضريبة، وهو مفعّل افتراضياً.',
          'سطر **البقشيش / التوصيل** فوق الفاتورة المطبوعة وليس داخلها، حتى لا يؤثر على المراجعة أدناه.',
        ],
      },
      {
        icon: '✅',
        title: 'مراجعة الفاتورة',
        body: [
          'اكتب الإجمالي المطبوع على الفاتورة في خانة *«الإجمالي المطبوع»*. يقارنه التطبيق بحسابه ويخبرك بالفرق بالضبط إن اختلفا.',
          'هذه أنفع ميزة في التطبيق: تكشف سعراً مكتوباً بالخطأ أو صنفاً مُدخلاً مرتين **قبل** تقسيم الحساب. وإذا كان المطعم قرّب رسوم الخدمة بطريقته، فزر **«اضبط الخدمة على كذا للمطابقة»** يوفّق بينهما بضغطة واحدة.',
        ],
      },
      {
        icon: '📷',
        title: 'تصوير الفاتورة',
        body: [
          'صوّر الفاتورة فتُدخَل الأصناف تلقائياً. افرد الفاتورة، واملأ بها الإطار، وتجنّب الانعكاس.',
          'لا يدخل شيء لفاتورتك دون مراجعة — تظهر لك قائمة قابلة للتعديل أولاً، والأسطر غير المؤكّدة مُعلَّمة. ويقرأ أيضاً الإجمالي المطبوع، وهو ما يُفعّل المراجعة أعلاه: إن فاته سطر ستعرف.',
          'تُرسل الصورة إلى جوجل لقراءتها ثم تُمسح. لا تُحفظ في أي مكان ولا تدخل الفاتورة المشتركة.',
        ],
      },
      {
        icon: '🔗',
        title: 'التوزيع — طريقتان',
        body: [
          '**شارك رابطاً.** أرسله على واتساب؛ يفتحه كل شخص، يضغط اسمه مرة واحدة، ويختار ما أكله. وأنت ترى الردود تصل. لا يحتاج أحد لحساب.',
          '**سأوزّع بنفسي.** وزّع الأصناف بنفسك. لا يحتاج إنترنت إطلاقاً — وهو الحل حين تكون شبكة المطعم سيئة.',
          'في الحالتين، الكميات محدودة بما طُلب فعلاً، فلا يمكن للمجموعة اختيار أربع قطع من ثلاث.',
          'وحين يرد الجميع، اضغط **اقفل الفاتورة** من تبويب الملخّص حتى تثبت الأرقام أثناء التحصيل.',
        ],
      },
      {
        icon: '🧮',
        title: 'الملخّص',
        body: [
          'لكل شخص بطاقة: ما أكله، ونصيبه من الأصناف المشتركة، والخدمة والضريبة، والإجمالي.',
          [
            '**توزيع الضريبة والخدمة** — *حسب ما أكلت* (الافتراضي) أو *بالتساوي*.',
            '**تقريب نصيب كل شخص** — تقريب الجميع لأقرب ١ أو ٥ أو ١٠. كل قرش يُجمع يذهب للبقشيش؛ لا يأخذه أحد.',
            '**أسندها إلى…** — ما لا يختاره أحد يُقسَّم على المجموعة، ويمكنك إسناده لشخص بعينه إن كان نسي أن يختار حلواه.',
          ],
          '**انسخ الملخّص** أو **شارك على واتساب** لإرسال التفاصيل النهائية للمجموعة.',
        ],
      },
      {
        icon: '💡',
        title: 'معلومات مفيدة',
        body: [
          [
            'مجموع الحصص **دائماً** يساوي الفاتورة تماماً. كسور التقريب تذهب للمنظّم، لا تضيع.',
            'كل المبالغ تُحسب بالقروش الصحيحة، فلا يحدث انحراف.',
            'من يملك رابط الفاتورة يستطيع رؤيتها وتعديلها — لا توجد كلمات مرور. تعامل معه كمجموعة الواتساب.',
            'على الهاتف، زر **ثبّت التطبيق** يضعه على شاشتك الرئيسية ويفتح بدون شريط المتصفح.',
            'تشغيله لا يكلّف شيئاً، ولا يحتاج إنشاء حساب.',
            '**فاتورة جديدة بنفس الأشخاص** تمسح الفاتورة وتُبقي المشاركين — مفيدة لمكان ثانٍ. أما **ابدأ لقاءً جديداً** فتمسح كل شيء.',
          ],
        ],
      },
    ],
  },
}

/** Render **bold** spans. Deliberately minimal — no HTML is ever injected. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

export function Help() {
  const { t, lang, toggleLang } = useI18n()
  const { intro, sections } = CONTENT[lang]

  return (
    <div className="app">
      <header className="appbar">
        <GirlLogo className="appbar__logo" />
        <div className="appbar__titles">
          <h1 className="appbar__title">{t('help.title')}</h1>
          <p className="appbar__tagline">{t('app.title')}</p>
        </div>
        <button type="button" className="btn btn--ghost btn--small" onClick={toggleLang}>
          {t('lang.switch')}
        </button>
        <a className="btn btn--primary btn--small" href="#/">
          {t('help.back')}
        </a>
      </header>

      <main className="main">
        <div className="screen">
          <p className="help-intro">{intro}</p>

          {sections.map((section) => (
            <section key={section.title} className="card help-section">
              <h2 className="help-section__title">
                <span aria-hidden="true">{section.icon}</span> {section.title}
              </h2>
              {section.body.map((block, i) =>
                Array.isArray(block) ? (
                  <ul key={i} className="help-list">
                    {block.map((entry, j) => (
                      <li key={j}>
                        <RichText text={entry} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p key={i} className="help-para">
                    <RichText text={block} />
                  </p>
                ),
              )}
            </section>
          ))}

          <div className="screen__footer">
            <a className="btn btn--primary" href="#/">
              {t('help.back')}
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
