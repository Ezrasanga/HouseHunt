function isValidEmail(value) {
  return typeof value === 'string' && /^\S+@\S+\.\S+$/.test(value.trim());
}

function isValidName(value) {
  return typeof value === 'string' && value.trim().length >= 2;
}

function isValidRole(value) {
  return value === undefined || value === null || ['TENANT', 'LANDLORD'].includes(String(value).toUpperCase());
}

export function validateProfileUpdateInput(payload) {
  const errors = [];
  const data = payload || {};
  const allowedFields = ['firstName', 'lastName', 'phone', 'profileImage'];
  const updates = {};

  if (!Object.keys(data).length) {
    errors.push({ field: 'profile', message: 'At least one profile field is required' });
    return { success: false, errors };
  }

  for (const field of Object.keys(data)) {
    if (!allowedFields.includes(field)) {
      errors.push({ field, message: 'This field is not allowed for profile updates' });
      continue;
    }

    if (field === 'firstName' || field === 'lastName') {
      const value = typeof data[field] === 'string' ? data[field].trim() : '';
      if (!value || value.length < 2) {
        errors.push({ field, message: 'Must be at least 2 characters' });
      } else {
        updates[field] = value;
      }
      continue;
    }

    if (field === 'phone') {
      const value = typeof data[field] === 'string' ? data[field].trim() : '';
      updates.phone = value;
      continue;
    }

    if (field === 'profileImage') {
      const value = typeof data[field] === 'string' ? data[field].trim() : '';
      updates.profileImage = value;
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: updates };
}

export function validatePasswordChangeInput(payload) {
  const errors = [];
  const data = payload || {};

  if (!data.currentPassword || String(data.currentPassword).trim().length < 1) {
    errors.push({ field: 'currentPassword', message: 'Current password is required' });
  }

  if (!data.newPassword || String(data.newPassword).length < 8) {
    errors.push({ field: 'newPassword', message: 'Password must be at least 8 characters' });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      currentPassword: String(data.currentPassword),
      newPassword: String(data.newPassword),
    },
  };
}

export function validateRegisterInput(payload) {
  const errors = [];
  const data = payload || {};

  if (!data.email || !isValidEmail(data.email)) {
    errors.push({ field: 'email', message: 'Enter a valid email address' });
  }

  if (!data.password || String(data.password).length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  }

  const hasName = isValidName(data.firstName) || isValidName(data.lastName) || isValidName(data.name);
  if (!hasName) {
    errors.push({ field: 'name', message: 'Name must be at least 2 characters' });
  }

  if (!isValidRole(data.role)) {
    errors.push({ field: 'role', message: 'Role must be TENANT or LANDLORD' });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      ...data,
      email: String(data.email).trim().toLowerCase(),
      password: String(data.password),
      role: data.role ? String(data.role).toUpperCase() : 'TENANT',
      firstName: data.firstName ? String(data.firstName).trim() : undefined,
      lastName: data.lastName ? String(data.lastName).trim() : undefined,
      name: data.name ? String(data.name).trim() : undefined,
      phone: data.phone ? String(data.phone).trim() : '',
    },
  };
}

export function validateLoginInput(payload) {
  const errors = [];
  const data = payload || {};

  if (!data.email || !isValidEmail(data.email)) {
    errors.push({ field: 'email', message: 'Enter a valid email address' });
  }

  if (!data.password || String(data.password).length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  }

  if (!isValidRole(data.role)) {
    errors.push({ field: 'role', message: 'Role must be TENANT or LANDLORD' });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      email: String(data.email).trim().toLowerCase(),
      password: String(data.password),
      role: data.role ? String(data.role).toUpperCase() : undefined,
    },
  };
}
