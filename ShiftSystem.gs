/**
 * @OnlyCurrentDoc
 * Cruto Shift System - Master Edition (Final Fixed)
 * ----------------------------------------------------------------
 * [修正] ReferenceError: code is not defined を解消
 * [修正] 勤務日種別・出勤時刻・退勤時刻 列をCSV出力時に空白化
 */

const CONFIG = {
  OUTPUT_FOLDER_ID: '1v_zVQ_3doi9IPRzKZmoDDkg6vW0P04jL',
  LOG_SHEET_NAME: 'ログ',
  MASTER_SS_ID: '1pBdurGwlfeyPik2k96QF5YYbkHaEnfZ41cQEOCe95Qw',
  SS_ID_MAP: {
    '嘉島': '1tqV3mn4ZLsXmJbc_Tj71VXlOFWpMGWju5QU4SBwe7Fw',
    '佐土原': '1tqV3mn4ZLsXmJbc_Tj71VXlOFWpMGWju5QU4SBwe7Fw',
    '宇城': '1tqV3mn4ZLsXmJbc_Tj71VXlOFWpMGWju5QU4SBwe7Fw',
    '新土河原': '1tqV3mn4ZLsXmJbc_Tj71VXlOFWpMGWju5QU4SBwe7Fw',
    '玉名': '1otEOV1JH1tumYI1AxxEv2v64WLaqFuEt8My1YYsOfoc',
    '山鹿': '1otEOV1JH1tumYI1AxxEv2v64WLaqFuEt8My1YYsOfoc',
    'cocoro光の森&玉名': '19PNMQNZtIfBJ1Z5Z38pZKIym7eBjm6I8mn-paE-d44I',
    'cocoro城南': '18Sgg5xnfjI4A7z5R1FpgBWvX8R-dTuz2oifImDa2aek',
    '早良': '1m-ubeF4ajwxqdnvrKtwIF610XQ659GjzI7IsVn5hSuo',
    '薩摩川内': '1a65mGgWKxTUHMq7Ruy8te5cdWZ8dk_2U-pTPIXDQi0c',
    '日置': '1kq1nLzb9hRiA6GQbdqJ7zPdkkZ-6PIgGXg_-ZjeE7_8',
    '大矢野': '1bQvrMe5Epy1kR1G0s7RO39FBNROLTimD8ZSJoGMoNFs',
    '菊池': '1BKhezSrjkFV-XW4To-1CGrY901R1-ROERk93Y8GVTSo',
    '呉服': '1r2mzsx82meizFqxTQnPp65cDfq-4lonL_Zdmdwq5ZmA',
    'グルホ': '1zC-M-Wth72_1nVxnBassyRh-VCkNxddtbOBBD_0sujo'
  }
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Cruto Menu').addItem('CSV生成を実行', 'showLoading').addToUi();
}

function showLoading() {
  const html = HtmlService.createHtmlOutputFromFile('Loading').setWidth(450).setHeight(320);
  SpreadsheetApp.getUi().showModalDialog(html, ' ');
}

function getStaffMaster() {
  const ss = SpreadsheetApp.openById(CONFIG.MASTER_SS_ID);
  const sheet = ss.getSheetByName('職員管理');
  const staffMap = {};
  if (sheet) {
    const data = sheet.getRange("A2:B" + sheet.getLastRow()).getValues();
    data.forEach(row => {
      const nameKey = String(row[0] || "").replace(/\s+/g, "");
      if (nameKey) staffMap[nameKey] = row[1];
    });
  }
  return staffMap;
}

function getShiftMaster() {
  const ss = SpreadsheetApp.openById(CONFIG.MASTER_SS_ID);
  const master = {};
  ['看護', 'リハ&ケアステ', 'グルホ'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const data = sheet.getRange("A2:C" + sheet.getLastRow()).getValues();
    master[name] = {};
    data.forEach(row => {
      const code = String(row[0] || "").trim();
      if (code) {
        master[name][code] = {
          start: row[1] ? Utilities.formatDate(new Date(row[1]), "JST", "HH:mm") : "",
          end: row[2] ? Utilities.formatDate(new Date(row[2]), "JST", "HH:mm") : ""
        };
      }
    });
  });
  return master;
}

