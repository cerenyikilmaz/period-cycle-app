# My Cycle 🌸 — Proje ve Devralma Rehberi

> **Durum (3 Kasım 2026):** Üretim frontend'i Cloudflare Workers Static Assets, zamanlanmış push hatırlatıcısı ayrı Cloudflare Worker, kimlik doğrulama ve veriler Supabase üzerindedir. Netlify eski altyapıdır ve artık kullanılmamalıdır.
>
> Bu belge, mevcut projeyi **devralmak, çalıştırmak, değiştirmek, yeniden yayınlamak ve gerekirse başka bir hesapta yeniden kurmak** için hazırlanmıştır. GitHub'a **asla** Supabase service-role anahtarı, VAPID private key veya kullanıcı parolası eklemeyin.

## 1. Hızlı başvuru

| Parça | Konum / teknoloji |
| --- | --- |
| Kaynak kod | https://github.com/cerenyikilmaz/period-cycle-app |
| Üretim uygulaması | https://mycycle.ceromony.workers.dev |
| Frontend Worker adı | `mycycle` |
| Push / cron Worker | `mycycle-reminders` |
| Push Worker adresi | https://mycycle-reminders.ceromony.workers.dev (sağlık mesajı, bildirim gönderme endpoint'i **değil**) |
| Supabase projesi | `https://wyoqezqvqztvrkqoqfjs.supabase.co` |
| Veritabanı | Supabase PostgreSQL |
| Kimlik doğrulama | Supabase Auth, e-posta / parola |
| Mobil kurulum | PWA: `manifest.webmanifest`, `sw.js` |
| Planlanmış bildirim | `0 9 * * *` UTC (Türkiye saati 12:00) |
| Önceki platform | Netlify — artık devre dışı bırakılmalı |

**Önemli:** Frontend ve hatırlatıcı **iki ayrı Worker**. Birini deploy etmek diğerini güncellemez. GitHub'a commit atmak, Cloudflare'da otomatik GitHub build bağlantısı kapalıysa üretimi güncellemez.

## 2. Hikâye: Nereden nereye geldik?

1. **İlk sürüm:** Tek dosyalı, pembe/bordo/krem tonlarında kişisel regl takip ekranı; başlangıç kayıtları tarayıcı `localStorage` alanındaydı.
2. **GitHub ve Netlify:** Statik frontend Netlify üzerinden yayınlandı; daha sonra Netlify Functions ile günlük push hatırlatıcısı eklendi.
3. **Buluta geçiş:** Supabase Auth ile giriş ve PostgreSQL tabloları ile kullanıcıya bağlı kalıcı kayıtlar eklendi. Eski `my-cycle-v1` localStorage kayıtlarını hesaba aktarma seçeneği korundu.
4. **PWA ve push:** Manifest, service worker, VAPID Web Push abonelikleri, cihaz bazlı aç/kapat ve gönderim günlüğü eklendi.
5. **Cloudflare'a geçiş:** Netlify kota/deploy engeli nedeniyle frontend `mycycle` Worker'ına, cron hatırlatıcıları `mycycle-reminders` Worker'ına taşındı.
6. **Gerçek cihaz doğrulaması:** iPhone ana ekranına kurulu uygulamada hedefli test bildirimi **başarıyla alındı**.
7. **Güncel deneyim:** “Geçmişin” liste bölümü kaldırıldı (kayıtlar silinmedi); sonraki regl için geri sayım, “Bugün” düğmesi, takvimde sağ/sol swipe, yumuşak ay geçişi, 6 satır sabit takvim ve ortalanmış açıklamalar eklendi.
8. **Döngü hesabı:** 15–60 gün aralığı filtresi kaldırıldı; ardışık başlangıçların tüm **pozitif** gün farkları istatistik ve tahminde kullanılıyor. Hatırlatıcı da aynı yöntemi kullanıyor.

Bu bir tıbbi teşhis veya doğum kontrolü aracı değildir; doğurganlık/ovülasyon tarihleri yaklaşık tahminlerdir.

## 3. Mimari

