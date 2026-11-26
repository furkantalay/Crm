/**
 * YENİ FUNNEL RANDEVULAR → CRM bağlantısı
 *
 * KURULUM (bir kez):
 *  1. Google Sheet'i açın → Uzantılar → Apps Script.
 *  2. Bu dosyanın tamamını yeni bir dosyaya yapıştırın (Dosyalar + → Komut dosyası → adı: CRM).
 *  3. Üstten "kurulum" fonksiyonunu seçip ▶ Çalıştır'a basın, Google'ın istediği izinleri verin.
 *  Bitti. Bundan sonra her 5 dakikada bir ve A sütununa (satışçı) bir şey yazıldığında CRM'e gönderir.
 *
 * Not: SYNC_TOKEN yalnız bu bağlantı için geçerli bir anahtardır; başkalarıyla paylaşmayın.
 */
const CRM_URL = 'https://unlcqrfaawhqzkgwzdbu.supabase.co/functions/v1/funnel-ingest';
const SYNC_TOKEN = '__SYNC_TOKEN__';
const SAYFA = 'TÜM DATA';
const SON_KAC_SATIR = 300;   // her çalışmada son kaç satır gönderilsin

function kurulum() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['crmGonder', 'crmDuzenleme'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('crmGonder').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('crmDuzenleme').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  crmGonder();
}

/** Son satırları CRM'e gönderir (tekrar gönderim güvenlidir, çift kayıt oluşmaz). */
function crmGonder() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SAYFA);
  if (!sh) throw new Error('"' + SAYFA + '" sayfası bulunamadı');
  const son = sh.getLastRow();
  if (son < 1) return;
  const ilk = Math.max(1, son - SON_KAC_SATIR + 1);
  gonder_(sh, ilk, son);
}

/** A sütununa satışçı yazıldığında o satırı hemen gönderir. */
function crmDuzenleme(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== SAYFA || e.range.getColumn() > 1) return;
  gonder_(sh, e.range.getRow(), e.range.getLastRow());
}

function gonder_(sh, ilk, son) {
  const degerler = sh.getRange(ilk, 1, son - ilk + 1, 9).getDisplayValues();
  const rows = degerler.map(function (hucre, i) {
    return { sheet: SAYFA, row: ilk + i, cells: hucre };
  }).filter(function (r) { return r.cells.join('').trim() !== ''; });
  if (!rows.length) return;
  const res = UrlFetchApp.fetch(CRM_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-token': SYNC_TOKEN },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('CRM hatası: ' + res.getContentText());
  console.log(res.getContentText());
}
