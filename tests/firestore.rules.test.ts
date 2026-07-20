import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
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
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "billflow-rules-test";
const OWNER_UID = "owner-a";
const OTHER_OWNER_UID = "owner-b";
const SALESPERSON_UID = "sales-a";
const OTHER_SALESPERSON_UID = "sales-b";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8089,
      rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "staffIndex", SALESPERSON_UID), {
        businessId: OWNER_UID,
        role: "salesperson",
        status: "active",
      }),
      setDoc(doc(db, "staffIndex", OTHER_SALESPERSON_UID), {
        businessId: OTHER_OWNER_UID,
        role: "salesperson",
        status: "active",
      }),
      setDoc(doc(db, "clients", "client-a"), {
        businessId: OWNER_UID,
        userId: OWNER_UID,
        name: "Allowed Client",
        email: "client@example.com",
        createdAt: new Date(),
      }),
      setDoc(doc(db, "clients", "client-b"), {
        businessId: OTHER_OWNER_UID,
        userId: OTHER_OWNER_UID,
        name: "Other Client",
        email: "other@example.com",
        createdAt: new Date(),
      }),
      setDoc(doc(db, "products", "product-a"), {
        businessId: OWNER_UID,
        userId: OWNER_UID,
        name: "Restricted Product",
        price: 25,
        cost: 10,
        stockQty: 20,
      }),
      setDoc(doc(db, "businessProfiles", OWNER_UID), {
        businessId: OWNER_UID,
        businessName: "Owner A",
        currency: "GHS",
      }),
      setDoc(doc(db, "invoices", "invoice-a"), {
        businessId: OWNER_UID,
        userId: SALESPERSON_UID,
        source: "pos",
        amount: 25,
      }),
      setDoc(doc(db, "payments", "payment-a"), {
        businessId: OWNER_UID,
        userId: SALESPERSON_UID,
        source: "pos",
        amount: 25,
      }),
      setDoc(doc(db, "suppliers", "supplier-a"), {
        businessId: OWNER_UID,
        name: "Restricted Supplier",
      }),
      setDoc(doc(db, "purchaseOrders", "po-a"), {
        businessId: OWNER_UID,
        supplierId: "supplier-a",
      }),
      setDoc(doc(db, "creditNotes", "credit-a"), {
        businessId: OWNER_UID,
        amount: 5,
      }),
      setDoc(doc(db, "vouchers", "voucher-a"), {
        businessId: OWNER_UID,
        code: "SECRET",
      }),
      setDoc(doc(db, "stockMovements", "movement-a"), {
        businessId: OWNER_UID,
        productId: "product-a",
        delta: -1,
      }),
      setDoc(doc(db, "staff", "staff-a"), {
        businessId: OWNER_UID,
        email: "sales@example.com",
        role: "salesperson",
        status: "active",
        staffUid: SALESPERSON_UID,
      }),
      setDoc(doc(db, "shifts", "shift-a"), {
        businessId: OWNER_UID,
        userId: SALESPERSON_UID,
        userName: "Sales A",
        openingCash: 100,
        openedAt: new Date(),
        status: "open",
        totalSales: 25,
        paymentBreakdown: { card: 25 },
      }),
      setDoc(doc(db, "shifts", "shift-other"), {
        businessId: OWNER_UID,
        userId: "another-user",
        userName: "Another User",
        openingCash: 50,
        openedAt: new Date(),
        status: "open",
      }),
    ]);
  });
});

function salespersonDb() {
  return testEnv.authenticatedContext(SALESPERSON_UID, {
    email: "sales@example.com",
  }).firestore();
}

function ownerDb() {
  return testEnv.authenticatedContext(OWNER_UID, {
    email: "owner@example.com",
  }).firestore();
}

describe("salesperson Clients access", () => {
  it("allows reading clients only from the assigned business", async () => {
    const db = salespersonDb();
    await assertSucceeds(getDoc(doc(db, "clients", "client-a")));
    await assertFails(getDoc(doc(db, "clients", "client-b")));
    await assertSucceeds(
      getDocs(query(collection(db, "clients"), where("businessId", "==", OWNER_UID)))
    );
    await assertFails(getDocs(collection(db, "clients")));
  });

  it("allows creating and deleting a client in the assigned business", async () => {
    const db = salespersonDb();
    const created = await assertSucceeds(addDoc(collection(db, "clients"), {
      businessId: OWNER_UID,
      userId: SALESPERSON_UID,
      name: "New Client",
      email: "new@example.com",
      phone: "",
      business: "",
      createdAt: serverTimestamp(),
    }));
    await assertSucceeds(deleteDoc(created));
  });

  it("denies creating clients for another business or another user", async () => {
    const db = salespersonDb();
    await assertFails(addDoc(collection(db, "clients"), {
      businessId: OTHER_OWNER_UID,
      userId: SALESPERSON_UID,
      name: "Wrong Business",
      email: "wrong@example.com",
      createdAt: serverTimestamp(),
    }));
    await assertFails(addDoc(collection(db, "clients"), {
      businessId: OWNER_UID,
      userId: OWNER_UID,
      name: "Wrong Creator",
      email: "wrong@example.com",
      createdAt: serverTimestamp(),
    }));
  });
});