```text
iPhone PWA / Safari / Masaüstü
    |
    | HTTPS
    v
Cloudflare Worker: mycycle (statik dosyalar)
    | index.html + sw.js + manifest.webmanifest + icon.svg
    | Supabase JS SDK (tarayıcı, publishable key)
    v
Supabase Auth ------------------> Supabase PostgreSQL
    | oturum / JWT                  | profiles
    |                               | periods
    |                               | push_subscriptions
    |                               | push_delivery_log
    |
    +--> iPhone PushManager aboneliği --> push_subscriptions

Cloudflare Cron: mycycle-reminders (günlük UTC 09:00)
    | service-role ile DB'den kullanıcı verileri + abonelikler
    | döngü başlangıcı 2 gün sonra ise
    | web-push + VAPID PRIVATE KEY
    v
Apple/Browser Push Service --> iPhone PWA bildirimi
    |
    +--> push_delivery_log (aynı hedefe aynı tarih için tekrar gönderme kontrolü)
```

**Güvenlik sınırı:** Tarayıcıdaki Supabase `sb_publishable_...` anahtarı public olabilir; erişimi **RLS** kısıtlamalıdır. `SUPABASE_SERVICE_ROLE_KEY` ve `VAPID_PRIVATE_KEY` yalnızca sunucu Worker'ında Secret olmalıdır. Frontend'e veya GitHub'a konmamalıdır.

## 4. Dosya ağacı ve görevler

```text
period-cycle-app/
├── index.html                  # Tüm frontend HTML/CSS/JS; Supabase Auth, takvim, ayarlar
├── sw.js                       # Push event ve bildirime tıklama davranışı
├── manifest.webmanifest        # Ana ekrana eklenen PWA manifesti
├── icon.svg                    # Uygulama ikonu
├── package.json                # Tarihsel kök bağımlılıklar; frontend build gerektirmez
├── README.md                   # Bu doküman
└── reminders/
    ├── wrangler.toml           # mycycle-reminders adı, nodejs_compat, keep_vars, cron
    ├── package.json            # Supabase, web-push, Wrangler
    └── src/index.js            # Zamanlanmış bildirim kodu
```

**Kritik:** Yerel kökte `wrangler.jsonc` bulunabilir; GitHub'da takip edilen dosya olmayabilir. Kök dizinden körlemesine `wrangler deploy` yapmayın. Bir defasında `reminders/node_modules/workerd/bin/workerd` (~140 MiB) statik asset olarak yüklenmeye çalışıldığı için 25 MiB sınır hatası oluştu. Sadece dört statik dosyayı ayrı bir klasörden deploy edin.

## 5. Ön koşullar ve ilk kurulum

- Git, Node.js LTS ve npm
- GitHub reposuna erişim
- Cloudflare hesabında Workers deploy yetkisi
- Supabase projesinde Auth / Database / API erişimi
- macOS Terminal örnekleri aşağıda; diğer sistemlerde klasör yolu değişir

```bash
git clone https://github.com/cerenyikilmaz/period-cycle-app.git
cd period-cycle-app
node --version
npm --version
```

**Frontend** için build aracı gerekmiyor: `index.html` statik dosyadır ve Supabase UMD SDK'sını CDN'den yükler. `file://` üzerinden açmak Auth/PWA davranışını güvenilir şekilde test etmez. Lokal statik sunucu için:

```bash
python3 -m http.server 8080
# http://localhost:8080
```

Service worker ve push özellikleri güvenli bağlam gerektirir; gerçek iPhone push testi için HTTPS üzerindeki deploy edilmiş PWA'yı kullanın.

## 6. Supabase: Auth, veriler ve güvenlik

### 6.1 Mevcut bağlantı

`index.html` içinde `URL` ve `APIKEY` sabitleri bulunur. `URL` mevcut Supabase proje adresidir; `APIKEY` **publishable** anahtardır. Yeni Supabase projesine taşınırken bunlar değiştirilir.

Supabase panelinde:
- **Authentication → Providers:** e-posta/parola girişini yapılandırın.
- **Authentication → URL Configuration:** üretim Cloudflare URL'sini Site URL ve gerekli Redirect URLs listesine ekleyin.
- **Project Settings / API Keys:** frontend için publishable key, Worker için server-side service-role key alın.
- **Database → Tables / SQL Editor:** aşağıdaki tabloları ve RLS politikalarını inceleyin.

### 6.2 Veri modeli (uygulama kodunun beklediği alanlar)

