/**
 * Vietnamese Lục Bát Programmatic Validator (< 0.2ms, $0 cost)
 * Kiểm tra chuẩn xác:
 *  1. Số câu (>= 8 câu, số chẵn cặp 6-8)
 *  2. Số tiếng mỗi câu (câu lẻ 6 tiếng, câu chẵn 8 tiếng)
 *  3. Gieo vần Bằng chuẩn xác:
 *     - Tiếng 6 câu 6 vần với tiếng 6 câu 8
 *     - Tiếng 8 câu 8 vần với tiếng 6 câu 6 kế tiếp
 */

const STRIP_TONE_MAP = {
  "à": "a", "á": "a", "ả": "a", "ã": "a", "ạ": "a",
  "ằ": "ă", "ắ": "ă", "ẳ": "ă", "ẵ": "ă", "ặ": "ă",
  "ầ": "â", "ấ": "â", "ẩ": "â", "ẫ": "â", "ậ": "â",
  "è": "e", "é": "e", "ẻ": "e", "ẽ": "e", "ẹ": "e",
  "ề": "ê", "ế": "ê", "ể": "ê", "ễ": "ê", "ệ": "ê",
  "ì": "i", "í": "i", "ỉ": "i", "ĩ": "i", "ị": "i",
  "ò": "o", "ó": "o", "ỏ": "o", "õ": "o", "ọ": "o",
  "ồ": "ô", "ố": "ô", "ổ": "ô", "ỗ": "ô", "ộ": "ô",
  "ờ": "ơ", "ớ": "ơ", "ở": "ơ", "ỡ": "ơ", "ợ": "ơ",
  "ù": "u", "ú": "u", "ủ": "u", "ũ": "u", "ụ": "u",
  "ừ": "ư", "ứ": "ư", "ử": "ư", "ữ": "ư", "ự": "ư",
  "ỳ": "y", "ý": "y", "ỷ": "y", "ỹ": "y", "ỵ": "y"
};

// Các thanh Trắc (sắc, hỏi, ngã, nặng); thanh Bằng là không dấu & huyền
const TRAC_CHARS = /[áảãạắẳẵặấẩẫậéẻẽẹếểễệíỉĩịóỏõọốổỗộớởỡợúủũụứửữựýỷỹỵ]/i;