describe("salesperson POS shift access", () => {
  it("allows reading only the caller's shifts", async () => {
    const db = salespersonDb();
    await assertSucceeds(getDoc(doc(db, "shifts", "shift-a")));
    await assertFails(getDoc(doc(db, "shifts", "shift-other")));
    await assertSucceeds(
      getDocs(query(
        collection(db, "shifts"),
        where("businessId", "==", OWNER_UID),
        where("userId", "==", SALESPERSON_UID),
        where("status", "==", "open")
      ))
    );
  });

  it("allows opening and closing only the caller's shift", async () => {
    const db = salespersonDb();
    const created = await assertSucceeds(addDoc(collection(db, "shifts"), {
      businessId: OWNER_UID,
      userId: SALESPERSON_UID,
      userName: "Sales A",
      openingCash: 75,
      openedAt: serverTimestamp(),
      status: "open",
    }));

    await assertSucceeds(updateDoc(doc(db, "shifts", "shift-a"), {
      closedAt: serverTimestamp(),
      actualCash: 100,
      expectedCash: 100,
      cashDifference: 0,
      status: "closed",
    }));

    await assertFails(updateDoc(created, { openingCash: 1000 }));
  });

  it("denies tampering with server-maintained shift totals", async () => {
    const db = salespersonDb();
    await assertFails(updateDoc(doc(db, "shifts", "shift-a"), {
      totalSales: 999999,
      paymentBreakdown: { card: 999999 },
    }));
  });
});

describe("salesperson forbidden collections", () => {
  const forbiddenDocuments = [
    ["products", "product-a"],
    ["businessProfiles", OWNER_UID],
    ["invoices", "invoice-a"],
    ["payments", "payment-a"],
    ["suppliers", "supplier-a"],
    ["purchaseOrders", "po-a"],
    ["creditNotes", "credit-a"],
    ["vouchers", "voucher-a"],
    ["stockMovements", "movement-a"],
    ["staff", "staff-a"],
  ] as const;

  it.each(forbiddenDocuments)("denies reading %s", async (collectionName, documentId) => {
    const db = salespersonDb();
    await assertFails(getDoc(doc(db, collectionName, documentId)));
  });

  it("denies direct sale, inventory, and settings writes", async () => {
    const db = salespersonDb();
    await assertFails(updateDoc(doc(db, "products", "product-a"), { stockQty: 19 }));
    await assertFails(setDoc(doc(db, "invoices", "direct-sale"), {
      businessId: OWNER_UID,
      userId: SALESPERSON_UID,
      source: "pos",
      amount: 25,
    }));
    await assertFails(setDoc(doc(db, "payments", "direct-payment"), {
      businessId: OWNER_UID,
      userId: SALESPERSON_UID,
      source: "pos",
      amount: 25,
    }));
    await assertFails(updateDoc(doc(db, "businessProfiles", OWNER_UID), {
      businessName: "Hijacked",
    }));
  });

  it("allows reading only the caller's own staffIndex entry", async () => {
    const db = salespersonDb();
    await assertSucceeds(getDoc(doc(db, "staffIndex", SALESPERSON_UID)));
    await assertFails(getDoc(doc(db, "staffIndex", OTHER_SALESPERSON_UID)));
    await assertFails(getDocs(collection(db, "staffIndex")));
  });
});

describe("owner compatibility", () => {
  it("preserves owner access to business data", async () => {
    const db = ownerDb();
    await assertSucceeds(getDoc(doc(db, "products", "product-a")));
    await assertSucceeds(updateDoc(doc(db, "products", "product-a"), { stockQty: 30 }));
    await assertSucceeds(getDoc(doc(db, "invoices", "invoice-a")));
    await assertSucceeds(getDoc(doc(db, "staff", "staff-a")));
    await assertSucceeds(getDoc(doc(db, "businessProfiles", OWNER_UID)));
  });
});

describe("invitation claim", () => {
  it("allows a pending invitee to atomically claim only their matching invitation", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "staff", "pending-staff"), {
        businessId: OWNER_UID,
        email: "new-sales@example.com",
        role: "salesperson",
        status: "pending",
        inviteToken: "token",
      });
    });

    const db = testEnv.authenticatedContext("new-sales", {
      email: "new-sales@example.com",
    }).firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, "staff", "pending-staff"), {
      staffUid: "new-sales",
      status: "active",
      inviteToken: null,
    });
    batch.set(doc(db, "staffIndex", "new-sales"), {
      businessId: OWNER_UID,
      role: "salesperson",
      status: "active",
      staffId: "pending-staff",
    });
    await assertSucceeds(batch.commit());
  });
});