| Tablo | Uygulamada kullanılan alanlar | Kullanım |
| --- | --- | --- |
| `profiles` | `user_id`, `cycle_length`, `period_length`, `updated_at` | Kullanıcının varsayılan döngü ve regl süresi |
| `periods` | `user_id`, `start_date` | Kaydedilen regl başlangıçları; aynı kullanıcı+tarih tekrar etmemeli |
| `push_subscriptions` | `user_id`, `endpoint`, `subscription`, `enabled` | Cihaz başına Web Push aboneliği; `endpoint` upsert çakışma anahtarı |
| `push_delivery_log` | `id`, `user_id`, `predicted_date` | Aynı abonelik / tahmini tarih için mükerrer gönderimi azaltma |

**Şema notu:** Bu repoda doğrulanmış SQL migration dosyası yok. Bu tablo, uygulama sorgularından çıkarılmış **alan sözleşmesidir**; mevcut Supabase projesindeki tam SQL türlerini, PK/FK, index, default, RLS ve grant'leri SQL Editor'dan **export ederek ayrıca sürüm kontrolüne alın**. Bu olmadan farklı bir Supabase projesinde birebir yeniden kurulum garanti edilemez. Aşağıdaki örnek yalnızca başlangıç taslağıdır; mevcut üretim şemasını sorgulamadan uygulamayın.

```sql
-- MEVCUT PROJEYE KÖRLEMESİNE UYGULAMAYIN; YENİ KURULUM TASLAĞI
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cycle_length integer not null default 28,
  period_length integer not null default 5,
  updated_at timestamptz not null default now()
);
create table public.periods (
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  primary key (user_id, start_date)
);
create table public.push_subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text primary key,
  subscription jsonb not null,
  enabled boolean not null default true
);
create table public.push_delivery_log (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  predicted_date date not null
);
alter table public.profiles enable row level security;
alter table public.periods enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_delivery_log enable row level security;
create policy "profiles owner" on public.profiles for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "periods owner" on public.periods for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "subscriptions owner" on public.push_subscriptions for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
-- Delivery log yalnızca service-role tarafından kullanılmalı; authenticated için politika açmayın.
```

**Üretim güvenlik kontrolü:** `anon` ve `authenticated` rolleri yalnızca gerekli işlemleri yapabilmeli; RLS testini farklı iki kullanıcı hesabıyla doğrulayın. `service_role` RLS'yi atlayabilir, dolayısıyla sadece sunucuda kullanılır. `push_subscriptions.subscription` push endpoint/anahtar bilgileri içerir; hassas veri olarak ele alın. Supabase yedekleme ve veri saklama/silme politikalarını ayrıca yapılandırın.

### 6.3 Kullanıcı akışları

- Giriş: `client.auth.signInWithPassword`; oturum Supabase istemcisiyle saklanır.
- Profil: `profiles` tablosuna `user_id` üzerinden upsert.
- Regl başlangıcı: takvimde gün seçilir; `periods` kaydı eklenir veya silinir.
- Eski veriler: `localStorage['my-cycle-v1']` içindeki kayıtlar isteğe bağlı içe aktarılabilir.
- “Geçmişin” liste bileşeni kaldırılmıştır; veritabanındaki kayıtlar durur ve takvimde görünür.

## 7. Döngü ve bildirim hesapları

`index.html` içindeki `cycleIntervals()`, sıralı başlangıç tarihlerinin **pozitif** gün farklarını alır. En kısa/en uzun/ortalama bu farklardan hesaplanır. `effectiveCycle()`, en az **iki aralık** varsa yuvarlanmış ortalamayı kullanır; yoksa profildeki `cycle_length` değerini kullanır. Bu nedenle tek aralık istatistiklerde görünebilir ama tahmini otomatik değiştirmeyebilir.

`reminders/src/index.js` içindeki `nextDate()` aynı pozitif aralık kuralıyla tahmin üretir. En son başlangıç + hesaplanan döngü; geçmişte kalmışsa ileriye taşınır. Cron günü `today + 2 gün == predicted` olduğunda bildirim denenir. Tarih hesapları kodda UTC üzerinden yapılır; günlük cron UTC 09:00'dadır.

**Kısıt:** Bu bir tahmin algoritmasıdır; döngüler değişken olabilir. Çok kısa/uzun aralıklar da dahil edildiği için hatalı girilmiş tarih tahminleri saptırabilir. Doğum kontrolü için kullanmayın.

## 8. Web Push / VAPID

### 8.1 Abonelik nasıl çalışıyor?

