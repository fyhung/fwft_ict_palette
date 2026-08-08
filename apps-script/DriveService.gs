const ALLOWED_MIME_TYPES_ = ['image/jpeg', 'image/png', 'image/webp'];
const MAIN_LIMIT_BYTES_ = Math.floor(1.5 * 1024 * 1024);
const THUMB_LIMIT_BYTES_ = 300 * 1024;

function uploadProbe_(body) {
  const user = verifyFirebaseToken_(body.idToken);
  enforceRateLimit_(user.uid);
  const operationId = validId_(body.operationId, 'operationId');
  const root = DriveApp.getFolderById(requiredProperty_('DRIVE_ROOT_FOLDER_ID'));
  const spikeFolder = getOrCreateFolder_(root, '_feasibility-spike');
  const operationFolder = getOrCreateFolder_(spikeFolder, operationId);

  const main = createImageFile_(operationFolder, body.main, 'image.webp', MAIN_LIMIT_BYTES_, {
    app: 'classroom-image-board', version: APP_VERSION, operationId: operationId,
    ownerUid: user.uid, kind: 'probe-main'
  });
  const thumbnail = createImageFile_(operationFolder, body.thumbnail, 'thumb.webp', THUMB_LIMIT_BYTES_, {
    app: 'classroom-image-board', version: APP_VERSION, operationId: operationId,
    ownerUid: user.uid, kind: 'probe-thumb'
  });

  return { operationId: operationId, main: driveMetadata_(main.getId()), thumbnail: driveMetadata_(thumbnail.getId()) };
}

function uploadPostImage_(body) {
  const user = verifyFirebaseToken_(body.idToken);
  enforceRateLimit_(user.uid);
  const classId = validId_(body.classId, 'classId');
  const boardId = validId_(body.boardId, 'boardId');
  const postId = validId_(body.postId, 'postId');
  const root = DriveApp.getFolderById(requiredProperty_('DRIVE_ROOT_FOLDER_ID'));
  const classesFolder = getOrCreateFolder_(root, 'classes');
  const classFolder = getOrCreateFolder_(classesFolder, classId);
  const boardFolder = getOrCreateFolder_(classFolder, boardId);
  const postsFolder = getOrCreateFolder_(boardFolder, 'posts');
  const postFolder = getOrCreateFolder_(postsFolder, postId);
  const baseMetadata = {
    app: 'classroom-image-board', version: APP_VERSION,
    classId: classId, boardId: boardId, contentId: postId,
    ownerUid: user.uid
  };

  const main = createImageFile_(postFolder, body.main, 'image.webp', MAIN_LIMIT_BYTES_, Object.assign({}, baseMetadata, {
    kind: 'post-main'
  }));
  const thumbnail = createImageFile_(postFolder, body.thumbnail, 'thumb.webp', THUMB_LIMIT_BYTES_, Object.assign({}, baseMetadata, {
    kind: 'post-thumb'
  }));

  return { postId: postId, main: driveMetadata_(main.getId()), thumbnail: driveMetadata_(thumbnail.getId()) };
}

function deleteProbe_(body) {
  const user = verifyFirebaseToken_(body.idToken);
  const operationId = validId_(body.operationId, 'operationId');
  const fileIds = Array.isArray(body.fileIds) ? body.fileIds : [];
  fileIds.forEach(function(fileId) {
    const file = DriveApp.getFileById(validDriveId_(fileId));
    const metadata = JSON.parse(file.getDescription() || '{}');
    if (metadata.app !== 'classroom-image-board' || metadata.operationId !== operationId) {
      throw appError_('FILE_NOT_APP_FILE', 'File metadata does not match the operation.');
    }
    if (metadata.ownerUid !== user.uid) throw appError_('FILE_NOT_OWNED', 'You do not own this file.');
    if (!isUnderRoot_(file.getId(), requiredProperty_('DRIVE_ROOT_FOLDER_ID'))) {
      throw appError_('FILE_OUTSIDE_ROOT', 'The file is outside the application media folder.');
    }
    file.setTrashed(true);
  });
  return { operationId: operationId, deleted: fileIds.length };
}

function deletePostFiles_(body) {
  const user = verifyFirebaseToken_(body.idToken);
  const classId = validId_(body.classId, 'classId');
  const boardId = validId_(body.boardId, 'boardId');
  const postId = validId_(body.postId, 'postId');
  const fileIds = Array.isArray(body.fileIds) ? body.fileIds : [];
  fileIds.forEach(function(fileId) {
    const file = DriveApp.getFileById(validDriveId_(fileId));
    let metadata;
    try { metadata = JSON.parse(file.getDescription() || '{}'); }
    catch (error) { throw appError_('FILE_NOT_APP_FILE', 'File metadata is invalid.'); }
    if (metadata.app !== 'classroom-image-board'
      || metadata.classId !== classId
      || metadata.boardId !== boardId
      || metadata.contentId !== postId
      || ['post-main', 'post-thumb'].indexOf(metadata.kind) === -1) {
      throw appError_('FILE_NOT_APP_FILE', 'File metadata does not match the post.');
    }
    if (metadata.ownerUid !== user.uid) throw appError_('FILE_NOT_OWNED', 'You do not own this file.');
    if (!isUnderRoot_(file.getId(), requiredProperty_('DRIVE_ROOT_FOLDER_ID'))) {
      throw appError_('FILE_OUTSIDE_ROOT', 'The file is outside the application media folder.');
    }
    file.setTrashed(true);
  });
  return { postId: postId, deleted: fileIds.length };
}

function createImageFile_(folder, input, filename, byteLimit, metadata) {
  if (!input || ALLOWED_MIME_TYPES_.indexOf(input.mimeType) === -1) throw appError_('INVALID_MIME', 'Unsupported image type.');
  let bytes;
  try { bytes = Utilities.base64Decode(input.base64 || ''); }
  catch (error) { throw appError_('INVALID_IMAGE', 'Image data is invalid.'); }
  if (!bytes.length || bytes.length > byteLimit) throw appError_('FILE_TOO_LARGE', 'Processed image is too large.');
  const blob = Utilities.newBlob(bytes, input.mimeType, filename);
  const file = folder.createFile(blob);
  file.setDescription(JSON.stringify(metadata));
  return file;
}

function driveMetadata_(fileId) {
  // Requires the Advanced Drive service (Drive API v3) to be enabled.
  const file = Drive.Files.get(fileId, { fields: 'id,mimeType,size,webContentLink,resourceKey,parents' });
  return {
    fileId: file.id,
    mimeType: file.mimeType,
    size: Number(file.size || 0),
    webContentLink: file.webContentLink || '',
    resourceKey: file.resourceKey || ''
  };
}

function getOrCreateFolder_(parent, name) {
  const existing = parent.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : parent.createFolder(name);
}

function isUnderRoot_(fileId, rootId) {
  let parents = Drive.Files.get(fileId, { fields: 'parents' }).parents || [];
  const seen = {};
  while (parents.length) {
    const parentId = parents[0];
    if (parentId === rootId) return true;
    if (seen[parentId]) return false;
    seen[parentId] = true;
    parents = (Drive.Files.get(parentId, { fields: 'parents' }).parents || []);
  }
  return false;
}

function validId_(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(value)) throw appError_('INVALID_ID', label + ' is invalid.');
  return value;
}

function validDriveId_(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(value)) throw appError_('INVALID_FILE_ID', 'Drive file ID is invalid.');
  return value;
}
