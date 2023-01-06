'use strict';

/**
 * Check if email is valid.
 * @param {string} email The email.
 * @return {boolean} email is valid.
 */
export function isValidEmail(email: string): boolean {
  if (!email) {
    return false;
  }

  if (email.length>254) {
    return false;
  }

  // eslint-disable-next-line max-len
  const emailRegexp = /^[a-zA-Z\d.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z\d](?:[a-zA-Z\d-]{0,61}[a-zA-Z\d])?(?:\.[a-zA-Z\d](?:[a-zA-Z\d-]{0,61}[a-zA-Z\d])?)*$/;
  const valid = emailRegexp.test(email);
  if (!valid) {
    return false;
  }

  // Further checking of some things regex can't handle
  const parts = email.split('@');
  if (parts[0].length>64) {
    return false;
  }

  const domainParts = parts[1].split('.');
  return !domainParts.some((part) => {
    return part.length > 63;
  });
}

export const hashCode = (data: string): number => {
  let hash = 0;
  let i; let chr;
  if (data.length === 0) return hash;
  for (i = 0; i < data.length; i++) {
    chr = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};
