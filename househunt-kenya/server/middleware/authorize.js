export function authorize(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user?.role?.toUpperCase();

    if (!userRole || !allowedRoles.some((role) => role.toUpperCase() === userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource',
        data: null,
        errors: [{ field: 'role', message: 'Insufficient permissions' }],
      });
    }

    return next();
  };
}