const stripToneOnly = (word) => {
  return String(word || "")
    .toLowerCase()
    .replace(/[^a-zàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/gi, "")
    .split("")
    .map(ch => STRIP_TONE_MAP[ch] || ch)
    .join("");
};

const isBangTone = (word) => !TRAC_CHARS.test(String(word || ""));

/**
 * Tách phần Vần (nucleus + coda) của 1 tiếng tiếng Việt (giữ nguyên nguyên âm đặc trưng â/ă/ê/ô/ơ/ư).
 * VD: "nhà" -> "a", "thân" -> "ân", "ràng" -> "ang", "mây" -> "ây", "hay" -> "ay", "người" -> "ươi"
 */
const extractRhyme = (word) => {
  const clean = stripToneOnly(word);
  if (!clean) return "";

  // Xử lý riêng phụ âm đầu "qu" và "gi" (giữ nguyên âm nếu chỉ có "gi" -> "i", "gì" -> "i")
  let body = clean;
  if (body.startsWith("qu") && body.length > 2) {
    body = body.slice(2);
  } else if (body.startsWith("gi") && body.length > 2 && /[aăâeêioôơuưy]/.test(body[2])) {
    body = body.slice(2);
  } else {
    body = body.replace(/^(ngh|ng|nh|ch|gh|kh|ph|th|tr|[bcdđghklmnpqrstvx])/, "");
  }

  // Chuẩn hóa bán nguyên âm tương đương trong thơ (i/y, uy/i, oa/a, uê/ê, iê/yê)
  body = body
    .replace(/^yê/, "iê")
    .replace(/^y$/, "i")
    .replace(/y$/, "i")
    .replace(/^u([aăâeêiơ])/, "$1")
    .replace(/^o([aăe])/, "$1");

  return body;
};

/**
 * Kiểm tra 2 tiếng tiếng Việt có vần với nhau trong thơ Lục Bát không (chấp nhận cả chính vận & thông vận gần).
 */
const doWordsRhyme = (w1, w2) => {
  const r1 = extractRhyme(w1);
  const r2 = extractRhyme(w2);
  if (!r1 || !r2) return false;
  if (r1 === r2) return true;

  // Chỉ chấp nhận chính vận hoặc thông vận thực sự êm tai trong thơ lục bát
  const nearGroups = [
    ["ai", "ay"],
    ["ao", "au"],
    ["âu", "au"],
    ["em", "êm"],
    ["en", "ên"],
    ["on", "ôn"],
    ["ơi", "ôi", "ươi"],
    ["ưa", "ua"],
    ["iên", "iêng"],
    ["uôn", "uông"]
  ];
  for (const grp of nearGroups) {
    if (grp.includes(r1) && grp.includes(r2)) return true;
  }
  return false;
};

/**
 * Trích xuất các dòng thơ sạch từ phản hồi (bỏ dòng trống, tiêu đề in đậm, câu dẫn mở đầu).
 */
const extractPoemLines = (text) => {
  const rawLines = String(text || "")
    .split("\n")
    .map(l => l.replace(/[*_`~>]/g, "").trim())
    .filter(Boolean);

  // Lọc ra các dòng có số tiếng từ 5..10 (tránh câu chào mở đầu quá dài hoặc tiêu đề ngắn 2-3 chữ)
  const poemLines = [];
  for (const l of rawLines) {
    const words = l.split(/\s+/).map(w => w.replace(/^[^a-zA-ZÀ-ỹ0-9]+|[^a-zA-ZÀ-ỹ0-9]+$/g, "")).filter(Boolean);
    if (words.length >= 5 && words.length <= 10) {
      poemLines.push({ text: l, words });
    }
  }
  return poemLines;
};

/**
 * Kiểm tra toàn diện một bài thơ Lục Bát.
 * @returns {{ valid: boolean, errorCount: number, errors: string[], lineCount: number }}
 */
const validateLucBat = (poemText) => {
  const lines = extractPoemLines(poemText);
  const errors = [];

  if (lines.length < 8) {
    errors.push(`Bài thơ mới có ${lines.length} câu (cần tối thiểu 8 câu chẵn = 4 cặp lục-bát).`);
  }
  if (lines.length % 2 !== 0) {
    errors.push(`Số câu bị lẻ (${lines.length} câu), cần số chẵn cặp 6-8.`);
  }

  for (let i = 0; i < lines.length; i++) {
    const expectedLen = (i % 2 === 0) ? 6 : 8;
    const actualLen = lines[i].words.length;
    if (actualLen !== expectedLen) {
      errors.push(`Câu ${i + 1} ("${lines[i].text}") có ${actualLen} tiếng, cần ĐÚNG ${expectedLen} tiếng.`);
    }
  }

  // Kiểm tra vần từng cặp & vần nối liên cặp
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const luc = lines[i].words;
    const bat = lines[i + 1].words;
    const wLucEnd = luc[luc.length - 1];
    const wBat6 = bat[5] || bat[bat.length - 1];
    if (wLucEnd && wBat6) {
      if (!doWordsRhyme(wLucEnd, wBat6)) {
        errors.push(`Lệch vần trong cặp ${i / 2 + 1}: cuối câu ${i + 1} ("${wLucEnd}", vần -${extractRhyme(wLucEnd)}) KHÔNG vần với chữ 6 câu ${i + 2} ("${wBat6}", vần -${extractRhyme(wBat6)}).`);
      }
      if (!isBangTone(wLucEnd)) {
        errors.push(`Cuối câu ${i + 1} ("${wLucEnd}") đang là thanh Trắc, cần thanh Bằng (không dấu hoặc huyền).`);
      }
    }
    if (i + 2 < lines.length) {
      const wBatEnd = bat[bat.length - 1];
      const nextLuc = lines[i + 2].words;
      const wNextLucEnd = nextLuc[nextLuc.length - 1];
      if (wBatEnd && wNextLucEnd && !doWordsRhyme(wBatEnd, wNextLucEnd)) {
        errors.push(`Gãy vần nối giữa câu ${i + 2} và câu ${i + 3}: cuối câu ${i + 2} ("${wBatEnd}", vần -${extractRhyme(wBatEnd)}) KHÔNG vần với cuối câu ${i + 3} ("${wNextLucEnd}", vần -${extractRhyme(wNextLucEnd)}).`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errorCount: errors.length,
    errors,
    lineCount: lines.length
  };
};

module.exports = {
  extractRhyme,
  doWordsRhyme,
  validateLucBat
};
