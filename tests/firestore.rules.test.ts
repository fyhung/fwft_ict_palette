import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";

const projectId = "demo-fwft-ict-palette";
const classId = "class-a";
const boardId = "board-a";
const sectionId = "section-a";
const postId = "post-a";

let testEnv: RulesTestEnvironment | undefined;

function env() {
  if (!testEnv) throw new Error("RULES_TEST_ENV_NOT_INITIALIZED");
  return testEnv;
}

function classRef(db: Firestore) {
  return doc(db, "classes", classId);
}

function teacherRef(db: Firestore, uid: string) {
  return doc(db, "classes", classId, "teachers", uid);
}

function boardRef(db: Firestore) {
  return doc(db, "classes", classId, "boards", boardId);
}

function sectionRef(db: Firestore, id = sectionId) {
  return doc(db, "classes", classId, "boards", boardId, "sections", id);
}

function postRef(db: Firestore, id = postId) {
  return doc(db, "classes", classId, "boards", boardId, "posts", id);
}

function commentRef(db: Firestore, id = "comment-a") {
  return doc(db, "classes", classId, "boards", boardId, "comments", id);
}

function validPost(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    sectionId,
    authorUid: uid,
    authorName: "Student",
    authorPhotoURL: "",
    caption: "A force is visible here.",
    mainFileId: "drive-main-file",
    thumbFileId: "drive-thumb-file",
    mainImageUrl: "https://example.invalid/main",
    thumbImageUrl: "https://example.invalid/thumb",
    imageBytes: 120_000,
    thumbBytes: 20_000,
    sortOrder: 0,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function validComment(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    postId,
    authorUid: uid,
    authorName: "Student",
    authorPhotoURL: "",
    text: "Good example.",
    imageBytes: 0,
    thumbBytes: 0,
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

async function seedDatabase() {
  await env().withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(classRef(db), {
      name: "4A Physics",
      description: "Test class",
      ownerUid: "owner",
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(teacherRef(db, "owner"), {
      uid: "owner",
      displayName: "Owner",
      email: "owner@example.test",
      role: "owner",
      addedAt: serverTimestamp(),
      addedBy: "owner",
    });
    await setDoc(teacherRef(db, "teacher"), {
      uid: "teacher",
      displayName: "Teacher",
      email: "teacher@example.test",
      role: "teacher",
      addedAt: serverTimestamp(),
      addedBy: "owner",
    });
    await setDoc(boardRef(db), {
      title: "Forces",
      description: "Test board",
      allowPosting: true,
      allowComments: true,
      status: "active",
      createdBy: "owner",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(sectionRef(db), {
      title: "Balanced forces",
      note: "",
      sortOrder: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(postRef(db), validPost("student-a"));
    await setDoc(commentRef(db), validComment("student-b"));
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await env().clearFirestore();
  await seedDatabase();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("board reading", () => {
  test("anonymous visitors cannot read a board", async () => {
    const db = env().unauthenticatedContext().firestore();
    await assertFails(getDoc(boardRef(db)));
  });

  test("signed-in students can read active board content", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    await assertSucceeds(getDoc(boardRef(db)));
    await assertSucceeds(getDoc(sectionRef(db)));
    await assertSucceeds(getDoc(postRef(db)));
    await assertSucceeds(getDoc(commentRef(db)));
  });
});

describe("student posts", () => {
  test("student can create a valid post as themselves", async () => {
    const db = env().authenticatedContext("student-b").firestore();
    await assertSucceeds(setDoc(postRef(db, "post-b"), validPost("student-b")));
  });

  test("student cannot impersonate another author", async () => {
    const db = env().authenticatedContext("student-b").firestore();
    await assertFails(setDoc(postRef(db, "post-b"), validPost("student-a")));
  });

  test("student cannot post into a missing section", async () => {
    const db = env().authenticatedContext("student-b").firestore();
    await assertFails(setDoc(postRef(db, "post-b"), validPost("student-b", { sectionId: "missing" })));
  });

  test("student cannot post when posting is closed", async () => {
    await env().withSecurityRulesDisabled(async (context) => {
      await updateDoc(boardRef(context.firestore()), { allowPosting: false });
    });
    const db = env().authenticatedContext("student-b").firestore();
    await assertFails(setDoc(postRef(db, "post-b"), validPost("student-b")));
  });

  test("student cannot update placement or ordering", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    await assertFails(updateDoc(postRef(db), { sortOrder: 99 }));
  });

  test("student can delete their own post but not someone else's", async () => {
    const ownerDb = env().authenticatedContext("student-a").firestore();
    const otherDb = env().authenticatedContext("student-b").firestore();
    await assertFails(deleteDoc(postRef(otherDb)));
    await assertSucceeds(deleteDoc(postRef(ownerDb)));
  });
});

describe("comments", () => {
  test("student can create a comment as themselves", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    await assertSucceeds(setDoc(commentRef(db, "comment-b"), validComment("student-a")));
  });

  test("student cannot impersonate a comment author or delete comments", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    await assertFails(setDoc(commentRef(db, "comment-b"), validComment("student-b")));
    await assertFails(deleteDoc(commentRef(db)));
  });

  test("student cannot comment when comments are closed", async () => {
    await env().withSecurityRulesDisabled(async (context) => {
      await updateDoc(boardRef(context.firestore()), { allowComments: false });
    });
    const db = env().authenticatedContext("student-a").firestore();
    await assertFails(setDoc(commentRef(db, "comment-b"), validComment("student-a")));
  });
});

describe("teacher and owner controls", () => {
  test("class teacher can manage sections, posts and comments", async () => {
    const db = env().authenticatedContext("teacher").firestore();
    await assertSucceeds(setDoc(sectionRef(db, "section-b"), {
      title: "Unbalanced forces",
      note: "",
      sortOrder: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(postRef(db), { sortOrder: 2 }));
    await assertSucceeds(deleteDoc(commentRef(db)));
  });

  test("student cannot manage boards or sections", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    await assertFails(updateDoc(boardRef(db), { allowPosting: false }));
    await assertFails(updateDoc(sectionRef(db), { title: "Changed" }));
  });

  test("only the owner can add or remove class teachers", async () => {
    const ownerDb = env().authenticatedContext("owner").firestore();
    const teacherDb = env().authenticatedContext("teacher").firestore();
    const member = {
      uid: "teacher-b",
      displayName: "Teacher B",
      email: "teacher-b@example.test",
      role: "teacher",
      addedAt: serverTimestamp(),
      addedBy: "owner",
    };
    await assertFails(setDoc(teacherRef(teacherDb, "teacher-b"), member));
    await assertSucceeds(setDoc(teacherRef(ownerDb, "teacher-b"), member));
    await assertFails(deleteDoc(teacherRef(teacherDb, "teacher-b")));
    await assertSucceeds(deleteDoc(teacherRef(ownerDb, "teacher-b")));
  });

  test("owner membership can only be removed atomically with its class", async () => {
    const ownerDb = env().authenticatedContext("owner").firestore();
    await assertFails(deleteDoc(teacherRef(ownerDb, "owner")));
    const batch = writeBatch(ownerDb);
    batch.delete(teacherRef(ownerDb, "teacher"));
    batch.delete(teacherRef(ownerDb, "owner"));
    batch.delete(classRef(ownerDb));
    await assertSucceeds(batch.commit());
  });

  test("a signed-in user can atomically create a class they own", async () => {
    const db = env().authenticatedContext("new-owner").firestore();
    const newClass = doc(db, "classes", "new-class");
    const ownerMembership = doc(db, "classes", "new-class", "teachers", "new-owner");
    const batch = writeBatch(db);
    batch.set(newClass, {
      name: "New class",
      description: "",
      ownerUid: "new-owner",
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(ownerMembership, {
      uid: "new-owner",
      displayName: "New Owner",
      email: "new-owner@example.test",
      role: "owner",
      addedAt: serverTimestamp(),
      addedBy: "new-owner",
    });
    await assertSucceeds(batch.commit());
  });

  test("student cannot create a class owned by someone else", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    await assertFails(setDoc(doc(db, "classes", "bad-class"), {
      name: "Bad class",
      description: "",
      ownerUid: "owner",
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });
});

describe("profiles and membership discovery", () => {
  test("users can write only their own profile", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    const profile = {
      uid: "student-a",
      displayName: "Student A",
      email: "student-a@example.test",
      photoURL: "",
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(db, "users", "student-a"), profile));
    await assertFails(setDoc(doc(db, "users", "student-b"), profile));
  });

  test("teacher can discover only their own class memberships", async () => {
    const teacherDb = env().authenticatedContext("teacher").firestore();
    const memberships = query(collection(teacherDb, "classes", classId, "teachers"), where("uid", "==", "teacher"));
    await assertSucceeds(getDocs(memberships));
  });
});
