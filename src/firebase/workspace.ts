import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { AppRole, BoardComment, BoardPost, BoardSection, BoardSummary, Classroom, DemoUser, StaffCandidate } from "../types";
import { db } from "./client";

export const APP_OWNER_EMAIL = "fyhung@twghfwfts.edu.hk";
const accents = ["copper", "moss", "ink"];

export async function upsertUserProfile(user: User) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const reference = doc(db, "users", user.uid);
  const existing = await getDoc(reference);
  await setDoc(reference, {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "Google user",
    email: user.email || "",
    photoURL: user.photoURL || "",
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
    lastLoginAt: serverTimestamp(),
  }, { merge: true });
}

export function subscribeApplicationRole(
  user: DemoUser,
  onRole: (role: AppRole) => void,
  onError: (error: Error) => void,
) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  if (user.email.toLowerCase() === APP_OWNER_EMAIL) {
    onRole("owner");
    return () => {};
  }

  return onSnapshot(doc(db, "staff", user.uid), (snapshot) => {
    onRole(snapshot.exists() && snapshot.data().role === "teacher" ? "teacher" : "student");
  }, (error) => onError(error));
}

function boardFromSnapshot(classId: string, snapshot: QueryDocumentSnapshot<DocumentData>): BoardSummary {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    classId,
    title: String(data.title || "Untitled board"),
    description: String(data.description || ""),
    status: data.status === "archived" ? "archived" : "active",
    allowPosting: data.allowPosting === true,
    allowComments: data.allowComments === true,
    postCount: Number(data.postCount || 0),
    commentCount: Number(data.commentCount || 0),
    contributorCount: Number(data.contributorCount || 0),
    updatedLabel: "No activity yet",
    postColumns: Math.min(4, Math.max(1, Math.round(Number(data.postColumns) || 1))) as 1 | 2 | 3 | 4,
    thumbnailMode: data.thumbnailMode === "original" ? "original" : "crop",
  };
}

function sectionFromSnapshot(boardId: string, snapshot: QueryDocumentSnapshot<DocumentData>): BoardSection {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    boardId,
    title: String(data.title || "Untitled section"),
    note: String(data.note || ""),
    sortOrder: Number(data.sortOrder || 0),
  };
}

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ST";
}

function postFromSnapshot(boardId: string, snapshot: QueryDocumentSnapshot<DocumentData>): BoardPost {
  const data = snapshot.data();
  const authorName = String(data.authorName || "Student");
  const mainImageUrl = String(data.mainImageUrl || "");
  const thumbImageUrl = String(data.thumbImageUrl || "");
  return {
    id: snapshot.id,
    boardId,
    sectionId: String(data.sectionId || ""),
    authorUid: String(data.authorUid || ""),
    authorName,
    authorInitials: initialsFromName(authorName),
    caption: String(data.caption || ""),
    imageUrl: thumbImageUrl || mainImageUrl || undefined,
    mainImageUrl: mainImageUrl || undefined,
    thumbImageUrl: thumbImageUrl || undefined,
    mainFileId: data.mainFileId ? String(data.mainFileId) : undefined,
    thumbFileId: data.thumbFileId ? String(data.thumbFileId) : undefined,
    imageBytes: Number(data.imageBytes || 0),
    thumbBytes: Number(data.thumbBytes || 0),
    visual: "visual-upload",
    createdLabel: "Just now",
    commentCount: Number(data.commentCount || 0),
  };
}

function classroomFromData(
  id: string,
  data: DocumentData,
  index: number,
  uid: string,
  appRole: AppRole,
  classBoards: BoardSummary[],
): Classroom {
  const ownerUid = String(data.ownerUid || "");
  const canManage = appRole === "owner" || ownerUid === uid;
  return {
    id,
    name: String(data.name || "Untitled class"),
    description: String(data.description || ""),
    ownerUid,
    canManage,
    role: appRole === "owner" ? "app owner" : ownerUid === uid ? "owner" : "view only",
    boardCount: classBoards.length,
    postCount: classBoards.reduce((total, board) => total + board.postCount, 0),
    accent: accents[index % accents.length],
  };
}

