const APP_VERSION = '0.3.0-management';

function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : '';
  if (action !== 'healthCheck') return jsonError_('INVALID_ACTION', 'Unknown action.');
  return json_({ ok: true, version: APP_VERSION, timestamp: new Date().toISOString() });
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    if (body.action === 'uploadProbe') return json_({ ok: true, data: uploadProbe_(body) });
    if (body.action === 'deleteProbe') return json_({ ok: true, data: deleteProbe_(body) });
    if (body.action === 'uploadPostImage') return json_({ ok: true, data: uploadPostImage_(body) });
    if (body.action === 'deletePostFiles') return json_({ ok: true, data: deletePostFiles_(body) });
    if (body.action === 'deletePostTreeFiles') return json_({ ok: true, data: deletePostTreeFiles_(body) });
    if (body.action === 'uploadCommentImage') return json_({ ok: true, data: uploadCommentImage_(body) });
    if (body.action === 'deleteCommentFiles') return json_({ ok: true, data: deleteCommentFiles_(body) });
    if (body.action === 'deleteBoardFiles') return json_({ ok: true, data: deleteBoardFiles_(body) });
    return jsonError_('INVALID_ACTION', 'Unknown action.');
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    const code = error && error.code ? error.code : 'INTERNAL_ERROR';
    const safeMessage = code === 'INTERNAL_ERROR' ? 'The media operation failed.' : String(error.message || code);
    return jsonError_(code, safeMessage);
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) throw appError_('INVALID_REQUEST', 'Request body is missing.');
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (error) {
    throw appError_('INVALID_JSON', 'Request body must be valid JSON.');
  }
  if (!body || typeof body.action !== 'string') throw appError_('INVALID_ACTION', 'Action is required.');
  return body;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function jsonError_(code, message) {
  return json_({ ok: false, error: { code: code, message: message } });
}

function appError_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
