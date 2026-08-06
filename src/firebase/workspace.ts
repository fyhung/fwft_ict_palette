import type { User } from "firebase/auth";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import type { BoardSummary, Classroom, DemoUser } from "../types";
import { db } from "./client";

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

export function subscribeTeacherWorkspace(
  uid: string,
  onData: (classes: Classroom[], boards: BoardSummary[]) => void,
  onError: (error: Error) => void,
) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const memberships = query(collectionGroup(db, "teachers"), where("uid", "==", uid));

  return onSnapshot(memberships, async (snapshot) => {
    try {
      const results = await Promise.all(snapshot.docs.map(async (membership, index) => {
        const classReference = membership.ref.parent.parent;
        if (!classReference) return null;
        const [classSnapshot, boardSnapshots] = await Promise.all([
          getDoc(classReference),
          getDocs(collection(classReference, "boards")),
        ]);
        if (!classSnapshot.exists()) return null;
        const classData = classSnapshot.data();
        const classBoards = boardSnapshots.docs.map((item) => boardFromSnapshot(classReference.id, item));
        const classroom: Classroom = {
          id: classReference.id,
          name: String(classData.name || "Untitled class"),
          description: String(classData.description || ""),
          role: membership.data().role === "owner" ? "owner" : "teacher",
          boardCount: classBoards.length,
          postCount: classBoards.reduce((total, board) => total + board.postCount, 0),
          accent: accents[index % accents.length],
        };
        return { classroom, boards: classBoards };
      }));

      const available = results.filter((item): item is NonNullable<typeof item> => item !== null);
      onData(
        available.map((item) => item.classroom),
        available.flatMap((item) => item.boards),
      );
    } catch (error) {
      onError(error instanceof Error ? error : new Error("WORKSPACE_LOAD_FAILED"));
    }
  }, (error) => onError(error));
}

export async function createOwnedClass(
  user: DemoUser,
  input: { name: string; description: string },
) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const classReference = doc(collection(db, "classes"));
  const membershipReference = doc(classReference, "teachers", user.uid);
  const batch = writeBatch(db);

  batch.set(classReference, {
    name: input.name,
    description: input.description,
    ownerUid: user.uid,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(membershipReference, {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    role: "owner",
    addedAt: serverTimestamp(),
    addedBy: user.uid,
  });
  await batch.commit();
  return classReference.id;
}

export async function deleteEmptyOwnedClass(classId: string) {
  if (!db) throw new Error("FIRESTORE_NOT_CONFIGURED");
  const classReference = doc(db, "classes", classId);
  const [classSnapshot, boardsSnapshot, teachersSnapshot] = await Promise.all([
    getDoc(classReference),
    getDocs(collection(classReference, "boards")),
    getDocs(collection(classReference, "teachers")),
  ]);
  if (!classSnapshot.exists()) return;
  if (!boardsSnapshot.empty) throw new Error("CLASS_NOT_EMPTY");

  const batch = writeBatch(db);
  teachersSnapshot.docs.forEach((teacher) => batch.delete(teacher.ref));
  batch.delete(classReference);
  await batch.commit();
}