function cleanText(text) {
  if (!text) return "";
  return text.trim().replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/＆/g, "&");
}

function runProcess() {
  const ui = SpreadsheetApp.getUi();
  let user = "Unknown";
  try { user = Session.getActiveUser().getEmail(); } catch(e) {}

  const locRes = ui.prompt('Location', '事業所名を入力してください。', ui.ButtonSet.OK);
  const selLoc = cleanText(locRes.getResponseText());
  const ssId = CONFIG.SS_ID_MAP[selLoc];
  if (!ssId) throw new Error('事業所名が見つかりませんでした。');

  const monthRes = ui.prompt('Target Month', '対象年月を入力してください。\n(例: 2026年3月)', ui.ButtonSet.OK);
  const targetMonth = cleanText(monthRes.getResponseText());

  let jobSheets = [];
  if (selLoc === 'グルホ') {
    jobSheets.push({ name: cleanText(ui.prompt('Sheet Name', 'グルホのシート名を入力してください。', ui.ButtonSet.OK).getResponseText()), type: 'グルホ' });
  } else if (selLoc === '大矢野') {
    jobSheets.push({ name: cleanText(ui.prompt('Sheet 1', '看護のシート名を入力してください。', ui.ButtonSet.OK).getResponseText()), type: '看護' });
    jobSheets.push({ name: cleanText(ui.prompt('Sheet 2', 'リハビリのシート名を入力してください。', ui.ButtonSet.OK).getResponseText()), type: 'リハ&ケアステ' });
    jobSheets.push({ name: cleanText(ui.prompt('Sheet 3', 'ケアステのシート名を入力してください。', ui.ButtonSet.OK).getResponseText()), type: 'リハ&ケアステ' });
  } else {
    jobSheets.push({ name: cleanText(ui.prompt('Sheet 1', 'メイン（看護等）のシート名を入力してください。', ui.ButtonSet.OK).getResponseText()), type: '看護' });
    const s2 = cleanText(ui.prompt('Sheet 2', 'リハビリのシート名（空欄OK）', ui.ButtonSet.OK).getResponseText());
    if (s2) jobSheets.push({ name: s2, type: 'リハ&ケアステ' });
  }

  const uploadType = cleanText(ui.prompt('Type', '「予定」または「実績」', ui.ButtonSet.OK).getResponseText());

  try {
    const staffMaster = getStaffMaster();
    const shiftMaster = getShiftMaster();
    const ss = SpreadsheetApp.openById(ssId);
    const csvRows = [['従業員番号', 'freee人事労務での表示名（編集しても反映されません）', '日付', '勤務パターンコード', '勤務日種別', '出勤時刻', '退勤時刻', '休憩時間', '休憩開始1', '休憩終了1', '休憩開始2', '休憩終了2', '休憩開始3', '休憩終了3', '夜勤日種別']];

    jobSheets.forEach((job, sheetIdx) => {
      const sheet = ss.getSheetByName(job.name);
      if (!sheet) return;
      const layout = getLayout(selLoc, sheetIdx);

      const dateValues = sheet.getRange(layout.dateRange).getValues()[0];
      const ym = targetMonth.match(/(\d{4})年(\d{1,2})月/);
      const y = ym ? parseInt(ym[1]) : new Date().getFullYear();
      const m = ym ? parseInt(ym[2]) : new Date().getMonth() + 1;

      layout.groups.forEach(g => {
        const staffVals = sheet.getRange(g.staff).getValues();
        const shiftVals = sheet.getRange(g.shift).getValues();
        const offVals = (selLoc !== 'グルホ') ? sheet.getRange(g.office).getValues() : null;

        for (let i = 0; i < staffVals.length; i++) {
          const rawName = String(staffVals[i][0] || "");
          if (!rawName) continue;
          if (selLoc !== 'グルホ' && cleanText(String(offVals[i][0] || "")) !== selLoc) continue;

          const nameKey = rawName.replace(/\s+/g, "");
          const staffNum = staffMaster[nameKey] || "";

          for (let j = 0; j < dateValues.length; j++) {
            const rawCode = cleanText(String(shiftVals[i][j] || ""));
            if (!rawCode) continue;

            let nightType = "";
            if (selLoc === 'グルホ' && rawCode.includes("明")) nightType = "明け勤務";

            let dStr = "", dRaw = dateValues[j];
            if (dRaw instanceof Date) { dStr = Utilities.formatDate(dRaw, "JST", "yyyy-MM-dd"); }
            else if (!isNaN(dRaw)) { dStr = Utilities.formatDate(new Date(y, m - 1, parseInt(dRaw)), "JST", "yyyy-MM-dd"); }

            if (dStr) {
              // 勤務日種別・出勤時刻・退勤時刻はfreee取込み仕様により空白
              csvRows.push([staffNum, rawName.trim(), dStr, rawCode, '', '', '', '', '', '', '', '', '', '', nightType]);
            }
          }
        }
      });
    });

    const fileName = `【${uploadType}】${targetMonth}_${selLoc}_シフト.csv`;
    const blob = Utilities.newBlob(csvRows.map(r => r.join(',')).join('\n'), 'text/csv', fileName);
    DriveApp.getFolderById(CONFIG.OUTPUT_FOLDER_ID).createFile(blob);
    writeLog(user, selLoc, targetMonth, uploadType, "Success");
    return "Complete.\n" + fileName;

  } catch (e) {
    writeLog(user, selLoc, targetMonth, uploadType, "Error: " + e.toString());
    throw e;
  }
}

