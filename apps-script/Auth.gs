function verifyFirebaseToken_(idToken) {
  if (!idToken || typeof idToken !== 'string') throw appError_('AUTH_REQUIRED', 'Sign in is required.');
  const apiKey = requiredProperty_('FIREBASE_WEB_API_KEY');
  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey);
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken: idToken }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw appError_('AUTH_INVALID', 'Your sign-in expired. Please sign in again.');
  const payload = JSON.parse(response.getContentText());
  const user = payload.users && payload.users[0];
  if (!user || !user.localId || user.disabled) throw appError_('AUTH_INVALID', 'The signed-in account is unavailable.');
  return { uid: user.localId, email: user.email || '', displayName: user.displayName || '' };
}

function enforceRateLimit_(uid) {
  const cache = CacheService.getScriptCache();
  const minute = Math.floor(Date.now() / 60000);
  const key = 'upload:' + uid + ':' + minute;
  const count = Number(cache.get(key) || '0') + 1;
  if (count > 10) throw appError_('RATE_LIMITED', 'Too many uploads. Please wait a minute and try again.');
  cache.put(key, String(count), 90);
}

function isClassManager_(user, idToken, classId) {
  if (String(user.email || '').toLowerCase() === 'fyhung@twghfwfts.edu.hk') return true;
  const projectId = requiredProperty_('FIREBASE_PROJECT_ID');
  const url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId)
    + '/databases/(default)/documents/classes/' + encodeURIComponent(classId);
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + idToken },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) return false;
  const fields = JSON.parse(response.getContentText()).fields || {};
  return fields.ownerUid && fields.ownerUid.stringValue === user.uid;
}

function isPostOwner_(user, idToken, classId, boardId, postId) {
  const projectId = requiredProperty_('FIREBASE_PROJECT_ID');
  const path = '/databases/(default)/documents/classes/' + encodeURIComponent(classId)
    + '/boards/' + encodeURIComponent(boardId) + '/posts/' + encodeURIComponent(postId);
  const response = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + path, {
    method: 'get', headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) return false;
  const fields = JSON.parse(response.getContentText()).fields || {};
  return fields.authorUid && fields.authorUid.stringValue === user.uid;
}

function requiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw appError_('CONFIG_MISSING', name + ' is not configured.');
  return value;
}
