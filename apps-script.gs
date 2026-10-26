/**
 * ============================================================================
 *   فرح كريم & مها  —  Google Apps Script (خدمة واحدة لكل حاجة)
 *   ------------------------------------------------------------
 *   بيخدم حاجتين:
 *     1) تأكيد الحضور (RSVP)  →  يتسجل في شيت + يوصلك إيميل فوري
 *     2) حائط الأمنيات        →  كل الناس تكتب، وكل الناس تشوف (مشترك فعلًا)
 *
 *   ============  خطوات التركيب (٥ دقايق)  ============
 *   1) افتح الشيت اللي عملته للـRSVP  (اللي فيه اللينك AKfycb... )
 *   2) من القائمة:  Extensions  >  Apps Script
 *   3) امسح كل الكود اللي موجود، والصق الكود ده كله مكانه
 *   4) بدّل EMAIL_TO في أول السطور تحت بإيميلك
 *   5) اضغط  Deploy  >  New deployment  (أو Manage deployments > تعديل)
 *        - Type: Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      ثم Deploy ووافق على الصلاحيات.
 *   6) لو اللينك اتغير، حطه في CONFIG.sheetEndpoint جوه index.html
 *      (لو اللينك زي ما هو، مش محتاج تعمل حاجة)
 *
 *   ملاحظة مهمة: بعد أي تعديل في الكود لازم تعمل Deploy جديد
 *   (Manage deployments > ✏️ > Version: New version > Deploy).
 * ============================================================================
 */

/* ===================== الإعدادات ===================== */
var EMAIL_TO   = 'YOUR_EMAIL@gmail.com';   // ← بدّل ده بإيميلك
var RSVP_SHEET = 'RSVP';                   // اسم شيت الحضور (لو مش موجود هيتعمل)
var WISH_SHEET = 'Wishes';                 // اسم شيت الأمنيات (هيتعمل تلقائيًا)
var MAX_WISHES = 60;                       // أقصى عدد أمنيات بيترجع للصفحة
var MAX_LEN    = 240;                      // أقصى طول للأمنية

/* ===================== GET ===================== */
function doGet(e) {
  var p = (e && e.parameter) || {};

  if (p.type === 'wishes') {
    var list = getWishes_(Number(p.limit) || MAX_WISHES);
    return out_(list, p.callback);
  }

  return out_({
    ok: true,
    service: 'kareem-maha-wedding',
    time: new Date().toISOString()
  }, p.callback);
}

/* ===================== POST ===================== */
function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    body = (e && e.parameter) || {};
  }

  if (body.type === 'wish') return addWish_(body);
  return addRsvp_(body);
}

/* ===================== الأمنيات ===================== */
function addWish_(b) {
  var name = clean_(b.name, 40);
  var text = clean_(b.text, MAX_LEN);

  if (!name || !text)      return out_({ ok: false, error: 'empty' });
  if (/https?:\/\//i.test(name + ' ' + text)) return out_({ ok: false, error: 'links' });
  if (linksOnly_(text))    return out_({ ok: false, error: 'spam' });

  var sh = sheet_(WISH_SHEET, ['id', 'الاسم', 'الأمنية', 'الوقت']);
  var id = 'w' + Date.now() + Math.floor(Math.random() * 900 + 100);

  sh.appendRow([id, name, text, new Date()]);
  clearCache_();

  return out_({
    ok: true,
    wish: { id: id, n: name, t: text, at: new Date().toISOString() }
  });
}

function getWishes_(limit) {
  var cache = CacheService.getScriptCache();
  var ckey = 'wishes_v1_' + limit;
  try {
    var hit = cache.get(ckey);
    if (hit) return JSON.parse(hit);
  } catch (e) {}

  var sh = sheet_(WISH_SHEET, ['id', 'الاسم', 'الأمنية', 'الوقت']);
  var last = sh.getLastRow();
  var res = [];
  if (last >= 2) {
    var start = Math.max(2, last - limit + 1);
    var rows = sh.getRange(start, 1, last - start + 1, 4).getValues();
    for (var i = rows.length - 1; i >= 0; i--) {
      var r = rows[i];
      var t = String(r[2] || '').trim();
      if (!t) continue;
      res.push({
        id: String(r[0] || ''),
        n: String(r[1] || 'ضيف'),
        t: t,
        at: r[3] ? new Date(r[3]).toISOString() : ''
      });
      if (res.length >= limit) break;
    }
  }

  try { cache.put(ckey, JSON.stringify(res), 45); } catch (e) {}
  return res;
}

/* ===================== تأكيد الحضور ===================== */
function addRsvp_(b) {
  var name = clean_(b.name, 60);
  if (!name) return out_({ ok: false, error: 'noname' });

  var attending = (b.attending === 'no') ? 'لا' : 'نعم';
  var guests    = Number(b.guests) || 0;
  if (attending === 'لا') guests = 0;

  var sh = sheet_(RSVP_SHEET, ['الاسم', 'الحضور', 'عدد الأفراد', 'رسالة', 'وقت الضيف', 'وقت الاستلام']);
  sh.appendRow([name, attending, guests, clean_(b.note, 400), b.at || '', new Date()]);

  /* إيميل فوري (اختياري — لو فشل مش بيوقف التسجيل) */
  try {
    if (EMAIL_TO && EMAIL_TO.indexOf('@') > 0) {
      MailApp.sendEmail({
        to: EMAIL_TO,
        subject: '🎉 تأكيد حضور جديد — ' + name,
        htmlBody:
          '<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;line-height:1.9">' +
          '<h2 style="color:#b96a7d;margin:0 0 12px">تأكيد حضور جديد</h2>' +
          '<p><b>الاسم:</b> ' + esc_(name) + '</p>' +
          '<p><b>الحضور:</b> ' + attending + '</p>' +
          '<p><b>عدد الأفراد:</b> ' + (guests || 0) + '</p>' +
          '<p><b>رسالة:</b> ' + (esc_(b.note) || '—') + '</p>' +
          '<hr style="border:0;border-top:1px solid #eee">' +
          '<p style="color:#999;font-size:12px">فرح كريم & مها — 13 مارس 2027</p>' +
          '</div>'
      });
    }
  } catch (err) {}

  return out_({ ok: true });
}

/* ===================== أدوات ===================== */
function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setColumnWidth(1, 40);
    sh.setColumnWidth(2, 170);
    sh.setColumnWidth(3, 420);
  }
  return sh;
}

function clean_(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, max || 240);
}

/* منع الرسائل اللي كلها لينكات */
function linksOnly_(s) {
  var noLinks = s.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, '');
  return noLinks.length < 4 && /https?:\/\//i.test(s);
}

function esc_(s) {
  return String(s || '').replace(/[&<>"]/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
  });
}

function out_(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function clearCache_() {
  try { CacheService.getScriptCache().remove('wishes_v1_' + MAX_WISHES); } catch (e) {}
}

/* ===================== تجربة سريعة ===================== */
function test_addWish() {
  addWish_({ name: 'تجربة', text: 'ألف مبروك يا كريم ومها ❤' });
  Logger.log(getWishes_(20));
}

function test_addRsvp() {
  addRsvp_({ name: 'تجربة', attending: 'yes', guests: 2, note: 'اختبار', at: new Date().toISOString() });
}
