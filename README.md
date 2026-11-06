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
- **Card sum'ga almashtirish komissiyasi:** Cash dollar → Card sum almashtirishda komissiya tanlanadi: **1,1%**, **1%**, **0,75%** yoki **Aniq summa**. Oxirgi ishlatilgan foiz keyingi safar ham tanlangan turadi.
  - Hisob bankdagidek: yuboruvchi to'laydigan summa + komissiya = $ × kurs. Ya'ni kartaga $ × kurs ÷ (1 + foiz) tushadi. Chek bilan tekshirilgan: 1 195 000 ÷ 1,0075 = 1 186 104,22.
  - Sheetga bitta `Exchange` qatori yoziladi, kursi komissiya ayrilgan va **butun songa yaxlitlangan** holda (12 000 ÷ 1,011 = 11 869; 11 950 ÷ 1,0075 = 11 861). Card sum'ga $ × shu kurs tushadi, asl kurs va foiz izohda turadi.
  - **Aniq summa:** foiz boshqacha bo'lsa, chekdagi kartaga tushgan summani yozing (masalan, 1 186 104,22). Ilova kursni summa ÷ $ qilib yaxlitlaydi (11 861), foizni o'zi hisoblaydi. Izohga `Kurs 11 950, komissiya 0,75%, kartaga 1 186 104,22` yoziladi.
- Kategoriya va hamyonlar ro'yxati `List of items` varag'idan olinadi. Yangi kategoriyani o'sha yerga qo'shsangiz, ilovada ham chiqadi.
- "Bekor qilish" faqat eng oxirgi yozuvni o'chiradi, u ham faqat qator o'zgarmagan bo'lsa.
- Outflow varag'ida bo'sh qator qolmasa, ilova oxirgi qatordan oldin 300 ta yangi qator qo'shadi. Shu tufayli formulalardagi diapazonlar ham kengayadi.

## Ilovadagi qulayliklar

- **Eski yozuvni tuzatish yoki o'chirish.** "Oxirgi yozuvlar"dagi istalgan qatorni bosing: u formaga ochiladi, yuqorida "Tahrirlanmoqda" paneli chiqadi.
  - "O'zgarishni saqlash" qatorni sheetdagi o'z joyida qayta yozadi.
  - "O'chirish" ikki marta bosiladi ("Ha, o'chirilsin"): faqat o'sha qatorning A–G ustunlari tozalanadi.
  - Qator sheetda siz bilmagan holda o'zgargan bo'lsa, ilova unga tegmaydi va xabar beradi.
  - Kirimni chiqimga (yoki aksincha) aylantirib bo'lmaydi: eskisini o'chirib, yangisini kiriting.
- **Tez summalar.** Kategoriya tanlanganda siz unga eng ko'p yozgan 3 ta summa chiqadi (kamida 2 marta ishlatilgani). Bossangiz, summa va hamyon to'ldiriladi.
- **Odatdagi summa.** Kategoriyaning oxirgi 10 ta yozuvidan kamida 8 tasi bir xil summa va hamyondan bo'lsa (masalan, har kungi Charity: Card sum'dan), kategoriyani bosishingiz bilan summa va hamyon o'zi yoziladi ("odatdagi summa"). Boshqa summa kerak bo'lsa, raqam tering: oldingisi o'rniga yoziladi.
- **Oylik to'lovlar (eslatma).** Oxirgi 4 oyning kamida 3 tasida, oyiga 1–2 marta yozilgan to'lovlar (internet, bog'cha, mobil aloqa va h.k.) bu oy hali yozilmagan bo'lsa, odatdagi to'lov sanasi bilan ko'rinadi (masalan, "16-noyabr"). Sanasi o'tgani qizil ("kechikdi"), bugun–3 kun ichidagisi ajratib ko'rsatiladi, sarlavhada nechtasi kechikkani yoziladi. Bosilsa, o'tgan oydagi summa va hamyon bilan formaga tushadi. Odatdagi sana oxirgi oylardagi to'lov kunlarining o'rtachasi (mediana). Eng yaqin 4 tasi ko'rinadi, qolgani "Yana N ta" ostida.
  - **"+ Qo'shish"** bilan istalgan oylik to'lovni (maktab, bog'cha, internet va boshqa) summa, hamyon va har oydagi sanasi bilan o'zingiz qo'shasiz; ro'yxatdagilarni × bilan olib tashlaysiz. Ro'yxat Apps Script'ning `RECURRING` property'sida saqlanadi (ilova o'zi yozadi), shuning uchun telefonda ham, kompyuterda ham bir xil.
- **Chek rasmi yoki PDF.** Mikrofon oynasida "Chek rasmi yoki PDF" tugmasi bor: rasmni Gemini o'qiydi va yozuvni tekshirish uchun ko'rsatadi. Gemini kaliti kerak.
- **Internet yo'q bo'lsa.** Yozuv telefonda navbatga qo'yiladi ("navbatda" belgisi bilan) va internet qaytgach o'zi yuboriladi. Ilovani yopib ochsangiz ham navbat saqlanib qoladi. Javob yo'qolib, yozuv qayta yuborilsa ham sheetga ikki marta yozilmaydi.
- **Hamyonlar ixcham ko'rinadi:** doim Cash dollar, Cash sum, Card sum (shu tartibda) turadi, qolganlari (Visa, Master card) "Boshqa (2)" ni bosganda chiqadi. Yonida hammasining dollardagi jami summasi (so'mdagilar oxirgi kurs bo'yicha) turadi.
- **"Oxirgi yozuvlar"** faqat Chiqim bo'limida ko'rinadi: oxirgi 10 ta yozuv (kirim va almashtirishlar ham). "Yashirish" bilan yig'ib qo'yish mumkin, telefon buni eslab qoladi.

## O'rnatish

### 1. Apps Script

Sheetni tahrirlash huquqi bor Google akkaunt bilan bajaring.

1. [script.google.com](https://script.google.com) → **New project**. Botning Apps Script loyihasiga qo'shmang: ikkita `doPost` bir-biriga xalaqit beradi.
2. `Code.gs` ichidagi hamma narsani nusxalab qo'ying va saqlang.
3. **Project Settings → Script properties** ga quyidagi qiymatlarni qo'shing:
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

Maxfiylik: ovoz yozuvi (60 soniyagacha) yoki chek rasmi, hamda kategoriyalar ro'yxati tahlil uchun Google'ga yuboriladi. Bepul tarifda Google bu ma'lumotlardan o'z mahsulotlarini yaxshilash uchun foydalanishi mumkin. Buni istamasangiz, AI Studio'da billing'ni yoqing (pullik tarif), yoki kalitni qo'ymang: shunda ovoz tugmasi xato ko'rsatadi, qolgan hammasi ishlayveradi.

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