1. Kullanıcı uygulamayı HTTPS üzerinde açar; iPhone'da Safari'den **Ana Ekran'a Ekle** ile PWA kurar.
2. Uygulamada bildirimleri açar, işletim sistemi izni verir.
3. `sw.js` service worker kaydedilir.
4. Tarayıcı `PUSH_PUBLIC_KEY` ile PushManager aboneliği oluşturur.
5. `subscription.toJSON()`, `endpoint` ve `user_id` Supabase `push_subscriptions` tablosuna yazılır.
6. `mycycle-reminders` cron Worker'ı service-role ile aktif abonelikleri ve dönemleri okur.
7. `web-push`, aynı VAPID çiftinin **private** anahtarıyla bildirimi push servisine iletir.
8. `sw.js` gelen push event'inde `showNotification` çağırır; tıklamada uygulamayı açar.

**VAPID anahtar çiftini keyfi yenilemeyin.** Mevcut abonelikler eski public key'e bağlıdır. Yeni anahtar üretmek cihazlarda yeniden abonelik gerektirebilir.

### 8.2 Worker ortam değişkenleri

Cloudflare → **Workers & Pages → mycycle-reminders → Settings → Variables and Secrets**:

| Ad | Tür | Açıklama |
| --- | --- | --- |
| `SUPABASE_URL` | Text | Supabase proje URL'si |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Server-side erişim; asla paylaşma |
| `VAPID_PUBLIC_KEY` | Text | `index.html` içindeki `PUSH_PUBLIC_KEY` ile **aynı** |
| `VAPID_PRIVATE_KEY` | **Secret** | Aynı VAPID çiftinin private anahtarı |
| `VAPID_CONTACT_EMAIL` | Text (opsiyonel) | VAPID iletişim e-postası; yoksa kod fallback kullanır |
| `TEST_USER_ID` | Text (geçici) | Yalnızca hedefli test için Supabase Auth UID |
| `TEST_RUN_ID` | Text (geçici) | Tek seferlik test kimliği |

`reminders/wrangler.toml` içinde **`keep_vars = true`** vardır. Bu kritik: Wrangler deploy sırasında Cloudflare panelindeki `Text` değişkenlerinin silinmesi yaşandı. `keep_vars` ayarını kaldırmayın. Deploy sonrasında tüm gerekli değişkenleri kontrol edin.

**Gizli anahtarlar kaybolduysa:** mevcut güvenli parola kasasından geri yükleyin. GitHub'a veya destek mesajlarına yapıştırmayın.

### 8.3 Tekrarlı gönderim ve test

Üretim cron'u `0 9 * * *`. Daha önce test için geçici `*/5 * * * *` cron'u kullanıldı ve iPhone'a **“Minik bir deneme bildirimi 💗”** başarıyla ulaştı. Bu 5 dakikalık cron artık yapılandırmadan kaldırılmıştır.

Kodda `sendOneTimeTest()` hâlâ bulunur; yalnızca `*/5 * * * *` cron tetiklenirse çağrılır. `TEST_*` değişkenleri artık üretim için gerekli değildir; test bitince panelden kaldırılabilir.

Üretim gönderiminden önce `push_delivery_log` içinde SHA-256 tabanlı `id` aranır. Push başarıyla kabul edildikten sonra kayıt yazılır. **Bu tam anlamıyla atomik exactly-once garantisi değildir**; gönderimden sonra DB yazma hatasında tekrar deneme riski vardır.

## 9. Deploy — EN ÖNEMLİ OPERASYON BÖLÜMÜ

### 9.1 Her değişiklikten önce

```bash
cd ~/Desktop/period-cycle-app
git status
git pull
```

`git status` yerel değişiklik gösteriyorsa önce bunları gözden geçirin; `git pull` üzerine yazma/merge çatışması doğurabilir.

### 9.2 Frontend deploy (`mycycle`)

**Yalnızca dört dosyayı yükleyin.** `node_modules`, `.git`, `reminders` veya tüm repo yüklenmemeli.

```bash
cd ~/Desktop/period-cycle-app
mkdir -p .cloudflare-deploy
cp index.html sw.js manifest.webmanifest icon.svg .cloudflare-deploy/
npx wrangler deploy --name mycycle --assets ./.cloudflare-deploy
```

Komut `npx` üzerinden Wrangler yüklemek isteyebilir. `wrangler.jsonc` veya yerel başka config yanlış `assets.directory` içeriyorsa, komutun hangi Worker'ı ve hangi dizini hedeflediğini kontrol edin. **Deploy çıktısında Worker adının `mycycle` olduğunu doğrulayın.**

