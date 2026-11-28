/**
 * ANA HAT DATA (SELEN ŞAHİN dosyası) → CRM bağlantısı
 *
 * KURULUM (bir kez): Uzantılar → Apps Script → bu kodu yapıştır → "anaHatKurulum" seç → ▶ Çalıştır → izin ver.
 * Sonra: her 5 dakikada bir ve satıra telefon/isim/satışçı yazıldığında CRM'e gönderir.
 * Tekrar gönderim güvenlidir; aynı satır iki kez data oluşturmaz, aynı numara mükerrer olarak işlenir.
 * SYNC_TOKEN yalnız bu bağlantı içindir; paylaşmayın.
 */
const CRM_URL = 'https://unlcqrfaawhqzkgwzdbu.supabase.co/functions/v1/funnel-ingest';
const SYNC_TOKEN = '__SYNC_TOKEN__';
const SAYFA = 'ANA HAT DATA';
const SON_KAC_SATIR = 150;   // her çalışmada telefonu olan son kaç satıra bakılsın

function anaHatKurulum() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['anaHatGonder', 'anaHatDuzenleme'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('anaHatGonder').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('anaHatDuzenleme').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  anaHatGonder();
}

/** Sayfada önceden doldurulmuş boş satırlar olduğu için son satırı telefon sütununa (C) göre bulur. */
function sonDoluSatir_(sh) {
  const c = sh.getRange(1, 3, sh.getMaxRows(), 1).getDisplayValues();
  for (let i = c.length - 1; i >= 1; i--) if (String(c[i][0]).trim() !== '') return i + 1;
  return 1;
}

function anaHatGonder() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SAYFA);
  if (!sh) throw new Error('"' + SAYFA + '" sayfası bulunamadı');
  const son = sonDoluSatir_(sh);
  if (son < 2) return;
  gonder_(sh, Math.max(2, son - SON_KAC_SATIR + 1), son);
}

/** A-F sütunlarında değişiklik olunca o satırları hemen gönderir. */
function anaHatDuzenleme(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== SAYFA || e.range.getColumn() > 6 || e.range.getRow() < 2) return;
  gonder_(sh, e.range.getRow(), Math.min(e.range.getLastRow(), e.range.getRow() + 200));
}

function gonder_(sh, ilk, son) {
  const degerler = sh.getRange(ilk, 1, son - ilk + 1, 7).getDisplayValues();
  const rows = degerler.map(function (h, i) { return { sheet: SAYFA, row: ilk + i, cells: h }; })
    .filter(function (r) { return String(r.cells[2]).trim() !== ''; });   // telefonu olmayanlar gönderilmez
  if (!rows.length) return;
  const res = UrlFetchApp.fetch(CRM_URL, {
    method: 'post', contentType: 'application/json',
    headers: { 'x-sync-token': SYNC_TOKEN },
    payload: JSON.stringify({ rows: rows }), muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('CRM hatası: ' + res.getContentText());
  console.log(res.getContentText());
}
