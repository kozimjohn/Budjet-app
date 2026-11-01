# Personal Budjet: Telegram Mini App

Chiqim, kirim va valyuta almashtirishni Telegram ichidan bir necha bosishda "Personal budjet 2025" sheetiga yozadigan ilova.

| Fayl | Vazifasi |
|---|---|
| `index.html` | Mini App sahifasi. Telegram ichida ochiladi. |
| `Code.gs` | Google Apps Script. Telegram imzosini tekshiradi va sheetga yozadi. |

```
Telegram (menyu tugmasi) → index.html (GitHub Pages) → Code.gs (Apps Script) → Google Sheet
```

Hozirgi bot kodi o'zgarmaydi. Mini App botga faqat BotFather orqali ulanadi.

## Sheetga nima yoziladi

Ilova faqat A–G ustunlariga yozadi. H va undan keyingi formulali ustunlarga tegmaydi, ular o'zi hisoblanadi.

| Yozuv | Varaq | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|---|
| Chiqim | Outflow | Sana | Kategoriya | Summa | Hamyon | bo'sh | Izoh | bo'sh |
| Almashtirish | Outflow | Sana | `Exchange` | Summa (beriladigan valyutada) | Qayerdan | Kurs (so'm↔$ bo'lsa) | Izoh | Qayerga |
| Kirim | Inflow | Sana | Kategoriya | Summa | Hamyon | Kurs (faqat so'm hamyonga) | Izoh | — |

- Yangi qator oxirgi yozuvdan keyingi birinchi bo'sh qatorga tushadi.
- `733+105` deb kiritilgan summa sheetda `=733+105` formulasi bo'lib qoladi.
- Kategoriya va hamyonlar ro'yxati `List of items` varag'idan olinadi. Yangi kategoriyani o'sha yerga qo'shsangiz, ilovada ham chiqadi.
- "Bekor qilish" faqat eng oxirgi yozuvni o'chiradi, u ham faqat qator o'zgarmagan bo'lsa.
- Outflow varag'ida bo'sh qator qolmasa, ilova oxirgi qatordan oldin 300 ta yangi qator qo'shadi. Shu tufayli formulalardagi diapazonlar ham kengayadi.

## O'rnatish

### 1. Apps Script

Sheetni tahrirlash huquqi bor Google akkaunt bilan bajaring.

1. [script.google.com](https://script.google.com) → **New project**. Botning Apps Script loyihasiga qo'shmang: ikkita `doPost` bir-biriga xalaqit beradi.
2. `Code.gs` ichidagi hamma narsani nusxalab qo'ying va saqlang.
3. **Project Settings → Script properties** ga ikkita qiymat qo'shing:
   - `BOT_TOKEN`: @BotFather → /mybots → bot → API Token
   - `ALLOWED_USER_ID`: sizning Telegram ID raqamingiz (@userinfobot ko'rsatadi)
   - `SHEET_ID`: sheet havolasidagi `/d/` va `/edit` orasidagi uzun qism. Repo ochiq bo'lgani uchun kodga yozilmaydi.
   - `GEMINI_API_KEY`: ovoz bilan kiritish uchun (pastdagi bo'limga qarang)
4. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Ruxsat so'ralsa, **Authorize** ni bosing. Chiqqan `https://script.google.com/macros/s/…/exec` manzilini nusxalang.

"Anyone" bo'lsa ham, Telegram imzosi va sizning ID'ingiz tekshirilmasdan hech narsa o'qilmaydi ham, yozilmaydi ham.

`Code.gs` ni keyinroq o'zgartirsangiz: **Deploy → Manage deployments → Edit → Version: New version**. Manzil o'zgarmaydi.

### Tez kiritish: matn yoki klaviatura orqali ovoz

Odatiy tartib: xarajat nomi inglizcha, summa, hamyon. Masalan, `medicine 150k cash sum` yoki `grocery two hundred thousand card sum`. Mikrofon oynasidagi maydonga yozing yoki telefon klaviaturasidagi mikrofon bilan ayting. Ilova bu gapni AI'siz, telefonning o'zida darhol tushunadi:

- Summalar: `150k`, `1,5 mln`, `150 000`, `one hundred fifty thousand`, `ikki yuz ellik ming`, `bir yarim million`, `500$`, `100 dollar`
- Hamyonlar: `cash sum` / `naqd`, `card sum` / `karta` / `kartadan`, `cash dollar`, `visa`, `master`; ovoz dasturi noto'g'ri yozgan `cash some`, `cash son`, `cache sum` ham tushuniladi
- Kategoriyalar: sheetdagi nomlar (`medicine`, `lunch with family`), xatoli yozilgani ham (`medecine`), o'zbekcha so'zlar (`dorixona` → Medicine, `bozor` → Grocery, `taksi` → Taxi, `svet` → Electricity va hokazo)
- Sana: `bugun`, `kecha`, `o'tgan kuni`
- Kirim: `kirim dividend 1000$`
- Almashtirish: `100$ almashtirdim naqd so'mga 12100`, `kartadan naqdga 500 ming`
- Bir nechta yozuv: vergul yoki `va` bilan ajrating

Bu rejim Gemini kalitisiz ham ishlaydi.

### Ovoz bilan kiritish (Gemini)

Yuqoridagi mikrofon tugmasi ovozingizni yozib oladi. Gemini uni matnga aylantirib, alohida yozuvlarga ajratadi. Masalan, "Bozorga 200 ming naqd, taksiga 30 ming kartadan, 100 dollarni 12 100 dan almashtirdim" uchta yozuvga bo'linadi.

Yozuvlar avtomatik saqlanmaydi. Avval ro'yxat ko'rinadi:
- har birini o'chirish mumkin;
- birini bossangiz, formada tahrirlaysiz;
- "Saqlash" tugmasi to'liq yozuvlarni sheetga yozadi.

Kalit olish:
1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) sahifasida Google akkaunt bilan **Create API key** ni bosing. Bepul tarif shaxsiy foydalanish uchun yetadi.
2. Kalitni Apps Script → Project Settings → Script properties ga `GEMINI_API_KEY` nomi bilan qo'ying.
3. Model: standart `gemini-flash-latest`. Google uni almashtirsa yoki xato bersa, `GEMINI_MODEL` property'siga boshqa model nomini yozing.

Maxfiylik: ovoz yozuvi (60 soniyagacha) va kategoriyalar ro'yxati tahlil uchun Google'ga yuboriladi. Bepul tarifda Google bu ma'lumotlardan o'z mahsulotlarini yaxshilash uchun foydalanishi mumkin. Buni istamasangiz, AI Studio'da billing'ni yoqing (pullik tarif), yoki kalitni qo'ymang: shunda ovoz tugmasi xato ko'rsatadi, qolgan hammasi ishlayveradi.

Telegram mikrofonga birinchi marta ruxsat so'raydi. Rad etilgan bo'lsa, telefon sozlamalarida Telegram uchun mikrofonni yoqing.

### 2. index.html

Fayl boshidagi qatorga manzilni qo'ying:

```js
var API_URL = 'https://script.google.com/macros/s/…/exec';
```

`API_URL` bo'sh qolsa yoki sahifa Telegramdan tashqarida ochilsa, ilova namuna rejimida ishlaydi va sheetga hech narsa yozmaydi.

### 3. Joylashtirish (GitHub Pages)

1. GitHub'da yangi repo oching, masalan `budjet-app`.
2. `index.html` ni yuklang.
3. **Settings → Pages → Branch: main** ni tanlang.

Manzil `https://<github-login>.github.io/budjet-app/` ko'rinishida bo'ladi.

### 4. Botga ulash

@BotFather → /mybots → bot → **Bot Settings → Menu Button** → 3-qadamdagi manzilni kiriting, tugma nomini yozing (masalan, "Kiritish").

Shundan keyin botdagi menyu tugmasi Mini App'ni ochadi.
