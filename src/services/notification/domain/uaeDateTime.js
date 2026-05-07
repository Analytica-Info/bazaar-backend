'use strict';

const clock = require('../../../utilities/clock');

/**
 * Returns the current moment as a Date object with UAE (+04:00) offset context.
 * Used for scheduled notification comparison and createdAt stamping.
 */
function getUaeDateTime() {
  const now = clock.now();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === 'year').value);
  const month = parseInt(parts.find(p => p.type === 'month').value) - 1;
  const day = parseInt(parts.find(p => p.type === 'day').value);
  const hour = parseInt(parts.find(p => p.type === 'hour').value);
  const minute = parseInt(parts.find(p => p.type === 'minute').value);
  const second = parseInt(parts.find(p => p.type === 'second').value);
  const milliseconds = now.getMilliseconds();

  return new Date(
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` +
    `T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}` +
    `.${String(milliseconds).padStart(3, '0')}+04:00`
  );
}

module.exports = { getUaeDateTime };
