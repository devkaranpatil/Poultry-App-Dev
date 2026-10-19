function success(res, payload = {}, status = 200, req = null) {
  const response = {
    success: true,
    ...payload,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req?.requestId || null,
    },
  };
  return res.status(status).json(response);
}

function failure(res, message, status = 400, extras = {}, req = null) {
  const response = {
    success: false,
    message,
    ...extras,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req?.requestId || null,
    },
  };
  return res.status(status).json(response);
}

module.exports = { success, failure };