export function subscribeTeacherWorkspace(
  uid: string,
  appRole: Extract<AppRole, "owner" | "teacher">,
  onData: (classes: Classroom[], boards: BoardSummary[], sections: BoardSection[]) => void,
  onError: (error: Error) => void,
) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");

  return onSnapshot(collection(db, "classes"), async (snapshot) => {
    try {
      const results = await Promise.all(snapshot.docs.map(async (classSnapshot, index) => {
        const boardSnapshots = await getDocs(collection(classSnapshot.ref, "boards"));
        const boardResults = await Promise.all(boardSnapshots.docs.map(async (item) => ({
          board: boardFromSnapshot(classSnapshot.id, item),
          sections: (await getDocs(collection(item.ref, "sections"))).docs.map((section) => sectionFromSnapshot(item.id, section)),
        })));
        const classBoards = boardResults.map((item) => item.board);
        return {
          classroom: classroomFromData(classSnapshot.id, classSnapshot.data(), index, uid, appRole, classBoards),
          boards: classBoards,
          sections: boardResults.flatMap((item) => item.sections),
        };
      }));
      onData(
        results.map((item) => item.classroom),
        results.flatMap((item) => item.boards),
        results.flatMap((item) => item.sections),
      );
    } catch (error) {
      onError(error instanceof Error ? error : new Error("WORKSPACE_LOAD_FAILED"));
    }
  }, (error) => onError(error));
}

export async function loadClassWorkspace(classId: string, uid: string, appRole: AppRole) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const classReference = doc(db, "classes", classId);
  const [classSnapshot, boardSnapshots] = await Promise.all([
    getDoc(classReference),
    getDocs(collection(classReference, "boards")),
  ]);
  if (!classSnapshot.exists()) return null;
  const boardResults = await Promise.all(boardSnapshots.docs.map(async (item) => ({
    board: boardFromSnapshot(classId, item),
    sections: (await getDocs(collection(item.ref, "sections"))).docs.map((section) => sectionFromSnapshot(item.id, section)),
  })));
  const classBoards = boardResults.map((item) => item.board);
  return {
    classroom: classroomFromData(classId, classSnapshot.data(), 0, uid, appRole, classBoards),
    boards: classBoards,
    sections: boardResults.flatMap((item) => item.sections),
  };
}

export async function loadBoardPreviewImages(classId: string, boardId: string, count = 3) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const snapshot = await getDocs(query(
    collection(db, "classes", classId, "boards", boardId, "posts"),
    firestoreLimit(count),
  ));
  return snapshot.docs
    .map((item) => String(item.data().thumbImageUrl || item.data().mainImageUrl || ""))
    .filter(Boolean)
    .slice(0, count);
}

