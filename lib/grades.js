const RECORD_KEYS = ['id', 'lastName', 'firstName', 'middleInitial', 'section', 'subject', 'grade'];
const ID_SEPARATORS = /[\s\u002d\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/gu;

let cachedSource;
let cachedRoster;

/** Accept only 10 or 11 ASCII digits after removing whitespace and dash variants. */
export function normalizeStudentId(value) {
    if (typeof value !== 'string' || value.length > 80) return null;
    const normalized = value.replace(ID_SEPARATORS, '');
    return /^\d{10,11}$/.test(normalized) ? normalized : null;
}

function textField(value, maximum, allowEmpty = false) {
    return typeof value === 'string'
        && value.length <= maximum
        && (allowEmpty || value.trim().length > 0)
        && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validatedRecord(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid roster');
    if (Object.keys(row).length !== RECORD_KEYS.length || RECORD_KEYS.some(key => !Object.hasOwn(row, key))) {
        throw new Error('Invalid roster');
    }
    if (!normalizeStudentId(row.id)
        || !textField(row.lastName, 100)
        || !textField(row.firstName, 100)
        || !textField(row.middleInitial, 12, true)
        || !textField(row.section, 24)
        || !textField(row.subject, 180)
        || typeof row.grade !== 'string'
        || !/^(?:[1-4]\.\d|5\.0)$/.test(row.grade)) {
        throw new Error('Invalid roster');
    }
    // Return only the documented fields; never expose server configuration or arbitrary data.
    return Object.freeze(Object.fromEntries(RECORD_KEYS.map(key => [key, row[key].trim()])));
}

function parseRoster(source) {
    if (typeof source !== 'string' || !source.trim()) throw new Error('Roster unavailable');
    const rows = JSON.parse(source);
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('Invalid roster');
    const roster = new Map();
    for (const row of rows) {
        const record = validatedRecord(row);
        const normalizedId = normalizeStudentId(record.id);
        if (roster.has(normalizedId)) throw new Error('Duplicate student ID');
        roster.set(normalizedId, record);
    }
    return roster;
}

/** The roster remains in server memory and is never part of the public directory. */
export function findGrade(normalizedId) {
    const source = process.env.GRADES_JSON;
    if (source !== cachedSource || cachedRoster === undefined) {
        cachedSource = source;
        try {
            cachedRoster = parseRoster(source);
        } catch {
            // Cache an invalid configuration as unavailable, without exposing the failing data.
            cachedRoster = null;
        }
    }
    if (!cachedRoster) throw new Error('Roster unavailable');
    return cachedRoster.get(normalizedId) ?? null;
}