Canlı kontrol: https://mycycle.ceromony.workers.dev — Safari'de yeni sürümü kontrol edin, sonra ana ekrandaki PWA'yı kapatıp açın. PWA eski içeriği gösteriyorsa cache/service worker kaynaklı olabilir; **önce PWA'yı silmeyin**, bildirim aboneliği kaybolabilir.

### 9.3 Bildirim Worker deploy (`mycycle-reminders`)

```bash
cd ~/Desktop/period-cycle-app/reminders
npm install
npx wrangler login          # ilk kullanımda
npx wrangler deploy --config ./wrangler.toml
```

Beklenen çıktı:
```text
Uploaded mycycle-reminders
Deployed mycycle-reminders triggers
schedule: 0 9 * * *
```

**Eğer `*/5 * * * *` de görünüyorsa test cron'u hâlâ açık demektir**; `wrangler.toml` güncel mi kontrol edin. Deploy sonrası `Variables and Secrets` içindeki dört zorunlu değişkeni doğrulayın.

### 9.4 Canlı loglar

```bash
cd ~/Desktop/period-cycle-app/reminders
npx wrangler tail mycycle-reminders --format pretty
# çıkmak için Ctrl+C
```

Cloudflare → `mycycle-reminders` → Observability → Logs bölümünden de inceleyebilirsiniz.

`"0 9 * * *" - Ok` yalnızca cron'un başarıyla tamamlandığını gösterir; push'un telefona ulaştığını **kanıtlamaz**. Kodun `Reminder run {"sent":N,"failed":M}` kaydı, sunucu tarafındaki sonucu verir. `Push delivery failed` hatalarını ayrıca inceleyin.

### 9.5 Yayın sonrası kontrol listesi

- [ ] Üretim adresi açılıyor; Auth giriş/çıkış çalışıyor.
- [ ] Yeni regl başlangıcı kaydedilip sayfa yenilenince korunuyor.
- [ ] Takvim okları, swipe, Bugün ve 6 satırlık sabit alan çalışıyor.
- [ ] En kısa/en uzun/ortalama hesapları beklenen değerleri gösteriyor.
- [ ] Worker secret/text değişkenleri duruyor.
- [ ] Cron yalnızca `0 9 * * *` gösteriyor.
- [ ] iPhone PWA bildirim izni/abonelik durumu korunuyor.
- [ ] Tarayıcı ve PWA görünümü aynı sürümde.

## 10. Netlify'yı tamamen kapatma (hesap tarafı)

**Kod temizliği tek başına Netlify'daki siteyi silmez.** Bu adımları Netlify panelinde yetkili kullanıcı yapmalı:

1. Önce Cloudflare frontend ve günlük cron'un çalıştığını doğrulayın.
2. Netlify Dashboard'da eski `myperiodcycle.netlify.app` sitesini seçin.
3. **Site configuration / General / Danger zone** bölümündeki **Delete site** (arayüz adı değişebilir) işlemiyle eski siteyi kaldırın. Bu, eski `netlify.app` URL'sini de kapatır; geri dönüş gerekebilecekse önce arşivleyin.
4. Netlify'da varsa eski siteye bağlı GitHub otomatik deploy bağlantısını ve siteye özel environment variables'ı kontrol edin.
5. Eski Netlify scheduled function'ın artık çalışmadığını doğrulayın; aynı anda iki hatırlatıcı çalışması istenmez.
6. Netlify hesabını **tamamen kapatmak** site silmekten farklıdır: başka site veya abonelik yoksa Account Settings üzerinden ayrıca hesap kapatma / ödeme ayarlarını değerlendirin.
7. Supabase Auth Redirect URLs / Site URL içinde eski Netlify adresi varsa, Cloudflare akışları test edildikten sonra kaldırın.
8. iPhone'da **Netlify alan adından** kurulmuş eski PWA varsa yeni Cloudflare alan adıyla karıştırmayın. Farklı origin'lerin service worker ve push abonelikleri birbirinden bağımsızdır.

Bu repo artık Netlify yapılandırması ve fonksiyon kodu içermemelidir. GitHub dosyalarını kaldırmak **Netlify hesabındaki siteyi otomatik silmez**.

## 11. Hata çözümü

