/**
 * Configurable Department and Batch Code Mapping for BIT Sathy Student Emails
 */
const DEFAULT_DEPARTMENT_MAP = {
  ad: 'Artificial Intelligence and Data Science (AI&DS)',
  al: 'Artificial Intelligence and Machine Learning (AI&ML)',
  am: 'Artificial Intelligence and Machine Learning (AI&ML)',
  cs: 'Computer Science and Engineering (CSE)',
  it: 'Information Technology (IT)',
  ec: 'Electronics and Communication Engineering (ECE)',
  ee: 'Electrical and Electronics Engineering (EEE)',
  me: 'Mechanical Engineering (MECH)',
  ce: 'Civil Engineering (CIVIL)',
  bt: 'Biotechnology (BT)',
  bm: 'Biomedical Engineering (BME)',
  ag: 'Agricultural Engineering (AGRI)',
  ct: 'Computer Technology (CT)',
  is: 'Information Science and Engineering (ISE)',
  mz: 'Mechatronics Engineering',
  mc: 'Mechatronics Engineering',
  ft: 'Food Technology',
  tx: 'Textile Technology',
  tt: 'Textile Technology',
  fd: 'Fashion Technology'
};

const DEFAULT_COURSE_DURATION_YEARS = 4;
const ALLOWED_DOMAIN = 'bitsathy.ac.in';

/**
 * Parses a student email address to extract and validate department and batch information.
 *
 * Examples:
 * - rahul.ad24@bitsathy.ac.in -> AI&DS, 2024–2028 batch
 * - priya.cs22@bitsathy.ac.in -> CSE, 2022–2026 batch
 * - faculty@bitsathy.ac.in -> Safe fallback (unrecognized pattern)
 *
 * @param {string} email
 * @param {Object} [customDeptMap]
 * @param {number} [courseDuration]
 * @returns {Object}
 */
function parseStudentEmail(email, customDeptMap = DEFAULT_DEPARTMENT_MAP, courseDuration = DEFAULT_COURSE_DURATION_YEARS) {
  if (typeof email !== 'string') {
    return {
      isValidBitEmail: false,
      isRecognizedStudentPattern: false,
      departmentCode: null,
      department: null,
      batchStartYear: null,
      batchEndYear: null,
      batchLabel: null,
      profileCompleted: false
    };
  }

  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');

  if (atIndex <= 0 || atIndex !== normalized.indexOf('@')) {
    return {
      isValidBitEmail: false,
      isRecognizedStudentPattern: false,
      departmentCode: null,
      department: null,
      batchStartYear: null,
      batchEndYear: null,
      batchLabel: null,
      profileCompleted: false
    };
  }

  const localPart = normalized.slice(0, atIndex);
  const domainPart = normalized.slice(atIndex + 1);

  if (domainPart !== ALLOWED_DOMAIN) {
    return {
      isValidBitEmail: false,
      isRecognizedStudentPattern: false,
      departmentCode: null,
      department: null,
      batchStartYear: null,
      batchEndYear: null,
      batchLabel: null,
      profileCompleted: false
    };
  }

  let extractedDeptCode = null;
  let extractedYearDigits = null;

  // Pattern 1: e.g. "rahul.ad24", "name_cs22", "user-ec21", or localPart ending with ".deptYY"
  const suffixMatch = localPart.match(/(?:\.|\b|_|-)([a-z]{2,4})(\d{2})$/);
  if (suffixMatch) {
    extractedDeptCode = suffixMatch[1];
    extractedYearDigits = suffixMatch[2];
  } else {
    // Pattern 2: Roll number pattern, e.g. "7376241ad101" (BIT roll number: 7376 + 2-digit year + 1 + dept + 3-digit roll)
    const rollMatch = localPart.match(/^7376(\d{2})\d([a-z]{2,4})\d{3}$/);
    if (rollMatch) {
      extractedYearDigits = rollMatch[1];
      extractedDeptCode = rollMatch[2];
    }
  }

  // Validate department against the configurable department map
  if (extractedDeptCode && customDeptMap[extractedDeptCode] && extractedYearDigits) {
    const yearNumber = parseInt(extractedYearDigits, 10);
    // Sanity check year (e.g., 2000 to 2099)
    if (!isNaN(yearNumber) && yearNumber >= 0 && yearNumber <= 99) {
      const batchStartYear = 2000 + yearNumber;
      const batchEndYear = batchStartYear + courseDuration;
      const departmentName = customDeptMap[extractedDeptCode];

      return {
        isValidBitEmail: true,
        isRecognizedStudentPattern: true,
        departmentCode: extractedDeptCode,
        department: departmentName,
        batchStartYear,
        batchEndYear,
        batchLabel: `${batchStartYear}–${batchEndYear}`,
        profileCompleted: true
      };
    }
  }

  // Safe fallback for valid @bitsathy.ac.in emails that do not match known student department/batch pattern
  return {
    isValidBitEmail: true,
    isRecognizedStudentPattern: false,
    departmentCode: null,
    department: null,
    batchStartYear: null,
    batchEndYear: null,
    batchLabel: null,
    profileCompleted: false
  };
}

module.exports = {
  DEFAULT_DEPARTMENT_MAP,
  DEFAULT_COURSE_DURATION_YEARS,
  parseStudentEmail
};