function getLayout(locName, sheetIdx) {
  const groupA = ['嘉島', '佐土原', '宇城', '新土河原', '玉名', '山鹿', '大矢野'];
  if (locName === 'グルホ') {
    // 1シートに3セクション（行範囲は重複なし）→ 全グループそのまま使用
    return { dateRange: 'H3:AL3', groups: [{ staff: 'C5:C17', shift: 'H5:AL17' }, { staff: 'C20:C32', shift: 'H20:AL32' }, { staff: 'C35:C47', shift: 'H35:AL47' }] };
  } else if (locName === 'cocoro光の森&玉名') {
    return { dateRange: 'J2:AN2', groups: [{ office: 'A22:A73', staff: 'E22:E73', shift: 'J22:AN73' }] };
  } else if (groupA.includes(locName)) {
    // シート0=看護, シート1=リハ, シート2=ケアステ（大矢野）
    const groups = [
      { office: 'A23:A57', staff: 'E23:E57', shift: 'J23:AN57' },
      { office: 'A11:A63', staff: 'E11:E63', shift: 'J11:AN63' },
      { office: 'A22:A57', staff: 'E22:E57', shift: 'J22:AN57' }
    ];
    return { dateRange: 'J2:AN2', groups: [groups[sheetIdx] || groups[0]] };
  } else {
    // シート0=看護, シート1=リハ
    const groups = [
      { office: 'A22:A57', staff: 'E22:E57', shift: 'J22:AN57' },
      { office: 'A10:A48', staff: 'E10:E48', shift: 'J10:AN48' }
    ];
    return { dateRange: 'J2:AN2', groups: [groups[sheetIdx] || groups[0]] };
  }
}

function writeLog(u, l, m, t, r) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!logSheet) { logSheet = ss.insertSheet(CONFIG.LOG_SHEET_NAME); logSheet.appendRow(['Timestamp', 'User', 'Location', 'Month', 'Type', 'Status']); }
  logSheet.appendRow([new Date(), u, l, m, t, r]);
}