| Belirti | Olası sebep | Kontrol / çözüm |
| --- | --- | --- |
| `Asset too large`, `workerd` 140 MiB | Tüm repo veya `node_modules` assets dizini seçilmiş | Frontend için yalnızca `.cloudflare-deploy` kullanın |
| `wrangler secret list` boş | Yanlış Worker veya Text değişkenleri listelenmiyor | `npx wrangler secret list --name mycycle-reminders`; Text'leri panelde kontrol edin |
| Deploy sonrası Text değişkenleri kayboldu | `keep_vars` eksikti | `reminders/wrangler.toml` içinde `keep_vars = true`; panelde geri ekleyin |
| Cron `Ok`, bildirim yok | Test env yok, abone yok, push hatası veya tarih koşulu sağlanmadı | `wrangler tail`, `push_subscriptions`, `Reminder run` logları |
| Test mesajı hiç yok | Test cron'u yok veya `TEST_*` okunmuyor | Üretimde test cron'u bilerek kapalıdır; kalıcı olarak açmayın |
| Safari yeni, iPhone PWA eski | PWA cache / eski origin | PWA'yı kapat-aç; service worker ve deploy edilen origin'i kontrol et |
| Bildirim izni açık ama gelmiyor | Push aboneliği/endpoint eski, VAPID uyuşmuyor | PWA içinden bildirimleri kapatıp yeniden açmayı deneyin; secret'ı değiştirmeyin |
| DB erişim hatası | RLS, yetki, yanlış project URL/key | Supabase Logs, Auth session, RLS politikalarını kontrol edin |
| Takvimde beklenmedik tahmin | Hatalı başlangıç tarihi / az veri | Kayıtları ve `cycleIntervals` hesabını kontrol edin |
| Deploy yaptım ama değişmedi | Yanlış Worker veya PWA cache | Deploy çıktısındaki isim, üretim URL'si, Safari/PWA karşılaştırması |

## 12. Güvenlik, bakım ve devralma

- GitHub repo erişimlerini ve Cloudflare/Supabase rollerini en az yetkiyle verin.
- `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, kullanıcı parolaları ve tam push subscription payload'larını commit/log paylaşımına koymayın.
- Supabase RLS politikalarını ve yedekleme/geri yükleme prosedürünü **gerçek projede** doğrulayın.
- Düzenli aralıklarla Cloudflare Worker hata loglarını, cron'u, Supabase kullanım limitlerini ve maliyetleri kontrol edin.
- Bildirim aboneliği temizliği 404/410 hatalarında kod tarafından yapılır; tekrar eden hataları izleyin.
- Yeni Supabase projesine geçişte önce SQL şema + RLS + Auth ayarları, sonra kullanıcı/veri migrasyonu, sonra frontend publishable key/URL, Worker service-role/URL ve en son yeni domain için cihaz abonelikleri planlanmalıdır.
- **Yeniden kurulumda** VAPID anahtar çiftini yeni üretebilirsiniz; ancak mevcut kullanıcı aboneliklerini korumak istiyorsanız mevcut çifti güvenli kasadan geri alın.
- Tarayıcıdan `index.html` kaynak kodu görülebilir; frontend'e hiçbir gizli anahtar koymayın.
- Üretim değişikliklerinden önce `git status`, sonra `git pull`; iki Worker'ı yalnızca ilgili kod değişmişse deploy edin.
- Yeni bakımcı için eksik kritik artefakt: **Supabase üretim şemasının ve RLS politikalarının sürümlenmiş SQL migration/export'u**. Bu tamamlanmadan “tamamen sıfırdan otomatik kurulum” iddiasında bulunmayın.

## 13. Gelecek iyileştirmeler

1. Supabase SQL migration'ları, RLS testleri ve seed/test verisi.
2. Frontend için açık ve takip edilen Cloudflare Wrangler config'i (kök dizinde tesadüfi `wrangler.jsonc` bağımlılığı olmadan).
3. Service worker sürüm güncelleme / cache yönetimi; iPhone PWA'nın eski ekranı göstermesini azaltma.
4. Döngü hesabı için birim testleri (ay sonu, yıl sonu, artık yıl, az kayıt, aykırı değer).
5. Zamanlanmış bildirim için daha sağlam idempotency / teslimat loglama.
6. Gizlilik politikası, hesap/veri silme ve yedekleme prosedürü.

---

**Operasyon özeti:** `git pull` → yalnızca değişen Worker'ı deploy et → Cloudflare Variables/Secrets kontrolü → Safari ve iPhone PWA kontrolü → cron/log kontrolü. **Netlify'ya artık deploy yapılmaz.**