export async function createOwnedClass(
  user: DemoUser,
  input: { name: string; description: string },
) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const classReference = doc(collection(db, "classes"));
  await setDoc(classReference, {
    name: input.name,
    description: input.description,
    ownerUid: user.uid,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return classReference.id;
}

export async function createClassBoard(
  classId: string,
  createdBy: string,
  input: { title: string; description: string },
): Promise<{ board: BoardSummary; section: BoardSection }> {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const boardReference = doc(collection(db, "classes", classId, "boards"));
  const sectionReference = doc(collection(boardReference, "sections"));
  const batch = writeBatch(db);

  batch.set(boardReference, {
    title: input.title,
    description: input.description,
    allowPosting: true,
    allowComments: true,
    postColumns: 1,
    thumbnailMode: "crop",
    status: "active",
    createdBy,
    postCount: 0,
    commentCount: 0,
    contributorCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(sectionReference, {
    title: "Section 1",
    note: "",
    sortOrder: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  return {
    board: {
      id: boardReference.id,
      classId,
      title: input.title,
      description: input.description,
      status: "active",
      allowPosting: true,
      allowComments: true,
      postColumns: 1,
      thumbnailMode: "crop",
      postCount: 0,
      commentCount: 0,
      contributorCount: 0,
      updatedLabel: "Created just now",
    },
    section: {
      id: sectionReference.id,
      boardId: boardReference.id,
      title: "Section 1",
      note: "",
      sortOrder: 0,
    },
  };
}

export function reservePostId(classId: string, boardId: string) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  return doc(collection(db, "classes", classId, "boards", boardId, "posts")).id;
}

export async function createBoardPost(
  classId: string,
  boardId: string,
  postId: string,
  user: DemoUser,
  input: {
    sectionId: string;
    caption: string;
    mainFileId: string;
    thumbFileId: string;
    mainImageUrl: string;
    thumbImageUrl: string;
    imageBytes: number;
    thumbBytes: number;
  },
): Promise<BoardPost> {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  await setDoc(doc(db, "classes", classId, "boards", boardId, "posts", postId), {
    sectionId: input.sectionId,
    authorUid: user.uid,
    authorName: user.displayName,
    authorPhotoURL: user.photoURL || "",
    caption: input.caption,
    mainFileId: input.mainFileId,
    thumbFileId: input.thumbFileId,
    mainImageUrl: input.mainImageUrl,
    thumbImageUrl: input.thumbImageUrl,
    imageBytes: input.imageBytes,
    thumbBytes: input.thumbBytes,
    sortOrder: Date.now(),
    status: "active",
    commentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: postId,
    boardId,
    sectionId: input.sectionId,
    authorUid: user.uid,
    authorName: user.displayName,
    authorInitials: initialsFromName(user.displayName),
    caption: input.caption,
    imageUrl: input.thumbImageUrl,
    mainImageUrl: input.mainImageUrl,
    thumbImageUrl: input.thumbImageUrl,
    mainFileId: input.mainFileId,
    thumbFileId: input.thumbFileId,
    imageBytes: input.imageBytes,
    thumbBytes: input.thumbBytes,
    visual: "visual-upload",
    createdLabel: "Just now",
    commentCount: 0,
  };
}

export function subscribeBoardPosts(
  classId: string,
  boardId: string,
  onData: (posts: BoardPost[]) => void,
  onError: (error: Error) => void,
) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  return onSnapshot(
    collection(db, "classes", classId, "boards", boardId, "posts"),
    (snapshot) => onData(
      [...snapshot.docs]
        .sort((a, b) => Number(a.data().sortOrder || 0) - Number(b.data().sortOrder || 0))
        .map((item) => postFromSnapshot(boardId, item)),
    ),
    (error) => onError(error),
  );
}

export async function updateBoardSettings(
  classId: string,
  boardId: string,
  input: Partial<Pick<BoardSummary, "title" | "description" | "allowPosting" | "allowComments" | "postColumns" | "thumbnailMode">>,
) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  await updateDoc(doc(db, "classes", classId, "boards", boardId), {
    ...input,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBoardData(classId: string, boardId: string) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const boardReference = doc(db, "classes", classId, "boards", boardId);
  const [sectionsSnapshot, postsSnapshot, commentsSnapshot] = await Promise.all([
    getDocs(collection(boardReference, "sections")),
    getDocs(collection(boardReference, "posts")),
    getDocs(collection(boardReference, "comments")),
  ]);
  const batch = writeBatch(db);
  sectionsSnapshot.docs.forEach((item) => batch.delete(item.ref));
  postsSnapshot.docs.forEach((item) => batch.delete(item.ref));
  commentsSnapshot.docs.forEach((item) => batch.delete(item.ref));
  batch.delete(boardReference);
  await batch.commit();
}

export async function createBoardSection(classId: string, boardId: string, title: string, sortOrder: number) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const reference = doc(collection(db, "classes", classId, "boards", boardId, "sections"));
  await setDoc(reference, {
    title,
    note: "",
    sortOrder,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: reference.id, boardId, title, note: "", sortOrder } satisfies BoardSection;
}

export async function renameBoardSection(classId: string, boardId: string, sectionId: string, title: string) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  await updateDoc(doc(db, "classes", classId, "boards", boardId, "sections", sectionId), {
    title,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBoardSection(classId: string, boardId: string, sectionId: string) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  await deleteDoc(doc(db, "classes", classId, "boards", boardId, "sections", sectionId));
}

export async function reorderBoardSections(classId: string, boardId: string, sectionIds: string[]) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const database = db;
  const batch = writeBatch(database);
  sectionIds.forEach((sectionId, sortOrder) => batch.update(
    doc(database, "classes", classId, "boards", boardId, "sections", sectionId),
    { sortOrder, updatedAt: serverTimestamp() },
  ));
  await batch.commit();
}

export async function updateBoardPost(
  classId: string,
  boardId: string,
  postId: string,
  input: { caption: string; sectionId: string },
) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  await updateDoc(doc(db, "classes", classId, "boards", boardId, "posts", postId), {
    caption: input.caption,
    sectionId: input.sectionId,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBoardPostData(classId: string, boardId: string, postId: string) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const commentsSnapshot = await getDocs(collection(db, "classes", classId, "boards", boardId, "comments"));
  const batch = writeBatch(db);
  commentsSnapshot.docs.filter((item) => item.data().postId === postId).forEach((item) => batch.delete(item.ref));
  batch.delete(doc(db, "classes", classId, "boards", boardId, "posts", postId));
  await batch.commit();
}

function commentFromSnapshot(boardId: string, snapshot: QueryDocumentSnapshot<DocumentData>): BoardComment {
  const data = snapshot.data();
  const authorName = String(data.authorName || "Student");
  return {
    id: snapshot.id,
    boardId,
    postId: String(data.postId || ""),
    authorUid: String(data.authorUid || ""),
    authorName,
    authorInitials: initialsFromName(authorName),
    text: String(data.text || ""),
    mainImageUrl: data.mainImageUrl ? String(data.mainImageUrl) : undefined,
    thumbImageUrl: data.thumbImageUrl ? String(data.thumbImageUrl) : undefined,
    mainFileId: data.mainFileId ? String(data.mainFileId) : undefined,
    thumbFileId: data.thumbFileId ? String(data.thumbFileId) : undefined,
    imageBytes: Number(data.imageBytes || 0),
    thumbBytes: Number(data.thumbBytes || 0),
    createdLabel: "Just now",
  };
}

export function reserveCommentId(classId: string, boardId: string) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  return doc(collection(db, "classes", classId, "boards", boardId, "comments")).id;
}

export async function createBoardComment(
  classId: string,
  boardId: string,
  commentId: string,
  user: DemoUser,
  input: Omit<BoardComment, "id" | "boardId" | "authorUid" | "authorName" | "authorInitials" | "createdLabel">,
) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const payload = {
    postId: input.postId,
    authorUid: user.uid,
    authorName: user.displayName,
    authorPhotoURL: user.photoURL || "",
    text: input.text,
    mainFileId: input.mainFileId || null,
    thumbFileId: input.thumbFileId || null,
    mainImageUrl: input.mainImageUrl || null,
    thumbImageUrl: input.thumbImageUrl || null,
    imageBytes: input.imageBytes || 0,
    thumbBytes: input.thumbBytes || 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, "classes", classId, "boards", boardId, "comments", commentId), payload);
}

export function subscribeBoardComments(
  classId: string,
  boardId: string,
  onData: (comments: BoardComment[]) => void,
  onError: (error: Error) => void,
) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  return onSnapshot(collection(db, "classes", classId, "boards", boardId, "comments"), (snapshot) => {
    onData(snapshot.docs.map((item) => commentFromSnapshot(boardId, item)));
  }, onError);
}

export async function updateBoardComment(classId: string, boardId: string, commentId: string, text: string) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  await updateDoc(doc(db, "classes", classId, "boards", boardId, "comments", commentId), {
    text,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBoardCommentData(classId: string, boardId: string, commentId: string) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  await deleteDoc(doc(db, "classes", classId, "boards", boardId, "comments", commentId));
}

export async function deleteEmptyManagedClass(classId: string) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const classReference = doc(db, "classes", classId);
  const [classSnapshot, boardsSnapshot, legacyTeachersSnapshot] = await Promise.all([
    getDoc(classReference),
    getDocs(collection(classReference, "boards")),
    getDocs(collection(classReference, "teachers")),
  ]);
  if (!classSnapshot.exists()) return;
  if (!boardsSnapshot.empty) throw new Error("CLASS_NOT_EMPTY");

  const batch = writeBatch(db);
  legacyTeachersSnapshot.docs.forEach((teacher) => batch.delete(teacher.ref));
  batch.delete(classReference);
  await batch.commit();
}

export async function listStaffCandidates(): Promise<StaffCandidate[]> {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const [usersSnapshot, staffSnapshot] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "staff")),
  ]);
  const approved = new Set(staffSnapshot.docs.filter((item) => item.data().role === "teacher").map((item) => item.id));
  return usersSnapshot.docs
    .map((item) => {
      const data = item.data();
      return {
        uid: item.id,
        displayName: String(data.displayName || data.email || "Google user"),
        email: String(data.email || ""),
        photoURL: data.photoURL ? String(data.photoURL) : undefined,
        approved: approved.has(item.id),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function setTeacherApproval(candidate: StaffCandidate, approved: boolean, approvedBy: string) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const reference = doc(db, "staff", candidate.uid);
  if (!approved) {
    await deleteDoc(reference);
    return;
  }
  await setDoc(reference, {
    uid: candidate.uid,
    displayName: candidate.displayName,
    email: candidate.email,
    role: "teacher",
    approvedAt: serverTimestamp(),
    approvedBy,
  });
}
