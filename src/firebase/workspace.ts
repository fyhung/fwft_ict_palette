import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { AppRole, BoardSummary, Classroom, DemoUser, StaffCandidate } from "../types";
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
  onData: (classes: Classroom[], boards: BoardSummary[]) => void,
  onError: (error: Error) => void,
) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");

  return onSnapshot(collection(db, "classes"), async (snapshot) => {
    try {
      const results = await Promise.all(snapshot.docs.map(async (classSnapshot, index) => {
        const boardSnapshots = await getDocs(collection(classSnapshot.ref, "boards"));
        const classBoards = boardSnapshots.docs.map((item) => boardFromSnapshot(classSnapshot.id, item));
        return {
          classroom: classroomFromData(classSnapshot.id, classSnapshot.data(), index, uid, appRole, classBoards),
          boards: classBoards,
        };
      }));
      onData(results.map((item) => item.classroom), results.flatMap((item) => item.boards));
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
  const classBoards = boardSnapshots.docs.map((item) => boardFromSnapshot(classId, item));
  return {
    classroom: classroomFromData(classId, classSnapshot.data(), 0, uid, appRole, classBoards),
    boards: classBoards,
  };
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
